// Translation of one zhc definition into a zdef definition document.
import type {Call, Zhc} from './zhc';
import {Ctx, Untranslatable, slug} from './ctx';
import {BATTERY_CURVES, MODERN, type ExtTranslator} from './modern';

/** zhc fingerprint `type` -> zdef match `logical_type`. */
const LOGICAL_TYPES: Record<string, string> = {Coordinator: 'coordinator', Router: 'router', EndDevice: 'end_device'};
import {TUYA_EXT, translateDpTable, tuyaOnEvent} from './tuya';
import {VENDOR_EXT, VENDOR_NAMED, addFeature, claimForFamilies, familyOf} from './vendor';
import {STD, STD_REASON, exposeClusters, fzClusters} from './named';
import {isMagicPacket, replay, translateOps} from './configure';
import {propertyOf} from './ha';

const EXT: Record<string, ExtTranslator> = {...MODERN, ...TUYA_EXT, ...VENDOR_EXT};

export interface Record_ {
    id: string;
    file: string;
    vendor: string;
    model: string;
    tier: 'A' | 'B' | 'C' | 'P';
    flags: string[];
    untranslated: {item: string; reason: string; loc?: string}[];
    dropped: string[];
    noops: string[];
    notes: string[];
    requires: string[];
    templates: string[];
    where: string;
    identifiers: string[];
    description: string;
    entities: number;
    coordinator: boolean;
}

// IAS zone fz converters: zhc decides the zone semantics, not the ZoneType attribute.
const IAS_FZ: Record<string, [string, number, string][]> = {
    'fz.ias_contact_alarm_1': [['contact', 0, 'door']], 'fz.ias_contact_alarm_1_report': [['contact', 0, 'door']],
    'fz.ias_occupancy_alarm_1': [['occupancy', 0, 'occupancy']], 'fz.ias_occupancy_alarm_1_report': [['occupancy', 0, 'occupancy']],
    'fz.ias_occupancy_alarm_2': [['occupancy', 1, 'occupancy']], 'fz.ias_occupancy_only_alarm_2': [['occupancy', 1, 'occupancy']],
    'fz.ias_water_leak_alarm_1': [['water_leak', 0, 'moisture']], 'fz.ias_water_leak_alarm_1_report': [['water_leak', 0, 'moisture']],
    'fz.ias_smoke_alarm_1': [['smoke', 0, 'smoke']], 'fz.ias_gas_alarm_1': [['gas', 0, 'gas']], 'fz.ias_gas_alarm_2': [['gas', 1, 'gas']],
    'fz.ias_carbon_monoxide_alarm_1': [['carbon_monoxide', 0, 'carbon_monoxide']], 'fz.ias_vibration_alarm_1': [['vibration', 0, 'vibration']],
    'fz.ias_sos_alarm_2': [['sos', 1, 'safety']], 'fz.ias_alarm_only_alarm_1': [['alarm', 0, 'safety']],
};

// Coordinator / NCP / adapter hardware (USB and network adapters running
// router firmware): excluded from the popularity ranking, because the
// Zigbee2MQTT issue template asks every reporter for the adapter (spec 17.2).
// Genuine router products (repeaters, Ubisys R0) are not adapters.
export const ADAPTER_DESCRIPTION = /\b(coordinator|with router firmware|adapter with router|usb (stick|dongle|adapter)|zigbee (usb )?(stick|dongle)|dongle (plus|max|lite)|zigbee-ethernet|ethernet router|bridge router)\b/i;
export const ADAPTER_MODEL = /^(SLZB-|ZBDongle|Dongle-|tubeszb|CC2530\.ROUTER|CC2531|EFR32MG21\.Router|Silabs series 2 router|ZREL$|SkyConnect|ZBT-1$|ConBee|RaspBee|UZG-|XZG)/i;

export function isCoordinator(d: any): boolean {
    if (ADAPTER_DESCRIPTION.test(String(d.description ?? ''))) return true;
    return ADAPTER_MODEL.test(String(d.model)) || (d.zigbeeModel || []).some((z: string) => ADAPTER_MODEL.test(String(z)));
}

function exposesOf(ctx: Ctx, src: any, owner: any) {
    if (!src) return;
    const list = typeof src === 'function' ? safeCall(src) : src;
    for (const e of [].concat(list || [])) {
        if (typeof e === 'function') {
            for (const x of [].concat(safeCall(e) || [])) if (x && typeof x === 'object') ctx.exposes.push({expose: x, owner});
        } else if (e && typeof e === 'object') ctx.exposes.push({expose: e, owner});
    }
}

function safeCall(f: Function): any {
    for (const args of [[undefined, {}], [{endpoints: [], getEndpoint: () => undefined, modelID: '', manufacturerName: ''}, {}]]) {
        try {
            const r = f(...args);
            if (r) return r;
        } catch {
            /* try next */
        }
    }
    return [];
}

function chainOf(zhc: Zhc, ext: any): Call[] {
    return zhc.calls.get(ext) || [];
}

function translateExtend(ctx: Ctx, ext: any) {
    const chain = chainOf(ctx.zhc, ext);
    if (!chain.length) {
        const f = [].concat(ext.fromZigbee || [], ext.toZigbee || [])[0] as any;
        const loc = f ? ctx.zhc.fnLocation(f.convert || f.convertSet || f.convertGet) : undefined;
        ctx.fail('inline extend', 'inline modernExtend object (custom code)', loc);
        return;
    }
    for (let i = chain.length - 1; i >= 0; i--) {
        const c = chain[i];
        const t = EXT[c.fn];
        if (!t) continue;
        if (i < chain.length - 1 && !partsFrom(ctx.zhc, ext, c.fn)) break; // outer wrapper added its own parts
        const snapshot = {entities: ctx.entities.length, configure: ctx.configure.length};
        try {
            t(ctx, c, ext);
        } catch (e: any) {
            const outer = chain[chain.length - 1];
            if (!(e instanceof Untranslatable)) return ctx.fail(outer.fn, `generator error: ${e?.message ?? e}`, ctx.callLoc(outer));
            const fam = familyOf(outer.fn);
            if (fam && !/is code|inline|custom/.test(e.reason)) {
                // data translation needs more than the v1 format: the family template implements the helper
                ctx.entities.length = snapshot.entities;
                ctx.configure.length = snapshot.configure;
                try {
                    addFeature(ctx, fam, outer.fn, outer.args);
                    ctx.note(`${outer.fn} as template feature: ${e.reason}`);
                    return;
                } catch (e2: any) {
                    if (!(e2 instanceof Untranslatable)) throw e2;
                }
            }
            ctx.fail(outer.fn, e.reason, ctx.callLoc(outer));
        }
        return;
    }
    const outer = chain[chain.length - 1];
    const fam = familyOf(outer.fn);
    if (fam) {
        try {
            addFeature(ctx, fam, outer.fn, outer.args);
            return;
        } catch (e: any) {
            if (!(e instanceof Untranslatable)) throw e;
            return ctx.fail(outer.fn, e.reason, ctx.callLoc(outer));
        }
    }
    ctx.fail(outer.fn, `${outer.fn} not translated`, ctx.callLoc(outer));
}

// True if every converter of `ext` was produced by the call `fn` (not added by a wrapper).
function partsFrom(zhc: Zhc, ext: any, fn: string): boolean {
    for (const k of ['fromZigbee', 'toZigbee', 'configure', 'onEvent']) {
        for (const it of [].concat(ext[k] || [])) {
            if (!it) continue;
            const c = zhc.calls.get(it);
            if (!c || !c[0].fn.startsWith(`${fn}#`)) return false;
        }
    }
    return true;
}

function translateConverter(ctx: Ctx, it: any, kind: 'fromZigbee' | 'toZigbee') {
    if (!it) return;
    const name = ctx.zhc.named.get(it);
    if (name) {
        if (STD[name] === 'generic') {
            ctx.flags.add('generic');
            if (kind === 'fromZigbee') for (const c of fzClusters(it)) ctx.genericClusters.add(c);
            for (const [key, bit, dc] of IAS_FZ[name] || []) {
                ctx.addEntity({key, platform: 'binary_sensor', device_class: dc, zcl: {cluster: 0x0500, attr: 0x0002, type: 'map16'}, from: `bit(x, ${bit})`});
            }
            return;
        }
        if (STD[name] === 'noop') return ctx.noop(name, 'Z2M-internal');
        if (name === 'tuya.fz.datapoints' || name === 'tuya.tz.datapoints') {
            ctx.dpMode = true;
            ctx.flags.add('tuya');
            return;
        }
        if (VENDOR_NAMED[name]) return VENDOR_NAMED[name](ctx, it);
        const fn = it.convert || it.convertSet || it.convertGet;
        const fam = familyOf(name);
        if (fam) return addFeature(ctx, fam, name);
        return ctx.fail(name, STD_REASON[name] ?? `${name} not translated`, ctx.zhc.fnLocation(fn));
    }
    const calls = ctx.zhc.calls.get(it);
    const fn = it.convert || it.convertSet || it.convertGet;
    if (calls?.length) return ctx.fail(calls[0].fn.replace(/#.*/, ''), `part of ${calls[0].fn.replace(/#.*/, '')} used directly`, ctx.zhc.fnLocation(fn));
    ctx.fail(`inline ${kind}`, `custom ${kind} converter${it.cluster ? ` (${it.cluster})` : ''}`, ctx.zhc.fnLocation(fn));
}

async function translateConfigure(ctx: Ctx, fn: any) {
    if (!fn) return;
    for (const f of [].concat(fn)) {
        if (typeof f !== 'function') continue;
        const name = ctx.zhc.named.get(f);
        if (name === 'tuya.configureMagicPacket') {
            ctx.tuya.magic_packet = true;
            ctx.flags.add('tuya');
            continue;
        }
        if (name === 'tuya.configureQuery') {
            ctx.tuya.query = [...new Set(['configure', ...(ctx.tuya.query || [])])];
            continue;
        }
        if (name === 'tuya.configureBindBasic') {
            ctx.tuya.bind_basic = true;
            continue;
        }
        const ops = await replay(ctx.d, f);
        if (typeof ops === 'string') {
            ctx.fail('configure', `configure function could not be replayed: ${ops}`, ctx.zhc.fnLocation(f));
            continue;
        }
        let rest = ops;
        if (isMagicPacket(ops)) {
            ctx.tuya.magic_packet = true;
            ctx.flags.add('tuya');
            rest = ops.filter((o) => !(o.op === 'read' && (o.cluster === 'genBasic' || o.cluster === 0)));
        }
        try {
            translateOps(ctx, rest);
        } catch (e: any) {
            if (e instanceof Untranslatable) ctx.fail('configure', e.reason, ctx.zhc.fnLocation(f));
            else throw e;
        }
    }
}

const META_NOOP = new Set(['multiEndpoint', 'multiEndpointSkip', 'multiEndpointEnforce', 'disableDefaultResponse', 'applyRedFix', 'supportsEnhancedHue',
    'supportsHueAndSaturation', 'publishDuplicateTransaction', 'configureKey', 'pinCodeCount', 'overrideHaDiscoveryPayload', 'noOffTransitionWhenOff',
    'turnsOffAtBrightness1', 'tuyaDatapoints', 'disableActionGroup', 'coverStateFromTilt', 'timeout', 'thermostat']);

function translateMeta(ctx: Ctx, meta: any) {
    if (!meta) return;
    for (const [k, v] of Object.entries<any>(meta)) {
        if (v === undefined) continue;
        if (k === 'tuyaSendCommand') {
            if (v === 'sendData') ctx.tuya.send = 'sendData';
        } else if (k === 'battery') {
            for (const [bk, bv] of Object.entries<any>(v || {})) {
                if (bk === 'voltageToPercentage') {
                    if (typeof bv === 'string' && BATTERY_CURVES.includes(bv)) ctx.device.battery = bv;
                    else if (bv && typeof bv === 'object' && typeof bv.min === 'number') ctx.device.battery = {voltage_to_percent: [bv.min, bv.max]};
                    else ctx.fail('meta.battery', `voltageToPercentage ${JSON.stringify(bv)}`);
                } else if (bk === 'dontDividePercentage') {
                    if (bv) ctx.patch('battery', {div: 1});
                } else ctx.fail('meta.battery', `meta.battery.${bk}`);
            }
        } else if (k === 'coverInverted') {
            if (v) ctx.patch('cover', {invert: true});
        } else if (k === 'turnsOffAtBrightness1') {
            if (v) ctx.note('turnsOffAtBrightness1');
        } else if (META_NOOP.has(k)) {
            if (typeof v === 'function' && k !== 'overrideHaDiscoveryPayload') ctx.fail(`meta.${k}`, `meta.${k} is code`);
        } else ctx.fail(`meta.${k}`, `meta.${k} not translated`);
    }
}

function matchClauses(d: any): {match: any[]; names: Set<string>; partial?: string} {
    const match: any[] = [];
    const names = new Set<string>();
    let partial: string | undefined;
    const zm: string[] = (d.zigbeeModel || []).filter((x: any) => typeof x === 'string');
    if (zm.length === 1) match.push({model: zm[0]});
    else if (zm.length > 1) match.push({model: {any: zm}});
    const byModel = new Map<string, string[]>();
    const extra: any[] = [];
    for (const f of Array.isArray(d.fingerprint) ? d.fingerprint : []) {
        const keys = Object.keys(f).filter((k) => f[k] !== undefined);
        const simple = keys.every((k) => k === 'modelID' || k === 'manufacturerName');
        if (simple && f.modelID && f.manufacturerName) {
            const l = byModel.get(f.modelID) || [];
            if (!l.includes(f.manufacturerName)) l.push(f.manufacturerName);
            byModel.set(f.modelID, l);
            names.add(f.manufacturerName);
            continue;
        }
        const c: any = {};
        let skip: string | undefined;
        for (const k of keys) {
            const v = f[k];
            if (k === 'modelID') c.model = v;
            else if (k === 'manufacturerName') {
                c.manufacturer = v;
                names.add(v);
            } else if (k === 'manufacturerID') c.mfr_code = v;
            else if (k === 'applicationVersion') c.app_version = {min: v, max: v};
            else if (k === 'stackVersion') c.stack_version = {min: v, max: v};
            else if (k === 'hardwareVersion') c.hw_version = {min: v, max: v};
            else if (k === 'softwareBuildID') c.sw_build = v;
            else if (k === 'powerSource') c.power = /battery/i.test(v) ? 'battery' : 'mains';
            else if (k === 'priority') c.priority = v;
            else if (k === 'endpoints') {
                c.endpoints = {};
                for (const ep of v) {
                    const x: any = {};
                    if (ep.profileID !== undefined) x.profile = ep.profileID;
                    if (ep.deviceID !== undefined) x.device_id = ep.deviceID;
                    // an empty list is no constraint in zdef (subset match): omit it
                    if (ep.inputClusters?.length) x.in = ep.inputClusters;
                    if (ep.outputClusters?.length) x.out = ep.outputClusters;
                    c.endpoints[ep.ID] = x;
                }
            } else if (k === 'type') {
                const lt = LOGICAL_TYPES[v];
                if (lt) c.logical_type = lt;
                else skip = `fingerprint type ${v}`;
            }
            else skip = `fingerprint field ${k}`;
        }
        if (skip) {
            // Only this fingerprint is lost; the definition is reported partial.
            partial ??= skip;
            continue;
        }
        const prio = c.priority;
        delete c.priority;
        if (prio !== undefined) c['x-priority'] = prio;
        extra.push(c);
    }
    for (const [model, mfrs] of byModel) {
        match.push(mfrs.length === 1 ? {model, manufacturer: mfrs[0]} : {model, manufacturer: {any: mfrs}});
    }
    match.push(...extra);
    return {match, names, partial};
}

function whiteLabels(d: any, names: Set<string>, match: any[]): any[] | undefined {
    const out: any[] = [];
    const extra: string[] = [];
    // Model IDs the definition is found by (zhc looks white labels up only
    // after the definition was found by one of them).
    const known = new Set<string>([...(d.zigbeeModel || []), ...(Array.isArray(d.fingerprint) ? d.fingerprint.map((f: any) => f.modelID).filter(Boolean) : [])]);
    for (const w of d.whiteLabel || []) {
        const base: any = {vendor: String(w.vendor ?? d.vendor), model: String(w.model)};
        const fps: any[] = (w.fingerprint || []).filter((f: any) => typeof f.modelID === 'string' || typeof f.manufacturerName === 'string');
        if (!fps.length) {
            out.push(base);
            continue;
        }
        // zhc selects a white label by its fingerprints (modelID and/or
        // manufacturerName): one entry per model ID keeps the pairs exact.
        const byModel = new Map<string, string[]>();
        for (const f of fps) {
            const mid = typeof f.modelID === 'string' ? f.modelID : '';
            if (mid && !known.has(mid)) continue;
            const l = byModel.get(mid) || [];
            if (typeof f.manufacturerName === 'string' && !l.includes(f.manufacturerName)) l.push(f.manufacturerName);
            byModel.set(mid, l);
        }
        for (const [mid, mfr] of byModel) {
            if (!mid && !mfr.length) continue;
            const x: any = {...base};
            for (const n of mfr) if (!names.has(n) && !extra.includes(n)) extra.push(n);
            if (mfr.length) x.manufacturer = mfr;
            if (mid) x.model_id = [mid];
            out.push(x);
        }
    }
    if (extra.length) {
        // White-label names must be in the match name list (spec 8.4): add them
        // under the definition's model IDs (zhc matches white labels the same way).
        const models: string[] = [...new Set<string>([...(d.zigbeeModel || []), ...(Array.isArray(d.fingerprint) ? d.fingerprint.map((f: any) => f.modelID).filter(Boolean) : [])])];
        const model = models.length === 1 ? models[0] : models.length ? {any: models} : String(d.model);
        match.push({model, manufacturer: extra.length === 1 ? extra[0] : {any: extra}});
        for (const n of extra) names.add(n);
    }
    return out.length ? out : undefined;
}

export function identifiersOf(d: any): string[] {
    const ids = new Set<string>([d.model]);
    for (const z of d.zigbeeModel || []) ids.add(z);
    for (const f of Array.isArray(d.fingerprint) ? d.fingerprint : []) {
        if (f.modelID) ids.add(f.modelID);
        if (f.manufacturerName) ids.add(f.manufacturerName);
    }
    return [...ids].filter((x) => typeof x === 'string');
}

export async function translate(zhc: Zhc, file: string, d: any): Promise<{doc: any; rec: Record_}> {
    const ctx = new Ctx(zhc, file, d);
    const extends_ = [].concat(d.extend || []).filter(Boolean);

    // endpoint names
    if (typeof d.endpoint === 'function') {
        try {
            const m = d.endpoint({getEndpoint: () => ({}), endpoints: [], modelID: d.zigbeeModel?.[0], manufacturerName: ''});
            for (const [n, ep] of Object.entries(m || {})) if (typeof ep === 'number') ctx.endpointNames[n] = ep;
        } catch {
            ctx.fail('endpoint', 'endpoint() depends on the device', zhc.fnLocation(d.endpoint));
        }
    }
    // exposes of the definition and of its extends
    exposesOf(ctx, d.exposes, 'def');
    for (const e of extends_) exposesOf(ctx, (e as any).exposes, e);

    // structure first (endpoints, custom clusters), then everything else
    const structural = (e: any) => chainOf(zhc, e).some((c) => c.fn === 'm.deviceEndpoints' || c.fn === 'm.deviceAddCustomCluster');
    for (const e of extends_) if (structural(e)) translateExtend(ctx, e);
    for (const e of extends_) if (!structural(e)) translateExtend(ctx, e);
    for (const it of [].concat(d.fromZigbee || [])) translateConverter(ctx, it, 'fromZigbee');
    for (const it of [].concat(d.toZigbee || [])) translateConverter(ctx, it, 'toZigbee');
    await translateConfigure(ctx, d.configure);
    for (const f of [].concat(d.onEvent || [])) {
        if (typeof f !== 'function') continue;
        const name = zhc.named.get(f);
        if (name && tuyaOnEvent(ctx, name)) continue;
        ctx.fail(name ?? 'onEvent', name ? `${name} not translated` : 'custom onEvent handler', zhc.fnLocation(f));
    }
    translateMeta(ctx, d.meta);
    if (d.ota) ctx.device.ota = true;

    // Tuya DP table
    const dps = d.meta?.tuyaDatapoints;
    if (dps) {
        if (!ctx.dpMode) ctx.note('meta.tuyaDatapoints without tuya datapoint converters');
        translateDpTable(ctx, dps, ctx.exposes.filter((x) => !ctx.claimed.has(x.expose)).map((x) => x.expose));
        ctx.flags.add('tuya');
    }
    // remaining exposes served by generic-tier converters
    for (const {expose} of ctx.exposes) {
        if (ctx.claimed.has(expose)) continue;
        if (expose.name === 'linkquality') {
            ctx.claim(expose);
            continue;
        }
        const cl = exposeClusters(expose);
        if (cl && (cl.includes('*') || cl.some((c) => ctx.genericClusters.has(c)))) ctx.claim(expose);
    }
    claimForFamilies(ctx);
    for (const {expose} of ctx.exposes) {
        if (!ctx.claimed.has(expose) && !ctx.dropped.includes(propertyOf(expose))) ctx.dropped.push(propertyOf(expose));
    }
    // EF00-only devices: no generic entities (the standard clusters carry nothing useful)
    if (ctx.dpMode && !ctx.flags.has('generic')) ctx.generic.disable = true;

    // ---- document ----
    const {match, names, partial} = matchClauses(d);
    if (partial) ctx.fail('fingerprint', partial);
    const doc: any = {zdef: 1, id: `${slug(d.vendor) || 'unknown'}/${slug(d.model) || 'model'}`, revision: 1, vendor: String(d.vendor), model: String(d.model)};
    if (d.description) doc.description = String(d.description);
    const firstCall = extends_.map((e) => chainOf(zhc, e).slice(-1)[0]).find(Boolean);
    const loc = firstCall ? ctx.callLoc(firstCall) : undefined;
    // Origin without version and line, so a zhc bump alone does not change the definition (revision, hash).
    doc.source = `zhc devices/${file}.ts`;
    const where = loc && loc.includes(`devices/${file}.ts`) ? loc : `src/devices/${file}.ts`;
    doc.match = match.length ? match : [{model: String(d.model)}];
    const wl = whiteLabels(d, names, doc.match);
    if (wl) doc.white_label = wl;
    if (Object.keys(ctx.device).length) doc.device = ctx.device;
    const g: any = {};
    if (ctx.generic.disable) g.disable = true;
    if (ctx.generic.exclude.size) g.exclude = [...ctx.generic.exclude].sort();
    if (Object.keys(ctx.generic.patch).length) g.patch = ctx.generic.patch;
    if (Object.keys(g).length) doc.generic = g;
    // endpoint display names: only for ZCL devices, and only when they name endpoints one to one
    const epNames = Object.entries(ctx.endpointNames).filter(([n]) => n !== 'default');
    const oneToOne = new Set(epNames.map(([, ep]) => ep)).size === epNames.length;
    if (epNames.length && oneToOne && !ctx.generic.disable) {
        doc.endpoints = {};
        for (const [n, ep] of epNames.sort((a, b) => a[1] - b[1])) if (doc.endpoints[ep] === undefined) doc.endpoints[ep] = n;
    }
    if (Object.keys(ctx.tuya).length) doc.tuya = ctx.tuya;
    if (ctx.templates.length) doc.templates = ctx.templates;
    if (ctx.configure.length) doc.configure = dedupe(ctx.configure);
    if (ctx.ignore.length) doc.ignore = ctx.ignore;
    for (const e of ctx.entities) if (['sensor', 'binary_sensor', 'event'].includes(e.platform)) delete e.to;
    if (ctx.entities.length) doc.entities = ctx.entities.map(clean);
    const isPartial = ctx.untranslated.length > 0 || ctx.dropped.length > 0;
    if (isPartial) doc['x-partial'] = true;

    const tier = isPartial ? 'P' : ctx.flags.has('template') ? 'C' : ctx.flags.has('tuya') || ctx.dpMode ? 'B' : 'A';
    const rec: Record_ = {
        id: doc.id, file, vendor: String(d.vendor), model: String(d.model), tier, flags: [...ctx.flags].sort(), untranslated: ctx.untranslated,
        dropped: ctx.dropped, noops: ctx.noops, notes: ctx.notes, requires: [...ctx.requires].sort(), templates: ctx.templates.map((t) => t.name),
        where, identifiers: identifiersOf(d), description: String(d.description ?? ''), entities: ctx.entities.length, coordinator: isCoordinator(d),
    };
    return {doc, rec};
}

function dedupe(ops: any[]): any[] {
    const seen = new Set<string>();
    return ops.filter((o) => {
        const k = JSON.stringify(o);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

// Drop internal fields (prefixed "_") and undefined values, recursively.
function clean(v: any): any {
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object') {
        const o: any = {};
        for (const [k, x] of Object.entries(v)) if (!k.startsWith('_') && x !== undefined) o[k] = clean(x);
        return o;
    }
    return v;
}
