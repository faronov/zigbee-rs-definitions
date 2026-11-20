// Coverage report: per tier, per vendor file, ranked untranslated items.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {Record_} from './translate';

const TIER_NAME: Record<string, string> = {
    A: 'A generic declarative (fully translated)',
    B: 'B Tuya declarative (fully translated)',
    C: 'C vendor template (fully translated, needs a hub template)',
    P: 'P partial (some items untranslated; on demand only)',
};

const pct = (n: number, t: number) => `${((100 * n) / (t || 1)).toFixed(1)} %`;

// Item name for ranking: named items keep their name; inline code is grouped by kind.
function rankKey(u: {item: string; reason: string}): string {
    if (u.item.startsWith('DP ')) return `Tuya value converter: ${u.reason.replace(/ at .*| \(.*\)$/, '')}`;
    if (u.item === 'configure') return `configure: ${u.reason.replace(/: .*/, '')}`;
    if (u.item.startsWith('inline') || u.item === 'onEvent') return `${u.item} (custom code)`;
    if (u.reason.startsWith(`${u.item}:`)) return `${u.item} (${u.reason.slice(u.item.length + 1).trim().replace(/"[^"]*"/g, '…')})`;
    return u.item;
}

export function writeCoverage(dir: string, version: string, recs: Record_[], yamls: string[]) {
    fs.mkdirSync(dir, {recursive: true});
    const total = recs.length;
    const tiers: Record<string, number> = {A: 0, B: 0, C: 0, P: 0};
    for (const r of recs) tiers[r.tier]++;
    const full = tiers.A + tiers.B + tiers.C;

    // items ranked by the number of definitions they block, and by "sole blocker"
    const blocks = new Map<string, {defs: number; sole: number; locs: Set<string>}>();
    for (const r of recs) {
        if (r.tier !== 'P') continue;
        const keys = [...new Set(r.untranslated.map(rankKey))];
        const soleDropOnly = keys.length === 0;
        for (const k of keys) {
            const b = blocks.get(k) || {defs: 0, sole: 0, locs: new Set<string>()};
            b.defs++;
            if (keys.length === 1 && r.dropped.length === 0) b.sole++;
            for (const u of r.untranslated) if (rankKey(u) === k && u.loc && b.locs.size < 3) b.locs.add(u.loc);
            blocks.set(k, b);
        }
        void soleDropOnly;
    }
    const ranked = [...blocks.entries()].sort((a, b) => b[1].defs - a[1].defs || b[1].sole - a[1].sole || (a[0] < b[0] ? -1 : 1));
    const dropOnly = recs.filter((r) => r.tier === 'P' && r.untranslated.length === 0).length;
    const droppedCount = new Map<string, number>();
    for (const r of recs) for (const d of r.dropped) droppedCount.set(d, (droppedCount.get(d) || 0) + 1);

    const byFile = new Map<string, Record<string, number>>();
    for (const r of recs) {
        const f = byFile.get(r.file) || {A: 0, B: 0, C: 0, P: 0};
        f[r.tier]++;
        byFile.set(r.file, f);
    }
    const templates = new Map<string, number>();
    for (const r of recs) if (r.tier === 'C') for (const t of r.templates) templates.set(t, (templates.get(t) || 0) + 1);
    const yamlBytes = yamls.reduce((n, y) => n + Buffer.byteLength(y), 0);

    const L: string[] = [];
    L.push('# Coverage of zigbee-herdsman-converters by herdsman-gen', '');
    L.push(`Generated from zigbee-herdsman-converters **${version}** (${total} definitions). Regenerate with`);
    L.push('`npm run generate`; method in [`generator/README.md`](../generator/README.md).', '');
    L.push('| Tier | Definitions | Share |', '|---|---:|---:|');
    for (const t of ['A', 'B', 'C', 'P']) L.push(`| ${TIER_NAME[t]} | ${tiers[t]} | ${pct(tiers[t], total)} |`);
    L.push(`| **Fully translated (A + B + C)** | **${full}** | **${pct(full, total)}** |`);
    L.push(`| Fully translated without templates (A + B) | ${tiers.A + tiers.B} | ${pct(tiers.A + tiers.B, total)} |`, '');
    L.push(`- Partial definitions whose only gap is an expose without a translated converter: ${dropOnly}.`);
    L.push(`- Canonical YAML written: ${(yamlBytes / 1024).toFixed(0)} KiB in ${total} files.`);
    L.push(`- Coordinator/adapter definitions (excluded from the popularity ranking): ${recs.filter((r) => r.coordinator).length}.`, '');
    if (templates.size) {
        L.push('## Vendor templates used by tier C', '', '| Template | Definitions |', '|---|---:|');
        for (const [t, n] of [...templates.entries()].sort((a, b) => b[1] - a[1])) L.push(`| \`${t}\` | ${n} |`);
        L.push('');
    }
    L.push('## Top untranslated items', '');
    L.push('Ranked by the number of partial definitions they block. "Sole" counts the definitions that become fully');
    L.push('translated if only this item is implemented. Locations are zhc source lines from its source maps.', '');
    L.push('| # | Item | Blocks | Sole | Example locations |', '|---:|---|---:|---:|---|');
    ranked.slice(0, 60).forEach(([k, b], i) => L.push(`| ${i + 1} | ${k.replace(/\|/g, '\\|')} | ${b.defs} | ${b.sole} | ${[...b.locs].map((l) => `\`${l}\``).join(', ')} |`));
    L.push('', '## Most dropped exposes', '', '| Expose | Definitions |', '|---|---:|');
    for (const [k, n] of [...droppedCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) L.push(`| \`${k}\` | ${n} |`);
    L.push('', '## Per vendor file', '', '| File | A | B | C | P | Full |', '|---|---:|---:|---:|---:|---:|');
    for (const [f, c] of [...byFile.entries()].sort((a, b) => (b[1].A + b[1].B + b[1].C + b[1].P) - (a[1].A + a[1].B + a[1].C + a[1].P) || (a[0] < b[0] ? -1 : 1))) {
        const n = c.A + c.B + c.C + c.P;
        L.push(`| ${f} | ${c.A} | ${c.B} | ${c.C} | ${c.P} | ${pct(c.A + c.B + c.C, n)} |`);
    }
    fs.writeFileSync(path.join(dir, 'COVERAGE.md'), `${L.join('\n')}\n`);
    const json = {zhc: version, total, tiers, definitions: recs};
    fs.writeFileSync(path.join(dir, 'coverage.json'), `${JSON.stringify(json, null, 0).replace(/},{"id"/g, '},\n{"id"')}\n`);
}
