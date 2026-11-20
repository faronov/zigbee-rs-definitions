// Tuya: tuyaBase flags, dp* extends, DP tables (meta.tuyaDatapoints) and
// their value converters (spec 10, 17.2).
import type {Call} from './zhc';
import {Ctx, baseEntity, checkArgs, untr} from './ctx';
import {HVAC_ACTION, HVAC_MODES, propertyOf} from './ha';
import type {ExtTranslator} from './modern';
import {VENDOR_NAMED, addTemplate, addFeature} from './vendor';

const TUYA_TYPES = ['raw', 'bool', 'value', 'string', 'enum', 'bitmap'];
const fnSrc = (f: any) => (typeof f === 'function' ? Function.prototype.toString.call(f) : '');

// ---- tuyaBase -------------------------------------------------------------------

export const tuyaBase: ExtTranslator = (ctx, call) => {
    const a = call.args[0] || {};
    checkArgs('tuya.modernExtend.tuyaBase', a, ['dp', 'queryOnDeviceAnnounce', 'queryOnConfigure', 'bindBasicOnConfigure', 'queryIntervalSeconds',
        'forceTimeUpdates', 'timeStart', 'mcuVersionRequestOnConfigure', 'respondToMcuVersionResponse']);
    ctx.flags.add('tuya');
    ctx.tuya.magic_packet = true; // tuyaBase always runs configureMagicPacket
    if (a.timeStart && a.timeStart !== 'off') ctx.tuya.time_sync = String(a.timeStart);
    if (a.forceTimeUpdates) ctx.tuya.force_time_sync_s = 3600;
    const q: any[] = [];
    if (a.queryOnConfigure) q.push('configure');
    if (a.queryOnDeviceAnnounce) q.push('announce');
    if (a.queryIntervalSeconds !== undefined) q.push({interval_s: a.queryIntervalSeconds});
    if (q.length) ctx.tuya.query = q;
    if (a.bindBasicOnConfigure) ctx.tuya.bind_basic = true;
    if (a.mcuVersionRequestOnConfigure) ctx.tuya.mcu_version = true;
    if (a.dp) ctx.dpMode = true;
};

const tuyaMagicPacket: ExtTranslator = (ctx) => {
    ctx.flags.add('tuya');
    ctx.tuya.magic_packet = true;
};

// ---- dp* extends ----------------------------------------------------------------

const DP_ARGS = ['name', 'dp', 'type', 'description', 'readOnly', 'endpoint', 'expose', 'skip', 'unit', 'valueMax', 'valueMin', 'valueStep', 'scale', 'lookup',
    'valueOn', 'valueOff'];

function dpType(t: any): string {
    const n = TUYA_TYPES[t];
    if (!n) untr(`Tuya DP type ${t}`);
    return n;
}

function exposeOf(ext: any): any {
    return [].concat(ext.exposes || []).find((e: any) => e && typeof e === 'object');
}

const dpNumeric: ExtTranslator = (ctx, call, ext) => {
    const a = call.args[0] || {};
    checkArgs('tuya.dpNumeric', a, DP_ARGS);
    const expose = exposeOf(ext);
    const e = baseEntity(expose, propertyOf(expose));
    e.tuya = [a.dp, dpType(a.type)];
    if (a.scale !== undefined) {
        if (Array.isArray(a.scale)) Object.assign(e, scaleRange(a.scale[0], a.scale[1], a.scale[2], a.scale[3]));
        else Object.assign(e, divideBy(a.scale));
    }
    ctx.flags.add('tuya');
    ctx.addEntity(e);
    ctx.claim(ext.exposes);
};

const dpBinary: ExtTranslator = (ctx, call, ext) => {
    const a = call.args[0] || {};
    checkArgs('tuya.dpBinary', a, DP_ARGS);
    const expose = exposeOf(ext);
    const e = baseEntity(expose, propertyOf(expose));
    const type = dpType(a.type);
    e.tuya = [a.dp, type];
    let on = a.valueOn[1];
    let off = a.valueOff[1];
    on = typeof on === 'object' && on !== null ? on.valueOf() : on;
    off = typeof off === 'object' && off !== null ? off.valueOf() : off;
    if (!(on === true && off === false)) {
        if (on === false && off === true) {
            e.from = '!x';
            if (e.platform === 'switch') e.to = '!x';
        } else if (!(on === 1 && off === 0 && e.platform !== 'switch')) {
            e.value_on = on;
            e.value_off = off;
        }
    }
    if (expose.type === 'enum') {
        // dpBinary with an enum expose (e.g. dpContact on some devices) -> map
        delete e.value_on;
        delete e.value_off;
        e.map = {[String(on)]: String(a.valueOn[0]), [String(off)]: String(a.valueOff[0])};
    }
    ctx.flags.add('tuya');
    ctx.addEntity(e);
    ctx.claim(ext.exposes);
};

const dpEnumLookup: ExtTranslator = (ctx, call, ext) => {
    const a = call.args[0] || {};
    checkArgs('tuya.dpEnumLookup', a, DP_ARGS);
    const expose = exposeOf(ext);
    const type = dpType(a.type);
    const map: Record<string, any> = {};
    for (const [label, raw] of Object.entries(a.lookup)) {
        const r = raw !== null && typeof raw === 'object' ? (raw as any).valueOf() : raw;
        if (typeof r === 'boolean') map[r ? '1' : '0'] = label;
        else map[String(r)] = label;
    }
    if (propertyOf(expose) === 'action' || expose?.name === 'action') {
        ctx.addEntity(actionEntity(a.dp, type, map, expose));
    } else {
        const e = baseEntity(expose, propertyOf(expose));
        e.tuya = [a.dp, type];
        if (e.platform === 'binary_sensor' || e.platform === 'switch') {
            const onRaw = Object.keys(map).find((k) => /^(on|true|open|1)$/i.test(String(map[k])));
            if (onRaw === undefined) untr('tuya.dpEnumLookup on a binary expose');
            e.from = `x == ${onRaw}`;
        } else e.map = map;
        ctx.addEntity(e);
    }
    ctx.flags.add('tuya');
    ctx.claim(ext.exposes);
};

function actionEntity(dp: number, type: string, map: Record<string, any>, expose: any): any {
    const types = Object.values(map).map(String);
    const lookup = Object.entries(map).map(([k, v]) => `${k}: ${JSON.stringify(String(v))}`).join(', ');
    return {
        key: 'action', platform: 'event', device_class: 'button', event_types: types,
        triggers: [{tuya: [dp, type], event: `lookup(payload[0], {${lookup}})`}],
        ...(expose?.endpoint ? {name: expose.endpoint} : {}),
    };
}

const dpLight: ExtTranslator = (ctx, call, ext) => {
    const a = call.args[0] || {};
    checkArgs('tuya.dpLight', a, ['state', 'brightness', 'min', 'max', 'colorTemp', 'endpoint']);
    const parts: any = {};
    const st = a.state;
    parts.on_off = {tuya: [st.dp, dpType(st.type)]};
    const on = st.valueOn?.[1];
    if (on !== undefined && on !== true && !(on && typeof on === 'object' && on.valueOf() === 1)) {
        parts.on_off.value_on = typeof on === 'object' ? on.valueOf() : on;
        parts.on_off.value_off = typeof st.valueOff[1] === 'object' ? st.valueOff[1].valueOf() : st.valueOff[1];
    }
    const b = a.brightness;
    parts.brightness = {tuya: [b.dp, dpType(b.type)], ...scaleOf(b.scale)};
    if (a.colorTemp) parts.color_temp = {tuya: [a.colorTemp.dp, dpType(a.colorTemp.type)], ...scaleOf(a.colorTemp.scale),
        ...(a.colorTemp.range ? {min: a.colorTemp.range[0], max: a.colorTemp.range[1]} : {})};
    const key = a.endpoint ? `light_${a.endpoint}` : 'light';
    ctx.addEntity({key, platform: 'light', parts});
    for (const [arg, name] of [['min', 'min_brightness'], ['max', 'max_brightness']]) {
        if (!a[arg]) continue;
        ctx.addEntity({key: a.endpoint ? `${name}_${a.endpoint}` : name, platform: 'number', category: 'config', tuya: [a[arg].dp, dpType(a[arg].type)],
            ...scaleOf(a[arg].scale), min: 0, max: 255});
    }
    ctx.flags.add('tuya');
    ctx.claim(ext.exposes);
};

function scaleOf(scale: any): any {
    if (scale === undefined) return {};
    if (Array.isArray(scale)) return scaleRange(scale[0], scale[1], scale[2], scale[3]);
    return divideBy(scale);
}

function divideBy(n: number): any {
    if (typeof n !== 'number' || n === 0) untr('Tuya divideBy without a number');
    if (n === 1) return {};
    if (Number.isInteger(n)) return {div: n};
    const inv = 1 / n;
    if (Number.isInteger(Math.round(inv * 1e9) / 1e9)) return {mul: Math.round(inv)};
    return untr(`Tuya divideBy(${n})`);
}

// valueConverterBasic.scale(min1, max1, min2, max2): device range [min2, max2] <-> zhc [min1, max1], rounded.
function scaleRange(min1: number, max1: number, min2: number, max2: number): any {
    if (min1 !== 0 || min2 !== 0) {
        return {from: `round((x - ${min2}) * ${max1 - min1} / ${max2 - min2} + ${min1})`, to: `round((x - ${min1}) * ${max2 - min2} / ${max1 - min1} + ${min2})`};
    }
    return {mul: max1, div: max2, precision: 0};
}

// ---- value converters of DP tables ----------------------------------------------------

export interface VcResult {
    feature?: string; // named zhc converter implemented by the Tuya family template
    featureArgs?: any[];
    type?: string; // Tuya type if the converter determines it
    fields?: Record<string, any>;
    multi?: {key: string; fields: Record<string, any>}[]; // one DP -> several keys
    codec?: any;
}

const EXPR = {
    twos8: {from: 'x >= 128 ? x - 256 : x', to: 'x < 0 ? x + 256 : x'},
};

const PHASE: Record<string, (p?: string) => {key: string; expr: string}[]> = {
    phaseVariant1: () => [{key: 'voltage', expr: 'u16be(x, 13) / 10'}, {key: 'current', expr: 'u16be(x, 11) / 1000'}],
    phaseVariant2: () => [{key: 'voltage', expr: 'u16be(x, 0) / 10'}, {key: 'current', expr: 'u16be(x, 3) / 1000'}, {key: 'power', expr: 'u16be(x, 6)'}],
    phaseVariant3: () => [{key: 'voltage', expr: 'u16be(x, 0) / 10'}, {key: 'current', expr: 'u24be(x, 2) / 1000'}, {key: 'power', expr: 'u24be(x, 5)'}],
    phaseVariant4: () => [{key: 'voltage', expr: 'u16be(x, 0) / 10'}, {key: 'current', expr: 'u24be(x, 2) / 1000'}, {key: 'power', expr: 'u24be(x, 5)'}],
    phaseVariant5: () => [{key: 'voltage', expr: 'u16be(x, 2) / 10'}, {key: 'current', expr: 'u16be(x, 5) / 1000'}, {key: 'power', expr: 'u16be(x, 8)'}],
    phaseVariant2WithPhase: (p) => [
        {key: `voltage_${p}`, expr: 'u16be(x, 0) / 10'},
        {key: `current_${p}`, expr: 'u24be(x, 2) / 1000'},
        {key: `power_${p}`, expr: 'u24be(x, 5) > 0x99999A ? u24be(x, 5) - 0x1000000 : (u24be(x, 5) >= 0x800000 ? u24be(x, 5) - 0x99999A : u24be(x, 5))'},
    ],
};

type Named = (info: {expose: any; ctx: Ctx; key: string}) => VcResult;
const NAMED_VC: Record<string, Named> = {
    onOff: () => ({type: 'bool', fields: {map: {true: 'ON', false: 'OFF'}}}),
    lockUnlock: () => ({type: 'bool', fields: {map: {true: 'LOCK', false: 'UNLOCK'}}}),
    tubularMotorDirection: () => ({type: 'enum', fields: {map: {0: 'normal', 1: 'reversed'}}}),
    raw: () => ({}),
    countdown: () => ({}),
    setLimit: () => ({}),
    coverPosition: () => ({}),
    coverPositionInverted: () => ({fields: {from: '100 - x', to: '100 - x'}}),
    divideBy2: () => ({type: 'value', fields: {div: 2}}),
    divideBy10: () => ({type: 'value', fields: {div: 10}}),
    divideBy100: () => ({type: 'value', fields: {div: 100}}),
    divideBy1000: () => ({type: 'value', fields: {div: 1000}}),
    multiplyBy10: () => ({type: 'value', fields: {mul: 10}}),
    divideBy10FromOnly: () => ({type: 'value', fields: {from: 'x / 10', to: 'x'}}),
    twosComplement8Bit: () => ({type: 'value', fields: EXPR.twos8}),
    twosComplement8BitScaled10x: () => ({type: 'value', fields: {from: '(x >= 128 ? x - 256 : x) / 10', to: 'x * 10 < 0 ? x * 10 + 256 : x * 10'}}),
    localTemperatureCalibration: () => ({type: 'value', fields: {from: 'x > 4000 ? x - 4096 : x', to: 'x < 0 ? x + 4096 : x'}}),
    localTemperatureCalibration_256: () => ({type: 'value', fields: {from: 'x > 200 ? x - 256 : x', to: 'x < 0 ? x + 256 : x'}}),
    plus1: () => ({type: 'value', fields: {offset: 1}}),
    trueFalse0: () => ({type: 'enum', fields: {from: 'x == 0'}}),
    trueFalse1: () => ({type: 'enum', fields: {from: 'x == 1'}}),
    trueFalseEnum0: () => ({type: 'enum', fields: {from: 'x == 0'}}),
    trueFalseEnum1: () => ({type: 'enum', fields: {from: 'x == 1'}}),
    trueFalseInvert: () => ({type: 'bool', fields: {from: '!x', to: '!x'}}),
    inverse: () => ({type: 'bool', fields: {from: '!x', to: '!x'}}),
    onOffNotStrict: () => ({type: 'bool'}),
    fault: () => ({type: 'bitmap', fields: {from: 'x != 0'}}),
    power: () => ({type: 'value', fields: {from: 'x > 0x0FFFFFFF ? x - 0x1999999C : x'}}),
    scale0_254to0_1000: () => ({type: 'value', fields: {mul: 254, div: 1000, precision: 0}}),
    scale0_1to0_1000: () => ({type: 'value', fields: {div: 1000, precision: 0}}),
    utf8String: () => ({type: 'string'}),
    utf16BEHexString: () => ({type: 'raw', codec: 'utf16be_hex'}),
    // value 1 = battery low, and the raw value is published as `error`
    errorOrBatteryLow: ({key}) => ({type: 'value', multi: [{key: key ?? 'battery_low', fields: {from: 'x == 1'}}, {key: 'error', fields: {}}]}),
    waterConsumption: () => ({type: 'raw', fields: {from: 'len(x) >= 8 ? u32be(x, 4) / 1000 : 0'}}),
    thermostatScheduleDayMultiDP: () => ({type: 'raw', codec: {tuya_schedule_week: {variant: 'multi_dp', transitions: 4}}}),
    thermostatScheduleDaySingleDP: () => ({type: 'raw', codec: {tuya_schedule_week: {variant: 'single_dp'}}}),
    thermostatScheduleDayMultiDP_TRV602Z: () => ({type: 'raw', codec: {tuya_schedule_week: {variant: 'trv602z'}}}),
    thermostatScheduleDayMultiDP_TRV603WZ: () => ({type: 'raw', codec: {tuya_schedule_week: {variant: 'trv603wz'}}}),
};
for (const n of ['phaseVariant1', 'phaseVariant2', 'phaseVariant3', 'phaseVariant4', 'phaseVariant5']) {
    NAMED_VC[n] = () => ({type: 'raw', multi: PHASE[n]().map((p) => ({key: p.key, fields: {from: p.expr}}))});
}

// Parametrised converters (recorded calls of tuya.valueConverter.* / valueConverterBasic.*).
type Factory = (args: any[], info: {expose: any; ctx: Ctx; key: string}) => VcResult;
const FACTORY_VC: Record<string, Factory> = {
    'vcb.raw': () => ({}),
    'vcb.divideBy': ([n]) => ({type: 'value', fields: divideBy(n)}),
    'vcb.multiplyBy': ([n]) => ({type: 'value', fields: {mul: n}}),
    'vcb.divideByFromOnly': ([n]) => ({type: 'value', fields: {from: `x / ${n}`, to: 'x'}}),
    'vcb.scale': ([a, b, c, d]) => ({type: 'value', fields: scaleRange(a, b, c, d)}),
    'vcb.trueFalse': ([v]) => ({type: v && typeof v === 'object' ? 'enum' : 'value', fields: {from: `x == ${Number(v?.valueOf ? v.valueOf() : v)}`}}),
    'vcb.twosComplementWithBitsizeScaled': ([bits, scale = 1]) => {
        const o = 2 ** bits;
        const l = 2 ** (bits - 1);
        const sc = scale === 1 ? '' : ` / ${scale}`;
        const mul = scale === 1 ? 'x' : `x * ${scale}`;
        return {type: 'value', fields: {from: `(x >= ${l} ? x - ${o} : x)${sc}`, to: `${mul} < 0 ? ${mul} + ${o} : ${mul}`}};
    },
    'vcb.lookup': ([map, fallback], info) => {
        if (typeof map === 'function') untr('lookup map is a function of the device options');
        return lookupResult(map, info, fallback);
    },
    'vcf.static': ([v]) => {
        if (typeof v === 'number') return {fields: {from: String(v)}};
        if (typeof v === 'boolean') return {fields: {from: String(v)}};
        return {fields: {from: JSON.stringify(String(v))}};
    },
    'vcf.thermostatScheduleDayMultiDPWithDayNumber': ([day, transitions = 4, options = {}]) => {
        if (Object.keys(options || {}).length) untr('schedule options (scale/temperature range)');
        return {type: 'raw', codec: {tuya_schedule_day: {day, transitions}}};
    },
    'vcf.thermostatScheduleDayMultiDPWithTransitionCount': ([transitions = 4, opts = {}]) => {
        const p: any = {variant: 'multi_dp', transitions};
        if (opts.scale !== undefined && opts.scale !== 10) p.scale = opts.scale;
        if (opts.minTemperature !== undefined && opts.minTemperature !== 5) p.min = opts.minTemperature;
        if (opts.maxTemperature !== undefined && opts.maxTemperature !== 35) p.max = opts.maxTemperature;
        return {type: 'raw', codec: {tuya_schedule_week: p}};
    },
    'vcf.thermostatScheduleDayMultiDP_TRV602Z_WithDayNumber': ([day]) => ({type: 'raw', codec: {tuya_schedule_day: {day, transitions: 6, variant: 'trv602z'}}}),
    'vcf.phaseVariant2WithPhase': ([phase]) => ({type: 'raw', multi: PHASE.phaseVariant2WithPhase(phase).map((p) => ({key: p.key, fields: {from: p.expr}}))}),
    'vcf.thermostatSystemModeAndPresetMap': ([{fromMap = {}, toMap = {}} = {}], info) => {
        const field = info.key === 'preset' ? 'preset' : info.key === 'system_mode' ? 'systemMode' : info.key === 'running_mode' ? 'deviceMode' : untr(`mode/preset map for ${info.key}`);
        const map: Record<string, string> = {};
        for (const [raw, v] of Object.entries<any>(fromMap)) if (v?.[field] !== undefined) map[raw] = String(v[field]);
        for (const [label, raw] of Object.entries<any>(toMap)) {
            const r = String(raw?.valueOf ? raw.valueOf() : raw);
            if (map[r] !== undefined && map[r] !== label && Object.values(map).includes(label)) untr('mode/preset maps are not inverse of each other');
        }
        return {type: 'enum', fields: {map}};
    },
};

// Lookup semantics (label -> raw) -> map {raw: label} and the Tuya type.
function lookupResult(map: Record<string, any>, info: {expose: any; key: string}, _fallback?: any): VcResult {
    const out: Record<string, string> = {};
    let type: string | undefined;
    const typeOf = (r: any) => (r !== null && typeof r === 'object' ? (r.constructor?.name === 'Bitmap' ? 'bitmap' : 'enum') : typeof r === 'boolean' ? 'bool' : typeof r === 'number' ? 'value' : 'x');
    for (const [label, raw] of Object.entries(map)) {
        const t = typeOf(raw);
        if (t === 'x') untr(`lookup value ${JSON.stringify(raw)}`);
        if (type && type !== t) untr('lookup mixes value types');
        type = t;
        const r = raw !== null && typeof raw === 'object' ? raw.valueOf() : raw;
        out[typeof r === 'boolean' ? (r ? 'true' : 'false') : String(r)] = label;
    }
    return {type, fields: {map: out}};
}

export function isLookupConverter(zhc: any, conv: any): boolean {
    const probe = zhc.libs.tuya.valueConverterBasic.lookup({a: 0});
    return fnSrc(conv.from) === fnSrc(probe.from) && fnSrc(conv.to) === fnSrc(probe.to);
}

// Labels a lookup converter accepts, from its expose.
function labelsOf(expose: any): any[] {
    if (!expose) return [];
    if (expose.type === 'enum') return expose.values || [];
    if (expose.type === 'binary') return [expose.value_on, expose.value_off];
    return [];
}

export function translateVc(ctx: Ctx, conv: any, expose: any, key: string): VcResult {
    if (!conv) return {};
    const info = {expose, ctx, key};
    const name = ctx.zhc.vcNamed.get(conv);
    if (name && NAMED_VC[name]) return NAMED_VC[name](info);
    const calls = ctx.zhc.calls.get(conv) || [];
    for (const c of [...calls].reverse()) {
        if (FACTORY_VC[c.fn]) return FACTORY_VC[c.fn](c.args, info);
    }
    if (isLookupConverter(ctx.zhc, conv)) {
        // Named lookup converter built at load time: probe it with the expose's labels.
        const labels = labelsOf(expose);
        if (!labels.length) untr(`lookup converter ${name ?? ''} without expose labels`);
        const map: Record<string, any> = {};
        for (const l of labels) {
            try {
                map[l] = conv.to(l, {options: {}, state: {}, message: {}});
            } catch {
                /* label unknown to this lookup */
            }
        }
        if (!Object.keys(map).length) untr(`lookup converter ${name ?? ''}: no label accepted`);
        return lookupResult(map, info);
    }
    const loc = ctx.zhc.fnLocation(conv.from || conv.to);
    if (name) return {feature: `tuya.vc.${name}`};
    if (calls.length) {
        const c = calls[calls.length - 1];
        if (c.fn.startsWith('vcf.') && !c.args.some((x: any) => typeof x === 'function')) return {feature: `tuya.vc.${c.fn.slice(4)}`, featureArgs: c.args};
        untr(`${c.fn} not translated`);
    }
    return untr(`inline Tuya value converter${loc ? ` at ${loc}` : ''}`);
}

// Map a zhc binary/lookup result onto an HA bool platform.
function boolFields(e: any, res: VcResult) {
    const map = res.fields?.map;
    if (!map) return;
    const meta = e._meta;
    const expose = meta ? undefined : undefined;
    void expose;
    const entries = Object.entries<string>(map);
    const onLabels = new Set(['ON', 'on', 'true', 'LOCK', 'OPEN', 'open', 'yes', 'alarm', 'detected', 'presence', 'occupied']);
    const on = entries.find(([, l]) => onLabels.has(String(l)) || String(l) === String(e._onLabel));
    if (!on) untr('binary lookup without an "on" label');
    delete res.fields.map;
    let [rawOn] = on;
    const off = entries.find(([r]) => r !== rawOn);
    let rawOff = off?.[0];
    if (rawOn === 'true' && rawOff === 'false') return;
    if (rawOn === 'false' && rawOff === 'true') {
        e.from = '!x';
        if (e.platform === 'switch') e.to = '!x';
        return;
    }
    const num = (s: string | undefined) => (s === 'true' ? 1 : s === 'false' ? 0 : Number(s));
    e.value_on = num(rawOn);
    if (rawOff !== undefined) e.value_off = num(rawOff);
}

// ---- DP tables --------------------------------------------------------------------

const CLIMATE_PARTS: Record<string, string> = {
    local_temperature: 'current_temperature', current_heating_setpoint: 'target_temperature', occupied_heating_setpoint: 'target_temperature',
    heating_setpoint: 'target_temperature', system_mode: 'hvac_mode', running_state: 'hvac_action', preset: 'preset', fan_mode: 'fan_mode',
    occupied_cooling_setpoint: 'target_temperature_high', current_cooling_setpoint: 'target_temperature_high',
};
const LIGHT_PARTS: Record<string, string> = {state: 'on_off', brightness: 'brightness', color_temp: 'color_temp'};
const COVER_PARTS: Record<string, string> = {state: 'command', position: 'position', tilt: 'tilt'};
const COMPOSITE: Record<string, {platform: string; key: string; parts: Record<string, string>}> = {
    climate: {platform: 'climate', key: 'thermostat', parts: CLIMATE_PARTS},
    light: {platform: 'light', key: 'light', parts: LIGHT_PARTS},
    cover: {platform: 'cover', key: 'cover', parts: COVER_PARTS},
    lock: {platform: 'lock', key: 'lock', parts: {state: 'state'}},
    fan: {platform: 'fan', key: 'fan', parts: {state: 'on_off', mode: 'preset', speed: 'percentage'}},
};

interface Slot {
    expose: any; // the scalar expose (feature) for the DP key
    parent?: any; // composite expose, if a feature
    part?: string;
}

export function indexExposes(list: any[]): Map<string, Slot> {
    const idx = new Map<string, Slot>();
    for (const ex of list) {
        if (!ex || typeof ex !== 'object') continue;
        const comp = COMPOSITE[ex.type];
        if (comp && Array.isArray(ex.features)) {
            for (const f of ex.features) {
                const part = comp.parts[f.name];
                idx.set(propertyOf(f), {expose: f, parent: ex, part});
            }
        } else if (ex.type === 'switch' && Array.isArray(ex.features)) {
            for (const f of ex.features) idx.set(propertyOf(f), {expose: f});
        } else if (ex.type === 'composite' && Array.isArray(ex.features)) {
            idx.set(propertyOf(ex), {expose: ex});
        } else idx.set(propertyOf(ex), {expose: ex});
    }
    return idx;
}

// Translate meta.tuyaDatapoints into entities (spec 10). Exposes found here are claimed.
export function translateDpTable(ctx: Ctx, dps: any[], exposes: any[]) {
    const idx = indexExposes(exposes);
    const composites = new Map<any, any>(); // composite expose -> entity under construction
    for (const entry of dps) {
        const [dp, key, conv, opts] = entry;
        const item = `DP ${dp} ${key}`;
        try {
            if (opts && Object.keys(opts).some((k) => k !== 'optimistic')) untr(`DP options ${Object.keys(opts).join(',')}`);
            if (opts?.optimistic === false) ctx.note(`${item}: not optimistic`);
            const slot = key ? idx.get(key) : undefined;
            if (key === null || key === undefined) {
                // converter publishes several keys (zhc merges its result object)
                const calls = ctx.zhc.calls.get(conv) || [];
                const mm = calls.find((c) => c.fn === 'vcf.thermostatSystemModeAndPresetMap');
                if (mm) {
                    for (const k of ['system_mode', 'preset', 'running_mode']) {
                        if (idx.get(k)) dpEntryOne(ctx, idx, composites, dp, k, conv, item);
                    }
                    continue;
                }
            }
            const res = translateVc(ctx, conv, slot?.expose, key);
            if (res.feature) {
                addFeature(ctx, 'tuya', res.feature, [{dp, key, ...(res.featureArgs ? {args: res.featureArgs} : {})}]);
                continue;
            }
            if (res.multi) {
                for (const m of res.multi) {
                    const s = idx.get(m.key);
                    if (!s) {
                        ctx.note(`${item}: ${m.key} has no expose; skipped`);
                        continue;
                    }
                    placeEntity(ctx, composites, s, dp, res.type ?? 'raw', {fields: m.fields}, m.key);
                }
                continue;
            }
            if (!slot) {
                ctx.note(`${item}: no expose; skipped`);
                continue;
            }
            const type = res.type ?? typeFromWrite(conv, slot.expose) ?? typeFromExpose(slot.expose);
            placeEntity(ctx, composites, slot, dp, type, res, key);
        } catch (err: any) {
            if (err?.reason) ctx.fail(item, err.reason, conv ? ctx.zhc.fnLocation(conv.from || conv.to) : undefined);
            else throw err;
        }
    }
    // switch composites (state_l1 ...): claimed with their state feature
    for (const ex of exposes) {
        if (ex?.type === 'switch' && Array.isArray(ex.features) && ex.features.every((f: any) => ctx.claimed.has(f))) ctx.claim(ex);
    }
    // Composite exposes: claimed only if every feature found a DP.
    for (const [parent, ent] of composites) {
        const missing = (parent.features || []).filter((f: any) => !ctx.claimed.has(f));
        if (missing.length === 0) ctx.claim(parent);
        else {
            // Features without a DP (e.g. a preset list zhc implements in a custom converter) are dropped.
            ctx.claim(parent);
            for (const f of missing) ctx.dropped.push(`${propertyOf(parent)}.${f.name}`);
        }
        void ent;
    }
}

function dpEntryOne(ctx: Ctx, idx: Map<string, Slot>, composites: Map<any, any>, dp: number, key: string, conv: any, item: string) {
    const slot = idx.get(key)!;
    const res = translateVc(ctx, conv, slot.expose, key);
    void item;
    placeEntity(ctx, composites, slot, dp, res.type ?? 'enum', res, key);
}

function placeEntity(ctx: Ctx, composites: Map<any, any>, slot: Slot, dp: number, type: string, res: VcResult, key: string) {
    if (slot.parent && slot.part) {
        const comp = COMPOSITE[slot.parent.type];
        let ent = composites.get(slot.parent);
        if (!ent) {
            const k = slot.parent.endpoint ? `${comp.key}_${slot.parent.endpoint}` : comp.key;
            ent = {key: k, platform: comp.platform, parts: {}};
            composites.set(slot.parent, ent);
            ctx.addEntity(ent);
        }
        const part: any = {tuya: [dp, type], ...(res.codec ? {codec: res.codec} : {}), ...(res.fields || {})};
        partFields(slot, part);
        if (ent.parts[slot.part]) ctx.note(`DP ${dp} ${key}: second binding for ${slot.part} ignored`);
        else ent.parts[slot.part] = part;
        ctx.claim(slot.expose);
        ctx.claimedProps.add(propertyOf(slot.parent));
        return;
    }
    if (propertyOf(slot.expose) === 'action' && res.fields?.map) {
        ctx.addEntity(actionEntity(dp, type, res.fields.map, slot.expose));
        ctx.claim(slot.expose);
        return;
    }
    if (slot.expose.type === 'composite') untr(`composite expose ${key}`);
    const e = baseEntity(slot.expose, key);
    e.tuya = [dp, type];
    if (res.codec) e.codec = res.codec;
    const fields = {...(res.fields || {})};
    if (e.platform === 'switch' || e.platform === 'binary_sensor') {
        e._onLabel = slot.expose.value_on;
        const r2 = {...res, fields};
        boolFields(e, r2);
        Object.assign(e, r2.fields);
    } else Object.assign(e, fields);
    if (res.codec && e.platform === 'sensor') e.platform = slot.expose.access & 2 ? 'text' : 'sensor';
    ctx.addEntity(e);
    ctx.claim(slot.expose);
}

function partFields(slot: Slot, part: any) {
    const f = slot.expose;
    if (slot.part === 'target_temperature' || slot.part === 'target_temperature_high') {
        if (f.value_min !== undefined) part.min = f.value_min;
        if (f.value_max !== undefined) part.max = f.value_max;
        if (f.value_step !== undefined) part.step = f.value_step;
    }
    if (slot.part === 'hvac_mode' && part.map) {
        for (const l of Object.values<string>(part.map)) if (!HVAC_MODES.has(l)) untr(`system_mode "${l}" is not an HA hvac mode`);
    }
    if (slot.part === 'hvac_action' && part.map) {
        for (const [r, l] of Object.entries<string>(part.map)) {
            if (!HVAC_ACTION[l]) untr(`running_state "${l}" has no HA hvac action`);
            part.map[r] = HVAC_ACTION[l];
        }
    }
    if (slot.part === 'command' && part.map) {
        for (const [r, l] of Object.entries<string>(part.map)) part.map[r] = String(l).toLowerCase();
    }
    if (slot.part === 'on_off' && part.map) {
        const on = Object.entries<string>(part.map).find(([, l]) => /^on$/i.test(l));
        const off = Object.entries<string>(part.map).find(([, l]) => /^off$/i.test(l));
        delete part.map;
        if (on && off && !(on[0] === 'true' && off[0] === 'false')) {
            part.value_on = on[0] === 'true' ? 1 : Number(on[0]);
            part.value_off = off[0] === 'false' ? 0 : Number(off[0]);
        }
    }
}

// Tuya type from what the converter's `to` returns for a sample value (zhc's
// tz.datapoints picks the DP type the same way).
function typeFromWrite(conv: any, expose: any): string | undefined {
    if (!conv?.to || !expose) return undefined;
    const sample = expose.type === 'binary' ? expose.value_on : expose.type === 'enum' ? expose.values?.[0] : expose.type === 'numeric' ? (expose.value_min ?? 1) : 'x';
    try {
        const r = conv.to(sample, {options: {}, state: {}, message: {}, device: {endpoints: []}, mapped: {}});
        if (r instanceof Promise) return undefined;
        if (typeof r === 'boolean') return 'bool';
        if (typeof r === 'number') return 'value';
        if (typeof r === 'string') return 'string';
        if (Array.isArray(r)) return 'raw';
        if (r && typeof r === 'object') return r.constructor?.name === 'Bitmap' ? 'bitmap' : 'enum';
    } catch {
        /* fall through */
    }
    return undefined;
}

function typeFromExpose(expose: any): string {
    switch (expose?.type) {
        case 'binary':
            return 'bool';
        case 'enum':
            return 'enum';
        case 'text':
            return 'string';
        default:
            return 'value';
    }
}

const tuyaOnEvent = (ctx: Ctx, name: string): boolean => {
    if (name === 'tuya.onEventSetTime') {
        ctx.tuya.time_sync = ctx.tuya.time_sync ?? '2000';
        return true;
    }
    if (name === 'tuya.onEventSetLocalTime') {
        ctx.tuya.time_sync = ctx.tuya.time_sync ?? '1970';
        return true;
    }
    return false;
};
export {tuyaOnEvent};

export const TUYA_EXT: Record<string, ExtTranslator> = {
    'tuya.modernExtend.tuyaBase': tuyaBase,
    'tuya.modernExtend.tuyaMagicPacket': tuyaMagicPacket,
    'tuya.modernExtend.dpNumeric': dpNumeric,
    'tuya.modernExtend.dpBinary': dpBinary,
    'tuya.modernExtend.dpEnumLookup': dpEnumLookup,
    'tuya.modernExtend.dpLight': dpLight,
};
export type {Call};

// tuya.modernExtend.tuyaOnOff: On/Off plus Tuya attributes on standard and
// Tuya clusters (spec 10.4).
const ONOFF_SELECTS: Record<string, {key: string; cluster: string; attr: string; map: Record<number, string>; type?: string}> = {
    powerOnBehavior: {key: 'power_on_behavior', cluster: 'genOnOff', attr: 'moesStartUpOnOff', map: {0: 'off', 1: 'on', 2: 'previous'}},
    powerOutageMemory: {key: 'power_outage_memory', cluster: 'genOnOff', attr: 'moesStartUpOnOff', map: {0: 'off', 1: 'on', 2: 'restore'}},
    powerOnBehavior2: {key: 'power_on_behavior', cluster: 'manuSpecificTuya3', attr: 'powerOnBehavior', map: {0: 'off', 1: 'on', 2: 'previous'}},
    switchType: {key: 'switch_type', cluster: 'manuSpecificTuya3', attr: 'switchType', map: {0: 'toggle', 1: 'state', 2: 'momentary'}},
    switchTypeButton: {key: 'switch_type_button', cluster: 'manuSpecificTuya3', attr: 'switchType', map: {0: 'release', 1: 'press'}},
    switchTypeCurtain: {key: 'switch_type_curtain', cluster: 'manuSpecificTuya3', attr: 'switchType', map: {0: 'flip-switch', 1: 'sync-switch', 2: 'button-switch', 3: 'button2-switch'}},
    backlightModeLowMediumHigh: {key: 'backlight_mode', cluster: 'genOnOff', attr: 'tuyaBacklightMode', map: {0: 'low', 1: 'medium', 2: 'high'}},
    backlightModeOffNormalInverted: {key: 'backlight_mode', cluster: 'genOnOff', attr: 'tuyaBacklightMode', map: {0: 'off', 1: 'normal', 2: 'inverted'}},
    indicatorMode: {key: 'indicator_mode', cluster: 'genOnOff', attr: 'tuyaBacklightMode', map: {0: 'off', 1: 'off/on', 2: 'on/off', 3: 'on'}},
    indicatorModeNoneRelayPos: {key: 'indicator_mode', cluster: 'genOnOff', attr: 'tuyaBacklightMode', map: {0: 'none', 1: 'relay', 2: 'pos'}},
    switchMode: {key: 'switch_mode', cluster: 'manuSpecificTuya3', attr: 'switchMode', map: {0: 'switch', 1: 'scene'}},
};

const tuyaOnOff: ExtTranslator = (ctx, call, ext) => {
    let a = call.args[0] || {};
    a = {...a};
    checkArgs('tuya.tuyaOnOff', a, ['onOffCountdown', 'indicatorMode', 'powerOutageMemory', 'childLock', 'inchingSwitch', 'backlightModeOffOn', 'powerOnBehavior2',
        'powerOnBehavior3', 'powerOnBehavior', 'switchType', 'switchTypeButton', 'switchTypeCurtain', 'backlightModeLowMediumHigh', 'backlightModeOffNormalInverted',
        'indicatorModeNoneRelayPos', 'electricalMeasurements', 'electricalMeasurementsFzConverter', 'switchMode', 'endpoints'],
        ['electricalMeasurementsFzConverter', 'onOffCountdown', 'indicatorMode', 'powerOutageMemory', 'childLock', 'inchingSwitch', 'backlightModeOffOn',
            'powerOnBehavior2', 'switchType', 'switchTypeButton']);
    const emFz = a.electricalMeasurementsFzConverter;
    const emName = emFz ? ctx.zhc.named.get(emFz) : undefined;
    if (emName === 'tuya.fz.TS011F_electrical_measurement') addTemplate(ctx, 'tuya_metering_zero_debounce');
    else if (emFz && emName !== 'fz.electrical_measurement') untr(`tuya.tuyaOnOff: electrical measurement converter ${emName ?? '(custom)'}`);
    const cond: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(a)) {
        if (typeof v === 'function' && k !== 'electricalMeasurementsFzConverter') {
            cond[k] = manufacturerCondition(ctx, v as Function, `tuya.tuyaOnOff ${k}`);
            a[k] = true;
        }
    }
    if (a.onOffCountdown) untr('tuya.tuyaOnOff: onOffCountdown (countdown is set with On With Timed Off; no command-based number binding in v1)');
    if (a.inchingSwitch) untr('tuya.tuyaOnOff: inchingSwitch (raw Tuya cluster attribute)');
    const eps: (number | undefined)[] = a.endpoints ? ctx.epsFor(a.endpoints) : [undefined];
    const zcl = (cluster: string, attr: string) => {
        const r = ctx.zcl.attr(cluster, attr, ctx.customClusters);
        if (!r || !r.type) untr(`tuya.tuyaOnOff: attribute ${cluster}.${attr}`);
        return {cluster: r.cluster, attr: r.attr, type: r.type, ...(r.mfr != null ? {mfr: r.mfr} : {})};
    };
    const flags: string[] = [];
    if (a.powerOutageMemory || a.powerOnBehavior2) {
        if (a.powerOnBehavior2) flags.push('powerOnBehavior2');
        if (a.powerOutageMemory) flags.push('powerOutageMemory');
    } else if (a.powerOnBehavior3) {
        for (const ep of eps) ctx.addEntity({key: 'power_on_behavior', platform: 'select', category: 'config', ...(ep !== undefined ? {ep} : {}),
            zcl: {cluster: 0xef00, attr: 0x4002, type: 'enum8'}, map: {0: 'off', 1: 'on', 2: 'previous'}});
    } else if (a.powerOnBehavior !== false) flags.push('powerOnBehavior');
    for (const k of ['switchType', 'switchTypeButton', 'switchTypeCurtain', 'backlightModeLowMediumHigh', 'backlightModeOffNormalInverted', 'indicatorMode',
        'indicatorModeNoneRelayPos', 'switchMode']) if (a[k]) flags.push(k);
    ctx.generic.exclude.add('power_on_behavior');
    for (const f of flags) {
        const s = ONOFF_SELECTS[f];
        const perEp = ['powerOnBehavior', 'powerOnBehavior2', 'switchMode'].includes(f) ? eps : [undefined];
        for (const ep of perEp) {
            ctx.addEntity({key: s.key, platform: 'select', category: 'config', ...(ep !== undefined ? {ep} : {}), zcl: zcl(s.cluster, s.attr), map: s.map,
                ...(cond[f] ? {present_if: cond[f]} : {})});
        }
    }
    if (a.backlightModeOffOn) ctx.addEntity({key: 'backlight_mode', platform: 'switch', category: 'config', zcl: zcl('genOnOff', 'tuyaBacklightSwitch'), value_on: 1, value_off: 0,
        ...(cond.backlightModeOffOn ? {present_if: cond.backlightModeOffOn} : {})});
    if (a.childLock) ctx.addEntity({key: 'child_lock', platform: 'switch', category: 'config', zcl: {cluster: 0x0006, attr: 0x8000, type: 'bool'},
        ...(cond.childLock ? {present_if: cond.childLock} : {})});
    ctx.flags.add('tuya');
    ctx.flags.add('generic');
    ctx.claim(ext.exposes);
};
TUYA_EXT['tuya.modernExtend.tuyaOnOff'] = tuyaOnOff;

// A zhc flag given as a function of the manufacturer name -> `present_if`
// over `fp.manufacturer`. The function is probed with every manufacturer name
// zhc knows plus synthetic names; prefix-dependent functions are rejected.
let corpusNames: string[] | undefined;
export function manufacturerCondition(ctx: Ctx, f: Function, what: string): string {
    if (!corpusNames) {
        const s = new Set<string>();
        for (const {d} of ctx.zhc.definitions) {
            for (const fp of Array.isArray(d.fingerprint) ? d.fingerprint : []) if (typeof fp.manufacturerName === 'string') s.add(fp.manufacturerName);
            for (const w of d.whiteLabel || []) for (const fp of w.fingerprint || []) if (typeof fp.manufacturerName === 'string') s.add(fp.manufacturerName);
        }
        corpusNames = [...s].sort();
    }
    const call = (m: string) => {
        try {
            return !!f(m);
        } catch {
            return untr(`${what}: condition throws`);
        }
    };
    const dflt = call('zzzz_unknown');
    const prefixes = [...new Set(corpusNames.map((n) => (/^(_T[A-Z0-9]{4}_)/.exec(n) || [])[1]).filter(Boolean))];
    for (const p of prefixes) if (call(`${p}zzzzzzzz`) !== dflt) untr(`${what}: condition depends on a name prefix`);
    const diff = corpusNames.filter((n) => call(n) !== dflt);
    if (diff.length === 0) return dflt ? 'true' : 'false';
    if (diff.length > 60) untr(`${what}: condition over ${diff.length} names`);
    const map = diff.map((n) => `${JSON.stringify(n)}: ${!dflt}`).join(', ');
    return `lookup(fp.manufacturer, {${map}}, ${dflt})`;
}

// Legacy named Tuya converters for the same attributes (fz and tz name the same entity).
const NAMED_ONOFF: Record<string, string> = {
    'tuya.fz.power_on_behavior_1': 'powerOnBehavior', 'tuya.tz.power_on_behavior_1': 'powerOnBehavior',
    'tuya.fz.power_outage_memory': 'powerOutageMemory',
    'tuya.fz.power_on_behavior_2': 'powerOnBehavior2', 'tuya.tz.power_on_behavior_2': 'powerOnBehavior2',
    'tuya.fz.indicator_mode': 'indicatorMode', 'tuya.fz.indicator_mode_none_relay_pos': 'indicatorModeNoneRelayPos',
    'tuya.fz.backlight_mode_low_medium_high': 'backlightModeLowMediumHigh', 'tuya.fz.backlight_mode_off_normal_inverted': 'backlightModeOffNormalInverted',
    'tuya.fz.switch_type': 'switchType', 'tuya.tz.switch_type': 'switchType', 'tuya.fz.switch_type_button': 'switchTypeButton',
    'tuya.tz.switch_type_button': 'switchTypeButton', 'tuya.fz.switch_type_curtain': 'switchTypeCurtain', 'tuya.tz.switch_type_curtain': 'switchTypeCurtain',
};
// tz converters that only write what an fz above reads (no entity of their own)
const WRITE_ONLY = new Set(['tuya.tz.backlight_indicator_mode_1', 'tuya.tz.backlight_indicator_mode_none_relay_pos']);
for (const [name, flag] of Object.entries(NAMED_ONOFF)) {
    VENDOR_NAMED[name] = (ctx) => {
        const s = ONOFF_SELECTS[flag];
        if (ctx.entities.some((e) => e.key === s.key)) return;
        const r = ctx.zcl.attr(s.cluster, s.attr, ctx.customClusters);
        if (!r?.type) return ctx.fail(name, `attribute ${s.cluster}.${s.attr} unknown`);
        if (s.key === 'power_on_behavior') ctx.generic.exclude.add('power_on_behavior');
        const ex = ctx.exposes.map((x) => x.expose).find((e: any) => e?.name === s.key);
        ctx.addEntity({key: s.key, platform: 'select', category: 'config', zcl: {cluster: r.cluster, attr: r.attr, type: r.type}, map: s.map});
        ctx.flags.add('tuya');
        if (ex) ctx.claim(ex);
    };
}
for (const name of WRITE_ONLY) VENDOR_NAMED[name] = (ctx) => void ctx.flags.add('tuya');
VENDOR_NAMED['tuya.fz.child_lock'] = VENDOR_NAMED['tuya.tz.child_lock'] = (ctx) => {
    if (ctx.entities.some((e) => e.key === 'child_lock')) return;
    ctx.addEntity({key: 'child_lock', platform: 'switch', category: 'config', zcl: {cluster: 0x0006, attr: 0x8000, type: 'bool'}});
    ctx.flags.add('tuya');
    ctx.claim(ctx.exposes.map((x) => x.expose).filter((e: any) => e?.name === 'child_lock'));
};
VENDOR_NAMED['tuya.fz.backlight_mode_off_on'] = VENDOR_NAMED['tuya.tz.backlight_indicator_mode_2'] = (ctx) => {
    if (ctx.entities.some((e) => e.key === 'backlight_mode')) return;
    const r = ctx.zcl.attr('genOnOff', 'tuyaBacklightSwitch', ctx.customClusters);
    if (!r?.type) return ctx.fail('tuya.fz.backlight_mode_off_on', 'attribute unknown');
    ctx.addEntity({key: 'backlight_mode', platform: 'switch', category: 'config', zcl: {cluster: r.cluster, attr: r.attr, type: r.type}, value_on: 1, value_off: 0});
    ctx.flags.add('tuya');
    ctx.claim(ctx.exposes.map((x) => x.expose).filter((e: any) => e?.name === 'backlight_mode'));
};
// commandTuyaAction (genOnOff 0xFD): button events, "<ep>_" prefix on multi-endpoint devices.
VENDOR_NAMED['tuya.fz.on_off_action'] = (ctx) => {
    const ex = ctx.exposes.map((x) => x.expose).find((e: any) => e?.name === 'action');
    const values: string[] = ex?.values ?? ['single', 'double', 'hold'];
    const click = '{0: "single", 1: "double", 2: "hold"}';
    const eps = [...new Set(values.map((v) => (/^(\d+)_/.exec(v) || [])[1]).filter(Boolean))].map(Number).sort((a, b) => a - b);
    const triggers = eps.length
        ? eps.map((ep) => ({cmd: {ep, cluster: 0x0006, id: 0xfd}, event: `"${ep}_" + lookup(payload[0], ${click})`}))
        : [{cmd: {cluster: 0x0006, id: 0xfd}, event: `lookup(payload[0], ${click})`}];
    ctx.addEntity({key: 'action', platform: 'event', device_class: 'button', event_types: values, triggers});
    ctx.flags.add('tuya');
    if (ex) ctx.claim(ex);
};
