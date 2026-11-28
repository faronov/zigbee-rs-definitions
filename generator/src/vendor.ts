// Vendor templates (C tier, spec 17.4, D13): Hue light first, then Lumi,
// then Tuya specifics. A template is hub code selected by name with
// parameters (`templates: [{name, params}]`); the definition lists it and the
// compiler adds the matching `requires` feature.
import {Ctx, checkArgs, untr} from './ctx';
import type {ExtTranslator} from './modern';
import {lightPatch} from './modern';
import {propertyOf} from './ha';

export function addTemplate(ctx: Ctx, name: string, params?: Record<string, any>) {
    const t: any = {name};
    if (params && Object.keys(params).length) t.params = params;
    const same = ctx.templates.find((x) => x.name === name);
    if (same) {
        // merge key lists of repeated helpers (one template instance per name)
        if (params?.keys && same.params?.keys) same.params.keys = [...new Set([...same.params.keys, ...params.keys])];
        return;
    }
    ctx.templates.push(t);
    ctx.flags.add('template');
    ctx.requires.add(`template.${name}`);
}

// ---- Philips Hue ---------------------------------------------------------------

// philips.m.light: m.light plus Hue effects (0xFC03), Hue power-on behaviour
// (0xFC01 / startup attributes), gradient (0xFC03 state), native Philips2
// control. The template implements those; the parameters say which.
const hueLight: ExtTranslator = (ctx, call, ext) => {
    const a = call.args[0] || {};
    checkArgs('philips.m.light', a, ['colorTemp', 'color', 'gradient', 'hueEffect', 'effect', 'powerOnBehavior', 'configureReporting', 'ota', 'turnsOffAtBrightness1',
        'endpointNames', 'levelConfig', 'levelReportingConfig']);
    const params: any = {};
    const range = a.colorTemp?.range;
    if (Array.isArray(range)) params.color_temp = range;
    if (a.color) params.color = Array.isArray(a.color?.modes) ? a.color.modes : ['xy', 'hs'];
    if (a.gradient) {
        params.gradient = true;
        if (typeof a.gradient === 'object' && a.gradient.extraEffects) params.gradient_effects = a.gradient.extraEffects;
    }
    if (a.hueEffect === false) params.hue_effects = false;
    lightPatch(ctx, {...a, colorTemp: undefined, ota: a.ota ?? true});
    addTemplate(ctx, 'hue_light', params);
    ctx.claim(ext.exposes);
};

// ---- Lumi ------------------------------------------------------------------------

// Keys lumi.fromZigbee.lumi_specific may publish (lumi.numericAttributes2Payload).
const LUMI_SPECIFIC_KEYS = new Set(['battery', 'voltage', 'device_temperature', 'power_outage_count', 'temperature', 'humidity', 'pressure',
    'illuminance', 'energy', 'power', 'current', 'consumption', 'trigger_count', 'power_outage_memory', 'led_disabled_night', 'flip_indicator_light',
    'switch_type', 'motion_sensitivity', 'detection_interval', 'trigger_indicator', 'occupancy', 'presence', 'smoke', 'smoke_density', 'buzzer_manual_alarm',
    'test', 'selftest', 'gas', 'gas_density', 'sensitivity', 'water_leak', 'contact', 'mode_switch', 'operation_mode', 'button_lock',
    'charging_protection', 'overload_protection', 'auto_off', 'voltage_l1', 'action', 'temperature_alarm', 'state']);

const lumiSpecific = (ctx: Ctx, exposes: {expose: any}[]) => {
    const keys = exposes.map((x) => x.expose).filter((e: any) => e && !ctx.claimed.has(e) && LUMI_SPECIFIC_KEYS.has(e.name));
    addTemplate(ctx, 'lumi_specific', {keys: keys.map((e: any) => propertyOf(e)).sort()});
    ctx.claim(keys);
};

const lumiOta: ExtTranslator = (ctx, call, ext) => {
    ctx.device.ota = true;
    ctx.note('Lumi OTA: images from the Lumi OTA index (hub OTA is later)');
    ctx.claim(ext.exposes);
};

const templateExt = (name: string): ExtTranslator => (ctx, call, ext) => {
    if (call.args.some((x) => typeof x === 'function')) untr(`${call.fn}: argument is code`);
    addTemplate(ctx, name);
    ctx.claim(ext.exposes);
};

export const VENDOR_EXT: Record<string, ExtTranslator> = {
    // reads Basic version attributes into Z2M's device record: diagnostics only, the hub's interview reads them
    'develco.develcoModernExtend.readGenBasicPrimaryVersions': (ctx, call, ext) => {
        ctx.noop(call.fn, 'version attributes, read by the hub interview');
        ctx.claim(ext.exposes);
    },
    'philips.m.light': hueLight,
    'lumi.modernExtend.lumiZigbeeOTA': lumiOta,
};

// Named vendor converters used in fromZigbee/toZigbee lists.
export type NamedVendor = (ctx: Ctx) => void;
export const VENDOR_NAMED: Record<string, (ctx: Ctx, conv: any) => void> = {
};

// Named vendor converters that are plain (manufacturer-specific) attributes:
// fz and tz name -> one entity. The expose of the same key gives the HA fields.
interface VendorAttr {
    key: string;
    cluster: number;
    attr: number;
    type: string;
    mfr?: number;
    map?: Record<string, string>;
    bool?: boolean;
}
const PHILIPS = 0x100b;
const VENDOR_ATTRS: Record<string, VendorAttr> = {};
const pair = (names: string[], a: VendorAttr) => names.forEach((n) => (VENDOR_ATTRS[n] = a));
pair(['philips.fz.hue_motion_sensitivity', 'philips.tz.hue_motion_sensitivity'],
    {key: 'motion_sensitivity', cluster: 0x0406, attr: 0x0030, type: 'u8', mfr: PHILIPS, map: {0: 'low', 1: 'medium', 2: 'high', 3: 'very_high', 4: 'max'}});
pair(['philips.fz.hue_motion_led_indication', 'philips.tz.hue_motion_led_indication'],
    {key: 'led_indication', cluster: 0x0000, attr: 0x0033, type: 'bool', mfr: PHILIPS, bool: true});

import {baseEntity} from './ctx';
for (const [name, a] of Object.entries(VENDOR_ATTRS)) {
    VENDOR_NAMED[name] = (ctx) => {
        if (ctx.entities.some((e) => e.key === a.key)) return;
        const ex = ctx.exposes.map((x) => x.expose).find((e: any) => e?.name === a.key);
        const e = ex ? baseEntity(ex, a.key) : {key: a.key, platform: a.bool ? 'switch' : 'select', category: 'config'};
        e.zcl = {cluster: a.cluster, attr: a.attr, type: a.type, ...(a.mfr != null ? {mfr: a.mfr} : {})};
        if (a.map) {
            const values: string[] = ex?.values ?? Object.values(a.map);
            e.map = Object.fromEntries(Object.entries(a.map).filter(([, l]) => values.includes(l)));
        }
        ctx.addEntity(e);
        if (ex) ctx.claim(ex);
    };
}

// ---- template families ------------------------------------------------------------
//
// Lumi (D13 step 2) and the Tuya specifics (step 3) are ported as one hub
// template per family. A definition lists the zhc helpers it uses as the
// family template's features, with their literal arguments; the hub's
// template implements each feature with zhc's semantics. Exposes that no
// data translation claimed are listed as the template's `keys` once the
// definition has nothing else untranslated.
export const FAMILIES: [RegExp, string][] = [
    [/^lumi\.(modernExtend|fromZigbee|toZigbee)\./, 'lumi'],
    [/^tuya\.(modernExtend|fz|tz)\./, 'tuya'],
    [/^legacy\.(fz|tz)\.(tuya|moes)_/, 'tuya'],
];

export function familyOf(name: string): string | undefined {
    for (const [re, fam] of FAMILIES) if (re.test(name)) return fam;
    return undefined;
}

function literal(v: any, depth = 0): any {
    if (v === null || ['number', 'string', 'boolean'].includes(typeof v)) return v;
    if (v === undefined) return undefined;
    if (depth > 4) untr('template argument too deep');
    if (Array.isArray(v)) return v.map((x) => literal(x, depth + 1));
    if (typeof v === 'object' && (v.constructor === Object || v.constructor === undefined)) {
        const o: any = {};
        for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = literal(x, depth + 1);
        return o;
    }
    if (typeof v === 'object' && typeof v.valueOf === 'function' && typeof v.valueOf() === 'number') return v.valueOf(); // Tuya Enum
    return untr(`template argument of type ${typeof v === 'object' ? v.constructor?.name : typeof v}`);
}

// Helper arguments that are device predicates (code) in zhc, taken as true:
// the hub does for every device of the definition what zhc does for some
// (electricityMeasurementPoll: one more read every 60 s where zhc would not
// poll).
const PREDICATE_ARGS: Record<string, string[]> = {
    'tuya.modernExtend.electricityMeasurementPoll': ['electricalMeasurement', 'metering'],
};

export function addFeature(ctx: Ctx, fam: string, item: string, args?: any[]) {
    const feature = item.replace(/^[a-z]+\.(modernExtend|fromZigbee|toZigbee|fz|tz)\./, item.startsWith('legacy.') ? 'legacy_' : '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    let params: any = {};
    const a = (args || []).filter((x) => x !== undefined).map((x) => {
        const pred = PREDICATE_ARGS[item];
        if (!pred || !x || typeof x !== 'object' || Array.isArray(x)) return x;
        const o = {...x};
        for (const k of pred) {
            if (typeof o[k] === 'function') {
                o[k] = true;
                ctx.note(`${item}: ${k} is a device predicate in zhc, taken as true`);
            }
        }
        return o;
    });
    if (a.length === 1 && a[0] && typeof a[0] === 'object' && !Array.isArray(a[0])) params = literal(a[0]);
    else if (a.length) params = {args: literal(a)};
    let t = ctx.templates.find((x) => x.name === fam);
    if (!t) {
        t = {name: fam, params: {features: {}}};
        ctx.templates.push(t);
        ctx.flags.add('template');
        ctx.requires.add(`template.${fam}`);
    }
    const prev = t.params.features[feature];
    if (prev && JSON.stringify(prev) !== JSON.stringify(params)) {
        const list = Array.isArray(prev._instances) ? prev._instances : [prev];
        t.params.features[feature] = {instances: [...list, params]};
    } else t.params.features[feature] = params;
}

// After everything else: exposes nobody claimed belong to the family templates.
export function claimForFamilies(ctx: Ctx) {
    const fams = ctx.templates.filter((t) => t.params?.features);
    if (!fams.length || ctx.untranslated.length) return;
    const keys = ctx.exposes.map((x) => x.expose).filter((e: any) => e && !ctx.claimed.has(e));
    if (!keys.length) return;
    const t = fams[0];
    t.params.keys = [...new Set([...(t.params.keys || []), ...keys.map((e: any) => propertyOf(e))])].sort();
    ctx.claim(keys);
}
