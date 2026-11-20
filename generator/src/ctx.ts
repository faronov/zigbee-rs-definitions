// Per-definition translation state and shared helpers.
import type {Call, Zhc} from './zhc';
import {Zcl, reportTime} from './zcl';
import {ACCESS, exposeMeta, propertyOf} from './ha';

export class Untranslatable extends Error {
    constructor(public reason: string) {
        super(reason);
    }
}
export const untr = (reason: string): never => {
    throw new Untranslatable(reason);
};

export interface Item {
    item: string; // "m.numeric", "fz.xyz", "inline fromZigbee", "expose foo", ...
    reason: string;
    loc?: string;
}

export class Ctx {
    readonly zcl: Zcl;
    entities: any[] = [];
    configure: any[] = [];
    generic: {exclude: Set<string>; patch: Record<string, any>; disable?: boolean; only_endpoints?: number[]} = {exclude: new Set(), patch: {}};
    device: Record<string, any> = {};
    tuya: Record<string, any> = {};
    templates: any[] = [];
    ignore: any[] = [];
    endpointNames: Record<string, number> = {}; // l1 -> 1
    customClusters: Record<string, any> = {};
    claimed = new Set<any>(); // expose objects accounted for
    claimedProps = new Set<string>(); // expose properties accounted for (DP tables, generic)
    untranslated: Item[] = [];
    dropped: string[] = []; // expose properties without a translation
    noops: string[] = []; // items deliberately ignored (with reason, for the record)
    notes: string[] = [];
    flags = new Set<string>(); // 'tuya', 'template', 'generic'
    genericClusters = new Set<string>(); // clusters served by generic-tier converters
    requires = new Set<string>();
    dpMode = false;
    exposes: {expose: any; owner: any}[] = [];

    constructor(readonly zhc: Zhc, readonly file: string, readonly d: any) {
        this.zcl = new Zcl(zhc.herdsman);
        this.customClusters = {...zhc.customClusters};
    }

    fail(item: string, reason: string, loc?: string) {
        this.untranslated.push({item, reason, loc});
    }

    noop(item: string, reason: string) {
        this.noops.push(`${item}: ${reason}`);
    }

    note(s: string) {
        if (!this.notes.includes(s)) this.notes.push(s);
    }

    claim(exposes: any) {
        for (const e of [].concat(exposes || [])) {
            if (e && typeof e === 'object') {
                this.claimed.add(e);
                this.claimedProps.add(propertyOf(e));
            }
        }
    }

    ep(name: string | undefined): number | undefined {
        if (name === undefined) return undefined;
        if (this.endpointNames[name] !== undefined) return this.endpointNames[name];
        const m = /^(?:l|ep|e|button_|switch_)?(\d+)$/.exec(name);
        return m ? Number(m[1]) : undefined;
    }

    epsFor(names: string[] | undefined): (number | undefined)[] {
        if (!names) return [undefined];
        return names.map((n) => {
            const e = this.ep(n);
            if (e === undefined) untr(`endpoint name "${n}" has no endpoint number`);
            return e;
        });
    }

    patch(key: string, fields: Record<string, any>) {
        this.generic.patch[key] = {...(this.generic.patch[key] || {}), ...fields};
    }

    addEntity(e: any) {
        e.key = snakeKey(e.key);
        // zhc `contact` is true when closed; HA's door class is on when open.
        if (e._meta?.invert && e.platform === 'binary_sensor') invertBool(e);
        // Two zhc items may bind the same key on the same endpoint; keep the first.
        if (this.entities.some((x) => x.key === e.key && (x.ep ?? null) === (e.ep ?? null))) {
            this.note(`duplicate entity ${e.key}${e.ep ? ` (ep ${e.ep})` : ''} dropped`);
            return;
        }
        this.entities.push(e);
    }

    callLoc(c: Call | undefined): string | undefined {
        return c ? this.zhc.callLocation(c) : undefined;
    }
}

// ---- argument checking -----------------------------------------------------

export function hasCode(v: any, depth = 0): boolean {
    if (typeof v === 'function') return true;
    if (!v || typeof v !== 'object' || depth > 4) return false;
    if (v.isModernExtend) return false;
    if (Array.isArray(v)) return v.some((x) => hasCode(x, depth + 1));
    if (v.constructor && v.constructor.name !== 'Object' && !Array.isArray(v)) {
        // Enum/Bitmap values, Expose objects: data, not code
        return false;
    }
    return Object.values(v).some((x) => hasCode(x, depth + 1));
}

// Every key of `args` must be in `known`; values must be data (no functions)
// unless listed in `codeOk`.
export function checkArgs(fn: string, args: any, known: string[], codeOk: string[] = []) {
    if (args === undefined || args === null) return;
    if (typeof args !== 'object') return;
    for (const [k, v] of Object.entries(args)) {
        if (v === undefined) continue;
        if (!known.includes(k)) untr(`${fn}: argument "${k}" not translated`);
        if (!codeOk.includes(k) && hasCode(v)) untr(`${fn}: argument "${k}" is code`);
    }
}

// ---- entity builders -------------------------------------------------------

const ACCESS_NAMES: Record<string, number> = {STATE: 1, SET: 2, STATE_SET: 3, GET: 4, STATE_GET: 5, ALL: 7};
export const accessOf = (a: any, dflt = 'ALL'): number => (typeof a === 'number' ? a : ACCESS_NAMES[a ?? dflt] ?? 7);

// Base fields of an entity from its zhc expose.
export function baseEntity(expose: any, key?: string): any {
    const m = exposeMeta(expose, key);
    const e: any = {key: m.key, platform: m.platform};
    if (m.device_class) e.device_class = m.device_class;
    if (m.unit) e.unit = m.unit;
    if (m.state_class) e.state_class = m.state_class;
    if (m.category) e.category = m.category;
    if (m.enabled === false) e.enabled = false;
    if (m.min !== undefined) e.min = m.min;
    if (m.max !== undefined) e.max = m.max;
    if (m.step !== undefined) e.step = m.step;
    Object.defineProperty(e, '_meta', {value: m, enumerable: false});
    return e;
}

// zhc access -> spec access letters, only when they differ from the platform default.
export function accessField(platform: string, access: number): string | undefined {
    const letters = `${access & ACCESS.GET ? 'r' : ''}${access & ACCESS.SET ? 'w' : ''}${access & ACCESS.STATE ? 'p' : ''}`;
    const dflt: Record<string, string> = {sensor: 'rp', binary_sensor: 'rp', number: 'rwp', select: 'rwp', switch: 'rwp', text: 'rwp', button: 'w'};
    if (!(access & ACCESS.STATE) && dflt[platform] && dflt[platform] !== letters) return letters || undefined;
    return undefined;
}

export function reportField(zhc: Zhc, reporting: any): any {
    if (!reporting) return undefined;
    const tl = zhc.libs.modernExtend.TIME_LOOKUP;
    const min = reportTime(reporting.min, tl);
    const max = reportTime(reporting.max, tl);
    const change = reporting.change;
    if (min === undefined || max === undefined) untr(`reporting interval ${JSON.stringify(reporting)} not understood`);
    if (change !== undefined && typeof change !== 'number') untr('reporting change is not a number');
    return [min, max, change ?? 0];
}

// zhc scale (value = raw / scale) -> mul/div fields.
export function scaleFields(scale: any): Record<string, number> {
    if (scale === undefined || scale === 1) return {};
    if (typeof scale !== 'number' || !Number.isFinite(scale) || scale === 0) untr('scale is not a number');
    if (Number.isInteger(scale)) return scale > 0 ? {div: scale} : {div: -scale, mul: -1};
    const inv = 1 / scale;
    if (Math.abs(inv - Math.round(inv)) < 1e-9) return {mul: Math.round(inv)};
    // decimal fraction: scale = p/q
    for (let q = 10; q <= 1e6; q *= 10) {
        const p = scale * q;
        if (Math.abs(p - Math.round(p)) < 1e-9) return {mul: q, div: Math.round(p)};
    }
    return untr(`scale ${scale} has no exact ratio`);
}

export function slug(s: string): string {
    return String(s)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\+/g, '-plus')
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-.]+|[-.]+$/g, '');
}

export function invertBool(e: any) {
    if (e.value_on !== undefined || e.value_off !== undefined) {
        [e.value_on, e.value_off] = [e.value_off, e.value_on];
        if (e.value_on === undefined) delete e.value_on;
        if (e.value_off === undefined) delete e.value_off;
        if (e.value_on === undefined && e.value_off !== undefined) e.from = `x != ${e.value_off}`, delete e.value_off;
    } else if (e.from) e.from = e.from === '!x' ? 'x' : `!(${e.from})`;
    else e.from = '!x';
    if (e.from === 'x') delete e.from;
}

// Entity keys are snake_case (spec 4.2); zhc has a few camelCase properties.
export function snakeKey(k: string): string {
    return String(k).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'value';
}
