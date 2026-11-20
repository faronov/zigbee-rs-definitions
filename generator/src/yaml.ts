// Canonical YAML emitter for zdef definitions (D22: strict YAML 1.2, core
// schema).
//
// The output is a pure function of the data: fixed key orders per context,
// hexadecimal for IDs, one rule for flow vs. block style, and conservative
// quoting so the text means the same to YAML 1.2 and YAML 1.1 readers
// (`on`, `off`, `yes`, `no`, `12:30`, `0755` are quoted). It never emits
// anchors, tags, multi-line scalars or comments, except a fixed header.

export const TOP_ORDER = [
    'zdef', 'id', 'revision', 'vendor', 'model', 'description', 'source', 'match', 'white_label', 'requires',
    'priority', 'device', 'generic', 'endpoints', 'self_description', 'tuya', 'templates', 'configure', 'ignore',
    'entities', 'gp',
];
export const ENTITY_ORDER = [
    'key', 'platform', 'device_class', 'unit', 'state_class', 'category', 'name', 'enabled', 'ep',
    'zcl', 'tuya', 'struct', 'gp', 'hub', 'parts', 'triggers', 'press', 'event_types',
    'codec', 'invalid', 'map', 'value_on', 'value_off', 'from', 'to', 'mul', 'div', 'offset', 'precision',
    'min', 'max', 'step', 'mode', 'access', 'report', 'reset_after', 'present_if', 'attrs',
];
// Sub-maps: bindings, configure ops, match clauses, device fields.
export const SUB_ORDER = [
    'name', 'vendor', 'model', 'manufacturer', 'ep', 'cluster', 'attr', 'attrs', 'clusters', 'id', 'type', 'mfr',
    'tag', 'codec', 'cmd', 'write', 'read', 'bind', 'report', 'value', 'payload', 'group', 'interval_qs',
    'power', 'sleepy', 'battery', 'checkin_s', 'availability', 'ota', 'exclude', 'only_endpoints', 'disable',
    'patch', 'time_sync', 'force_time_sync_s', 'magic_packet', 'query', 'bind_basic', 'send', 'mcu_version',
    'optimistic', 'dedup', 'any', 'prefix', 'min', 'max', 'params', 'when', 'event', 'attrs_expr',
];
const HEX_KEYS = new Set(['cluster', 'attr', 'mfr', 'id', 'mfr_code', 'device_id', 'manufacturer_id', 'model_id', 'profile']);
const HEX_LIST_KEYS = new Set(['attrs', 'clusters', 'in', 'out']);
const RESERVED = new Set(['y', 'n', 'yes', 'no', 'on', 'off', 'true', 'false', 'null', '~']);
const FLOW_LIMIT = 100;

export function hex(n: number): string {
    return `0x${n.toString(16).toUpperCase().padStart(4, '0')}`;
}

export function quote(s: string): string {
    if (isPlain(s)) return s;
    return JSON.stringify(s);
}

function isPlain(s: string): boolean {
    if (s.length === 0 || s.length > 80) return false;
    if (RESERVED.has(s.toLowerCase())) return false;
    if (/^[-?:,[\]{}#&*!|>'"%@`\s.+0-9]/.test(s)) return false;
    if (/[\s:]$/.test(s) || /: |\s#|[\u0000-\u001f\u007f"'\\{}[\],]/.test(s)) return false;
    if (s.includes(':')) return false; // times, URLs: always quoted
    return true;
}

function num(n: number): string {
    if (Number.isInteger(n)) return String(n);
    const s = String(n);
    return /[.eE]/.test(s) ? s : `${s}.0`;
}

type Ctx = 'top' | 'entity' | 'sub' | 'map' | 'endpoints';

function orderFor(ctx: Ctx): string[] {
    return ctx === 'top' ? TOP_ORDER : ctx === 'entity' ? ENTITY_ORDER : SUB_ORDER;
}

function sortedKeys(obj: Record<string, any>, ctx: Ctx): string[] {
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
    if (ctx === 'map' || ctx === 'endpoints') {
        const allNum = keys.every((k) => /^-?\d+$/.test(k));
        return allNum ? keys.sort((a, b) => Number(a) - Number(b)) : keys;
    }
    const order = orderFor(ctx);
    const rank = (k: string) => {
        const i = order.indexOf(k);
        if (i >= 0) return i;
        return k.startsWith('x-') ? 2000 : 1000;
    };
    return keys.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

// Child context for a key.
function childCtx(key: string, parent: Ctx): Ctx {
    if (key === 'map') return 'map';
    if (key === 'endpoints' && parent === 'top') return 'endpoints';
    if (key === 'entities') return 'entity';
    if (key === 'parts') return 'map';
    if (parent === 'map' && key !== 'map') return 'entity'; // parts: {hvac_mode: {...entity fields}}
    if (key === 'patch') return 'map';
    return 'sub';
}

function scalar(v: any, key: string | null, inHexList: boolean): string {
    if (v === null) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') {
        if ((inHexList || (key && HEX_KEYS.has(key))) && Number.isInteger(v) && v >= 0) return hex(v);
        return num(v);
    }
    return quote(String(v));
}

function mapKey(k: string): string {
    if (/^-?\d+$/.test(k)) return k;
    return quote(k);
}

function flow(v: any, key: string | null, ctx: Ctx): string | null {
    if (v === null || typeof v !== 'object') return scalar(v, key, false);
    if (Array.isArray(v)) {
        const hexList = key !== null && HEX_LIST_KEYS.has(key);
        const parts: string[] = [];
        for (const x of v) {
            const s = x !== null && typeof x === 'object' ? flow(x, key, childCtx(key ?? '', ctx)) : scalar(x, key, hexList);
            if (s === null) return null;
            parts.push(s);
        }
        return `[${parts.join(', ')}]`;
    }
    const parts: string[] = [];
    for (const k of sortedKeys(v, ctx)) {
        const s = flow(v[k], k, childCtx(k, ctx));
        if (s === null) return null;
        parts.push(`${mapKey(k)}: ${s}`);
    }
    return `{${parts.join(', ')}}`;
}

function depth(v: any): number {
    if (v === null || typeof v !== 'object') return 0;
    const xs = Array.isArray(v) ? v : Object.values(v);
    return 1 + Math.max(0, ...xs.map(depth));
}

function emit(v: any, key: string | null, ctx: Ctx, indent: string, out: string[], prefix: string): void {
    // prefix: text before the value on the current line ("key:" or "-")
    if (v === null || typeof v !== 'object') {
        out.push(`${prefix} ${scalar(v, key, false)}`);
        return;
    }
    const isEntityList = key === 'entities' || key === 'configure' || key === 'match' || key === 'white_label';
    const fl = flow(v, key, ctx);
    const tryFlow = fl !== null && depth(v) <= 2 && !(key === 'entities' && Array.isArray(v)) && ctx !== 'top';
    if (tryFlow && prefix.length + 1 + fl.length <= FLOW_LIMIT && !(Array.isArray(v) && isEntityList && v.length > 1 && fl.length > 60)) {
        out.push(`${prefix} ${fl}`);
        return;
    }
    if (Array.isArray(v)) {
        if (v.length === 0) {
            out.push(`${prefix} []`);
            return;
        }
        out.push(prefix);
        for (const x of v) {
            if (x !== null && typeof x === 'object' && !Array.isArray(x)) {
                const inner = flow(x, key, ctx);
                if (inner !== null && depth(x) <= 2 && indent.length + 4 + inner.length <= FLOW_LIMIT && key !== 'entities') {
                    out.push(`${indent}  - ${inner}`);
                } else {
                    const lines: string[] = [];
                    emitMap(x, ctx, `${indent}    `, lines);
                    out.push(`${indent}  - ${lines[0].trimStart()}`);
                    out.push(...lines.slice(1));
                }
            } else emit(x, key, ctx, `${indent}  `, out, `${indent}  -`);
        }
        return;
    }
    out.push(prefix);
    emitMap(v, ctx, `${indent}  `, out);
}

function emitMap(v: Record<string, any>, ctx: Ctx, indent: string, out: string[]): void {
    for (const k of sortedKeys(v, ctx)) {
        emit(v[k], k, childCtx(k, ctx), indent, out, `${indent}${mapKey(k)}:`);
    }
}

export function toYaml(doc: Record<string, any>, header: string[] = []): string {
    const out: string[] = header.map((h) => (h ? `# ${h}` : '#'));
    for (const k of sortedKeys(doc, 'top')) {
        emit(doc[k], k, childCtx(k, 'top'), '', out, `${mapKey(k)}:`);
    }
    return `${out.join('\n')}\n`;
}
