// Loading and instrumenting zigbee-herdsman-converters (zhc).
//
// Before any device file is loaded, every exported function of the zhc
// libraries (modernExtend, tuya, philips, lumi, ...) is wrapped. A wrapper
// records which function built a returned object (an extend, a converter, a
// Tuya value converter) together with its arguments and a lazily formatted
// call stack, so the translator knows "this extend is m.numeric({...})
// called at src/devices/efekta.ts:123". Exported converter objects are
// indexed by identity ("fz.on_off", "tuya.fz.datapoints", ...).
//
// Source locations come from zhc's own source maps: Node applies them to
// stack traces (process.setSourceMapsEnabled), and the location of an inline
// function is read through the inspector ([[FunctionLocation]]) and mapped
// with module.findSourceMap.
import * as fs from 'node:fs';
import * as inspector from 'node:inspector';
import * as path from 'node:path';
import {SourceMap} from 'node:module';

export interface Call {
    fn: string; // e.g. "m.numeric", "tuya.modernExtend.dpNumeric", "vcb.lookup"
    args: any[];
    err: Error; // stack formatted lazily, only when a location is needed
}

export interface Zhc {
    dist: string;
    version: string;
    named: Map<any, string>; // exported converter object -> name
    vcNamed: Map<any, string>; // tuya.valueConverter.<name> -> name
    calls: Map<any, Call[]>; // object -> calls that returned it (innermost first)
    libs: Record<string, any>;
    definitions: {file: string; d: any}[];
    fnLocation: (f: Function) => string | undefined;
    callLocation: (c: Call) => string | undefined;
    herdsman: any;
    customClusters: Record<string, any>; // every cluster added through m.deviceAddCustomCluster, by name
}

const quiet = () => {};

export function loadZhc(root: string): Zhc {
    const pkgDir = path.join(root, 'node_modules', 'zigbee-herdsman-converters');
    const dist = path.join(pkgDir, 'dist');
    const version = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version;
    const req = (p: string) => require(path.join(dist, p));

    Error.stackTraceLimit = 40;
    const named = new Map<any, string>();
    const vcNamed = new Map<any, string>();
    const calls = new Map<any, Call[]>();
    const isFz = (o: any) => o && typeof o === 'object' && 'cluster' in o && typeof o.convert === 'function';
    const isTz = (o: any) => o && typeof o === 'object' && Array.isArray(o.key) && (o.convertSet || o.convertGet);

    function nameConverters(obj: any, prefix: string, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 2) return;
        for (const k of Object.keys(obj)) {
            let v: any;
            try {
                v = obj[k];
            } catch {
                continue;
            }
            if (isFz(v) || isTz(v)) {
                if (!named.has(v)) named.set(v, prefix + k);
            } else if (typeof v === 'function' && /^(configure|onEvent)/.test(k)) {
                if (!named.has(v)) named.set(v, prefix + k);
            } else if (v && typeof v === 'object' && !Array.isArray(v)) nameConverters(v, `${prefix}${k}.`, depth + 1);
        }
    }

    const record = (fn: string, args: any[], r: any) => {
        if (!r || (typeof r !== 'object' && typeof r !== 'function') || r instanceof Promise) return;
        const list = calls.get(r) || [];
        list.push({fn, args, err: new Error()});
        calls.set(r, list);
        if (Array.isArray(r)) return;
        // Tag the parts of an extend so a converter can be traced to its extend.
        if (r.isModernExtend) {
            for (const k of ['fromZigbee', 'toZigbee', 'configure', 'onEvent']) {
                for (const it of [].concat(r[k] || [])) {
                    if (it && !calls.has(it)) calls.set(it, [{fn: `${fn}#${k}`, args, err: list[list.length - 1].err}]);
                }
            }
        }
    };

    const fnSrc = (f: Function) => Function.prototype.toString.call(f);
    function wrapExports(obj: any, prefix: string) {
        if (!obj || typeof obj !== 'object') return;
        for (const k of Object.keys(obj)) {
            let f: any;
            try {
                f = obj[k];
            } catch {
                continue;
            }
            if (typeof f !== 'function' || /^[A-Z]/.test(k) || /^class /.test(fnSrc(f)) || f.__zdefWrapped) continue;
            const w = function (this: any, ...a: any[]) {
                const r = f.apply(this, a);
                record(prefix + k, a, r);
                return r;
            };
            (w as any).__zdefWrapped = true;
            (w as any).__zdefOrig = f;
            if (named.has(f)) named.set(w, named.get(f));
            try {
                obj[k] = w;
            } catch {
                /* read-only */
            }
            if (obj[k] !== w) {
                try {
                    Object.defineProperty(obj, k, {value: w, writable: true, configurable: true, enumerable: true});
                } catch {
                    /* keep */
                }
            }
        }
    }

    nameConverters(req('converters/fromZigbee'), 'fz.');
    nameConverters(req('converters/toZigbee'), 'tz.');
    const libs: Record<string, any> = {};
    for (const f of fs.readdirSync(path.join(dist, 'lib')).filter((f) => f.endsWith('.js'))) {
        try {
            libs[f.replace(/\.js$/, '')] = req(`lib/${f}`);
        } catch {
            /* not loadable alone */
        }
    }
    libs.logger.setLogger({debug: quiet, info: quiet, warning: quiet, error: quiet});
    for (const [n, mod] of Object.entries(libs)) if (n !== 'modernExtend') nameConverters(mod, `${n}.`);
    const tuya = libs.tuya;
    for (const [k, v] of Object.entries(tuya.valueConverter)) if (v && typeof v === 'object') vcNamed.set(v, k);
    wrapExports(tuya.valueConverter, 'vcf.');
    wrapExports(tuya.valueConverterBasic, 'vcb.');
    wrapExports(libs.modernExtend, 'm.');
    for (const [n, mod] of Object.entries(libs)) {
        if (n === 'modernExtend' || n === 'logger') continue;
        if (mod.modernExtend) wrapExports(mod.modernExtend, `${n}.modernExtend.`);
        wrapExports(mod, `${n}.`);
        for (const [k, v] of Object.entries(mod)) {
            if (v && typeof v === 'object' && !Array.isArray(v) && !['modernExtend', 'valueConverter', 'valueConverterBasic'].includes(k)) {
                wrapExports(v, `${n}.${k}.`);
            }
        }
    }
    libs.utils.sleep = async () => {};

    const definitions: {file: string; d: any}[] = [];
    for (const f of fs.readdirSync(path.join(dist, 'devices')).filter((f) => f.endsWith('.js')).sort()) {
        for (const d of req(`devices/${f}`).definitions || []) definitions.push({file: f.replace(/\.js$/, ''), d});
    }

    // ---- locations ---------------------------------------------------------
    const session = new inspector.Session();
    session.connect();
    const scripts = new Map<string, string>();
    session.on('Debugger.scriptParsed', (m: any) => scripts.set(m.params.scriptId, m.params.url));
    session.post('Debugger.enable', () => {});
    const rel = (p: string) => {
        const i = p.indexOf('zigbee-herdsman-converters/');
        return i >= 0 ? p.slice(i + 'zigbee-herdsman-converters/'.length) : path.relative(root, p);
    };
    const fnLocation = (f: Function): string | undefined => {
        if (typeof f !== 'function') return undefined;
        while ((f as any).__zdefOrig) f = (f as any).__zdefOrig; // location of the zhc function, not of our wrapper
        (globalThis as any).__zdefProbe = f;
        let loc: any;
        session.post('Runtime.evaluate', {expression: 'globalThis.__zdefProbe'}, (_e: any, r: any) => {
            if (!r?.result?.objectId) return;
            session.post('Runtime.getProperties', {objectId: r.result.objectId}, (_e2: any, p: any) => {
                loc = p?.internalProperties?.find((x: any) => x.name === '[[FunctionLocation]]')?.value?.value;
            });
        });
        if (!loc) return undefined;
        const url = scripts.get(loc.scriptId);
        if (!url) return undefined;
        return mapped(url.replace(/^file:\/\//, ''), loc.lineNumber, loc.columnNumber);
    };
    // zhc's .js.map files, parsed once each
    const maps = new Map<string, any>();
    const mapped = (file: string, line0: number, col0: number): string => {
        if (!maps.has(file)) {
            let sm: any = null;
            try {
                sm = new SourceMap(JSON.parse(fs.readFileSync(`${file}.map`, 'utf8')));
            } catch {
                sm = null;
            }
            maps.set(file, sm);
        }
        const sm = maps.get(file);
        const entry: any = sm?.findEntry(line0, col0);
        if (entry && entry.originalSource) {
            const src = path.resolve(path.dirname(file), entry.originalSource.replace(/^file:\/\//, ''));
            return `${rel(src)}:${entry.originalLine + 1}`;
        }
        return `${rel(file)}:${line0 + 1}`;
    };
    const callLocation = (c: Call): string | undefined => {
        const lines = String(c.err.stack || '').split('\n').slice(1);
        // The first frame is the wrapper (this file); then the frames of zhc.
        // Prefer the first frame in a device file; else the first zhc frame.
        let first: string | undefined;
        for (const l of lines) {
            const m = /\(?([^()\s]+):(\d+):(\d+)\)?$/.exec(l.trim());
            if (!m || !m[1].includes('zigbee-herdsman-converters/')) continue;
            const loc = mapped(m[1].replace(/^file:\/\//, ''), Number(m[2]) - 1, Number(m[3]) - 1);
            if (!first) first = loc;
            if (loc.includes('/devices/')) return loc;
        }
        return first;
    };
    const herdsman = require(path.join(root, 'node_modules', 'zigbee-herdsman'));
    const customClusters: Record<string, any> = {};
    for (const list of calls.values()) {
        for (const c of list) {
            if (c.fn !== 'm.deviceAddCustomCluster') continue;
            const [name, def] = c.args;
            const prev = customClusters[name];
            customClusters[name] = prev && prev.ID === def.ID
                ? {...prev, ...def, attributes: {...prev.attributes, ...def.attributes}, commands: {...prev.commands, ...def.commands}}
                : prev ?? def;
        }
    }
    return {dist, version, named, vcNamed, calls, libs, definitions, fnLocation, callLocation, herdsman, customClusters};
}
