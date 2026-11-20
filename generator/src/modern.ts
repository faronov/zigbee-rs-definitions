// Translators for zhc's generic modernExtend functions (m.*).
import type {Call} from './zhc';
import {ACCESS} from './ha';
import {Ctx, accessField, accessOf, baseEntity, checkArgs, reportField, scaleFields, untr} from './ctx';

export type ExtTranslator = (ctx: Ctx, call: Call, ext: any) => void;

const asArray = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

function findExpose(ext: any, name: string, endpoint?: string): any {
    return asArray(ext.exposes).find((e: any) => e && typeof e === 'object' && e.name === name && (endpoint === undefined || e.endpoint === endpoint))
        ?? asArray(ext.exposes).find((e: any) => e && typeof e === 'object' && e.name === name);
}

function zclBinding(ctx: Ctx, fn: string, args: any) {
    const mfr = args.zigbeeCommandOptions?.manufacturerCode;
    if (args.zigbeeCommandOptions && Object.keys(args.zigbeeCommandOptions).some((k) => k !== 'manufacturerCode' && k !== 'disableDefaultResponse')) {
        untr(`${fn}: zigbeeCommandOptions ${Object.keys(args.zigbeeCommandOptions).join(',')}`);
    }
    const ref = ctx.zcl.attr(args.cluster, args.attribute, ctx.customClusters, mfr);
    if (!ref) untr(`${fn}: attribute ${JSON.stringify(args.attribute)} of cluster ${args.cluster} unknown`);
    if (!ref.type) untr(`${fn}: attribute ${JSON.stringify(args.attribute)} has ZCL type ${ref.typeId} without a zdef type`);
    const zcl: any = {cluster: ref.cluster, attr: ref.attr, type: ref.type};
    if (ref.mfr != null) zcl.mfr = ref.mfr;
    return zcl;
}

// ---- m.numeric / m.enumLookup / m.binary / m.text ----------------------------

const NUMERIC_ARGS = ['name', 'cluster', 'attribute', 'description', 'zigbeeCommandOptions', 'access', 'unit', 'reporting', 'valueMin', 'valueMax',
    'valueStep', 'scale', 'label', 'entityCategory', 'precision', 'endpointNames', 'homeassistant', 'presets', 'fzConvert'];

export const numeric: ExtTranslator = (ctx, call, ext) => {
    const a = call.args[0] || {};
    checkArgs('m.numeric', a, NUMERIC_ARGS);
    if (a.fzConvert) untr('m.numeric: fzConvert is code');
    const zcl = zclBinding(ctx, 'm.numeric', a);
    const access = accessOf(a.access);
    const names = asArray(a.name);
    const eps = ctx.epsFor(a.endpointNames);
    eps.forEach((ep, i) => {
        const name = names.length > 1 ? names[i] : names[0];
        const epName = a.endpointNames ? a.endpointNames[i] : undefined;
        const expose = findExpose(ext, name, epName) ?? {type: 'numeric', name, access, unit: a.unit};
        const e = baseEntity(expose, name);
        if (ep !== undefined) e.ep = ep;
        e.zcl = zcl;
        Object.assign(e, scaleFields(Array.isArray(a.scale) ? untr('scale list') : a.scale));
        const prec = Array.isArray(a.precision) ? a.precision[i] : a.precision;
        if (prec !== undefined && prec !== null) e.precision = prec;
        const acc = accessField(e.platform, access);
        if (acc) e.access = acc;
        const rep = reportField(ctx.zhc, a.reporting);
        if (rep) e.report = rep;
        ctx.addEntity(e);
    });
    ctx.claim(ext.exposes);
};

export const enumLookup: ExtTranslator = (ctx, call, ext) => {
    const a = call.args[0] || {};
    checkArgs('m.enumLookup', a, ['name', 'lookup', 'cluster', 'attribute', 'description', 'zigbeeCommandOptions', 'access', 'endpointName', 'reporting',
        'entityCategory', 'label', 'fzConvert']);
    if (a.fzConvert) untr('m.enumLookup: fzConvert is code');
    const zcl = zclBinding(ctx, 'm.enumLookup', a);
    const access = accessOf(a.access);
    const expose = findExpose(ext, a.name) ?? {type: 'enum', name: a.name, access, values: Object.keys(a.lookup)};
    const e = baseEntity(expose, a.name);
    const ep = ctx.epsFor(a.endpointName ? [a.endpointName] : undefined)[0];
    if (ep !== undefined) e.ep = ep;
    e.zcl = zcl;
    const map: Record<string, string> = {};
    for (const [label, raw] of Object.entries(a.lookup)) {
        const r = typeof raw === 'object' && raw !== null && typeof (raw as any).valueOf === 'function' ? (raw as any).valueOf() : raw;
        if (typeof r !== 'number' || !Number.isInteger(r)) untr(`m.enumLookup: lookup value ${JSON.stringify(raw)} is not an integer`);
        map[String(r)] = label;
    }
    e.map = map;
    const acc = accessField(e.platform, access);
    if (acc) e.access = acc;
    const rep = reportField(ctx.zhc, a.reporting);
    if (rep) e.report = rep;
    ctx.addEntity(e);
    ctx.claim(ext.exposes);
};

// Raw value of a zhc binary valueOn/valueOff pair -> YAML value.
function rawBool(v: any): any {
    if (typeof v === 'boolean' || typeof v === 'number') return v;
    if (v && typeof v === 'object' && typeof v.valueOf === 'function' && typeof v.valueOf() === 'number') return v.valueOf();
    return untr(`binary raw value ${JSON.stringify(v)} not supported`);
}

export function binaryValues(e: any, on: any, off: any, zclType?: string) {
    let vOn = rawBool(on);
    let vOff = rawBool(off);
    const isBoolType = zclType === undefined || zclType === 'bool';
    if (zclType === 'bool') {
        if (vOn === 1) vOn = true;
        if (vOff === 0) vOff = false;
        if (vOn === 0) vOn = false;
        if (vOff === 1) vOff = true;
    }
    if (vOn === true && vOff === false && isBoolType) return;
    if (vOn === false && vOff === true && isBoolType) {
        e.from = '!x';
        if (e.platform === 'switch') e.to = '!x';
        return;
    }
    if (typeof vOn === 'boolean' || typeof vOff === 'boolean') {
        // bool raw values on a non-bool attribute type
        vOn = vOn === true ? 1 : vOn === false ? 0 : vOn;
        vOff = vOff === true ? 1 : vOff === false ? 0 : vOff;
    }
    if (vOn === 1 && vOff === 0 && e.platform !== 'switch') return; // non-zero = on is the default
    e.value_on = vOn;
    e.value_off = vOff;
}

export const binary: ExtTranslator = (ctx, call, ext) => {
    const a = call.args[0] || {};
    checkArgs('m.binary', a, ['name', 'valueOn', 'valueOff', 'cluster', 'attribute', 'description', 'zigbeeCommandOptions', 'access', 'endpointName', 'reporting',
        'label', 'entityCategory', 'homeassistant']);
    const zcl = zclBinding(ctx, 'm.binary', a);
    const access = accessOf(a.access);
    const epNames = a.endpointName === undefined ? undefined : asArray(a.endpointName);
    const eps = ctx.epsFor(epNames);
    eps.forEach((ep, i) => {
        const expose = findExpose(ext, a.name, epNames?.[i]) ?? {type: 'binary', name: a.name, access};
        const e = baseEntity(expose, a.name);
        if (ep !== undefined) e.ep = ep;
        e.zcl = zcl;
        binaryValues(e, a.valueOn[1], a.valueOff[1], zcl.type);
        const acc = accessField(e.platform, access);
        if (acc) e.access = acc;
        const rep = reportField(ctx.zhc, a.reporting);
        if (rep) e.report = rep;
        ctx.addEntity(e);
    });
    ctx.claim(ext.exposes);
};

export const text: ExtTranslator = (ctx, call, ext) => {
    const a = call.args[0] || {};
    checkArgs('m.text', a, ['name', 'cluster', 'attribute', 'description', 'zigbeeCommandOptions', 'access', 'endpointName', 'reporting', 'entityCategory']);
    const zcl = zclBinding(ctx, 'm.text', a);
    const access = accessOf(a.access);
    const expose = findExpose(ext, a.name) ?? {type: 'text', name: a.name, access};
    const e = baseEntity(expose, a.name);
    const ep = ctx.epsFor(a.endpointName ? [a.endpointName] : undefined)[0];
    if (ep !== undefined) e.ep = ep;
    e.zcl = zcl;
    const acc = accessField(e.platform, access);
    if (acc) e.access = acc;
    const rep = reportField(ctx.zhc, a.reporting);
    if (rep) e.report = rep;
    ctx.addEntity(e);
    ctx.claim(ext.exposes);
};

// ---- structure ---------------------------------------------------------------

export const deviceAddCustomCluster: ExtTranslator = (ctx, call) => {
    const [name, def] = call.args;
    ctx.customClusters[name] = def;
};

export const deviceEndpoints: ExtTranslator = (ctx, call) => {
    const a = call.args[0] || {};
    checkArgs('m.deviceEndpoints', a, ['endpoints', 'multiEndpointSkip']);
    for (const [n, ep] of Object.entries(a.endpoints || {})) ctx.endpointNames[n] = Number(ep);
};

// ---- generic-tier extends -----------------------------------------------------

// The generic tier (spec 5) exposes these by itself; a definition only records
// deviations (reporting, fixed endpoints names).
const GENERIC_SENSORS: Record<string, {key: string; cluster: string; attribute: string; scale?: number}> = {
    temperature: {key: 'temperature', cluster: 'msTemperatureMeasurement', attribute: 'measuredValue', scale: 100},
    humidity: {key: 'humidity', cluster: 'msRelativeHumidity', attribute: 'measuredValue', scale: 100},
    pressure: {key: 'pressure', cluster: 'msPressureMeasurement', attribute: 'measuredValue'},
    illuminance: {key: 'illuminance', cluster: 'msIlluminanceMeasurement', attribute: 'measuredValue'},
    co2: {key: 'co2', cluster: 'msCO2', attribute: 'measuredValue'},
    pm25: {key: 'pm25', cluster: 'pm25Measurement', attribute: 'measuredValue'},
    soilMoisture: {key: 'soil_moisture', cluster: 'msSoilMoisture', attribute: 'measuredValue', scale: 100},
    deviceTemperature: {key: 'device_temperature', cluster: 'genDeviceTempCfg', attribute: 'currentTemperature'},
};

function genericSensor(fn: string): ExtTranslator {
    const g = GENERIC_SENSORS[fn];
    return (ctx, call, ext) => {
        const a = call.args[0] || {};
        checkArgs(`m.${fn}`, a, ['reporting', 'endpointNames', 'description', 'access', 'label', 'precision', 'cluster', 'attribute', 'scale', 'unit',
            'valueMin', 'valueMax', 'entityCategory', 'name', 'homeassistant', 'reportingConfig']);
        const custom = (a.cluster && a.cluster !== g.cluster) || (a.attribute && a.attribute !== g.attribute)
            || (a.scale !== undefined && a.scale !== g.scale) || (a.name && a.name !== g.key);
        if (custom) {
            // Same semantics as m.numeric with the extend's defaults.
            const dflt: any = {name: g.key, cluster: g.cluster, attribute: g.attribute, scale: g.scale, access: 'STATE_GET'};
            numeric(ctx, {...call, fn: 'm.numeric', args: [{...dflt, ...a}]}, ext);
            return;
        }
        const rep = reportField(ctx.zhc, a.reporting);
        if (rep) ctx.patch(g.key, {report: rep});
        if (a.reporting === false) ctx.patch(g.key, {report: 'off'});
        if (a.precision !== undefined) ctx.patch(g.key, {precision: a.precision});
        ctx.flags.add('generic');
        ctx.claim(ext.exposes);
    };
}

const battery: ExtTranslator = (ctx, call, ext) => {
    const a = call.args[0] || {};
    checkArgs('m.battery', a, ['percentage', 'voltage', 'lowStatus', 'percentageReporting', 'voltageReporting', 'dontDividePercentage', 'percentageReportingConfig',
        'voltageReportingConfig', 'lowStatusReportingConfig', 'voltageToPercentage', 'voltageExposeCategory', 'percentageExposeCategory']);
    if (a.percentage === false) ctx.generic.exclude.add('battery');
    if (a.voltage) ctx.patch('battery_voltage', {enabled: true});
    if (a.percentageReporting === false) ctx.patch('battery', {report: 'off'});
    else if (a.percentageReportingConfig) ctx.patch('battery', {report: reportField(ctx.zhc, a.percentageReportingConfig)});
    if (a.voltageReporting && a.voltageReportingConfig) ctx.patch('battery_voltage', {report: reportField(ctx.zhc, a.voltageReportingConfig)});
    if (a.dontDividePercentage) ctx.patch('battery', {div: 1});
    if (a.voltageToPercentage !== undefined) setBatteryCurve(ctx, a.voltageToPercentage);
    if (a.lowStatus) {
        ctx.addEntity({key: 'battery_low', platform: 'binary_sensor', device_class: 'battery', category: 'diagnostic',
            zcl: {cluster: 0x0001, attr: 0x003e, type: 'map32'}, from: '(x & 0xF03C0F) != 0',
            ...(a.lowStatusReportingConfig ? {report: reportField(ctx.zhc, a.lowStatusReportingConfig)} : {})});
    }
    ctx.flags.add('generic');
    ctx.claim(ext.exposes);
};

export function setBatteryCurve(ctx: Ctx, v: any) {
    if (typeof v === 'string') ctx.device.battery = {curve: v};
    else if (v && typeof v === 'object' && typeof v.min === 'number' && typeof v.max === 'number') {
        ctx.device.battery = {voltage_to_percent: [v.min, v.max]};
    } else untr(`battery voltageToPercentage ${JSON.stringify(v)}`);
}

const onOff: ExtTranslator = (ctx, call, ext) => {
    const a = call.args[0] || {};
    checkArgs('m.onOff', a, ['powerOnBehavior', 'skipDuplicateTransaction', 'configureReporting', 'endpointNames', 'description', 'homeassistant', 'ota']);
    if (a.powerOnBehavior === false) ctx.generic.exclude.add('power_on_behavior');
    if (a.configureReporting === false) ctx.patch('switch', {report: 'off'});
    if (a.ota) ctx.device.ota = true;
    if (a.endpointNames) ctx.epsFor(a.endpointNames);
    ctx.flags.add('generic');
    ctx.claim(ext.exposes);
};

const light: ExtTranslator = (ctx, call, ext) => {
    const a = call.args[0] || {};
    checkArgs('m.light', a, ['effect', 'powerOnBehavior', 'configureReporting', 'ota', 'color', 'colorTemp', 'levelConfig', 'turnsOffAtBrightness1', 'endpointNames',
        'levelReportingConfig', 'homeassistant', 'hueEffect', 'gradient']);
    if (a.moveToLevelWithOnOffDisable) untr('m.light: moveToLevelWithOnOffDisable');
    lightPatch(ctx, a);
    ctx.flags.add('generic');
    ctx.claim(ext.exposes);
};

export function lightPatch(ctx: Ctx, a: any) {
    if (a.powerOnBehavior === false) ctx.generic.exclude.add('power_on_behavior');
    if (a.ota) ctx.device.ota = true;
    if (a.endpointNames) ctx.epsFor(a.endpointNames);
    const parts: any = {};
    const range = a.colorTemp?.range;
    if (Array.isArray(range) && range.length === 2) parts.color_temp = {min: range[0], max: range[1]};
    const lr = a.levelReportingConfig ? reportField(ctx.zhc, a.levelReportingConfig) : undefined;
    if (lr) parts.brightness = {report: lr};
    if (Object.keys(parts).length) ctx.patch('light', {parts});
    if (a.turnsOffAtBrightness1) ctx.note('turnsOffAtBrightness1: brightness 1 switches this light off (generic light handles it as level 1)');
}

const identify: ExtTranslator = (ctx, call, ext) => {
    checkArgs('m.identify', call.args[0], ['isSleepy', 'endpointNames']);
    ctx.flags.add('generic');
    ctx.claim(ext.exposes);
};

const linkQuality: ExtTranslator = (ctx, call, ext) => {
    checkArgs('m.linkQuality', call.args[0], ['reporting', 'attribute', 'reportingConfig']);
    if (call.args[0]?.reporting) untr('m.linkQuality: periodic reporting of a Basic attribute as keep-alive');
    ctx.claim(ext.exposes);
};

// IAS Zone: the zhc zone type decides the semantics (many devices report a
// wrong ZoneType), so alarm entities are explicit; tamper and battery_low come
// from the generic tier.
const ZONE_CLASS: Record<string, string> = {
    occupancy: 'occupancy', contact: 'door', smoke: 'smoke', water_leak: 'moisture', carbon_monoxide: 'carbon_monoxide', sos: 'safety',
    vibration: 'vibration', alarm: 'safety', gas: 'gas', rain: 'moisture', presence: 'presence', motion: 'motion', fire: 'smoke',
};
const ZONE_BITS: Record<string, number> = {supervision_reports: 4, restore_reports: 5, trouble: 6, ac_status: 7, test: 8, battery_defect: 9};

const iasZoneAlarm: ExtTranslator = (ctx, call, ext) => {
    const a = call.args[0] || {};
    checkArgs('m.iasZoneAlarm', a, ['zoneType', 'zoneAttributes', 'alarmTimeout', 'description', 'manufacturerZoneAttributes', 'invertAlarm', 'zoneStatusReporting', 'endpointId']);
    const zoneType: string = a.zoneType;
    const attrs: string[] = a.zoneAttributes || [];
    const invert = (zoneType === 'contact') !== !!a.invertAlarm;
    const ep = a.endpointId;
    const zcl = {cluster: 0x0500, attr: 0x0002, type: 'map16'};
    const reset = a.alarmTimeout ? '90' : undefined;
    const alarm = (key: string, bit: number, dc?: string) => {
        // HA semantics: on = alarm. zhc `contact` is the inverse (true = closed), HA door is on = open.
        const e: any = {key, platform: 'binary_sensor'};
        if (dc) e.device_class = dc;
        if (ep !== undefined) e.ep = ep;
        e.zcl = zcl;
        const flip = invert && zoneType !== 'contact';
        e.from = `${flip ? '!' : ''}bit(x, ${bit})`;
        if (reset) e.reset_after = reset;
        ctx.addEntity(e);
    };
    if (zoneType === 'generic') {
        for (const at of attrs) {
            if (at === 'alarm_1') alarm('alarm_1', 0, 'safety');
            else if (at === 'alarm_2') alarm('alarm_2', 1, 'safety');
        }
    } else {
        const dc = ZONE_CLASS[zoneType];
        if (!dc) untr(`m.iasZoneAlarm: zone type ${zoneType}`);
        const both = attrs.includes('alarm_1') && attrs.includes('alarm_2');
        if (both) {
            alarm(`${zoneType}_alarm_1`, 0, dc);
            alarm(`${zoneType}_alarm_2`, 1, dc);
        } else if (attrs.includes('alarm_2')) alarm(zoneType, 1, dc);
        else alarm(zoneType, 0, dc);
    }
    for (const at of attrs) {
        if (ZONE_BITS[at] !== undefined) {
            ctx.addEntity({key: at, platform: 'binary_sensor', category: 'diagnostic', ...(ep !== undefined ? {ep} : {}), zcl, from: `bit(x, ${ZONE_BITS[at]})`});
        } else if (!['alarm_1', 'alarm_2', 'tamper', 'battery_low'].includes(at)) untr(`m.iasZoneAlarm: zone attribute ${at}`);
    }
    for (const m of a.manufacturerZoneAttributes || []) {
        const e: any = {key: m.name, platform: 'binary_sensor', ...(m.entityCategory ? {category: m.entityCategory} : {}), zcl, from: `bit(x, ${m.bit})`};
        if (m.valueOn === false && m.valueOff === true) e.from = `!bit(x, ${m.bit})`;
        ctx.addEntity(e);
    }
    if (a.zoneStatusReporting) ctx.configure.push({report: {cluster: 0x0500, attr: 0x0002, type: 'map16', report: [0, 3600, 0]}});
    ctx.flags.add('generic');
    ctx.claim(ext.exposes);
};

const iasWarning: ExtTranslator = (ctx, call, ext) => {
    checkArgs('m.iasWarning', call.args[0], ['reversePayload', 'maxDuration']);
    if (call.args[0]?.reversePayload) untr('m.iasWarning: reversePayload');
    ctx.flags.add('generic');
    ctx.claim(ext.exposes);
};

const METER_KEYS: Record<string, string> = {power: 'power', voltage: 'voltage', current: 'current', energy: 'energy'};

const electricityMeter: ExtTranslator = (ctx, call, ext) => {
    const a = call.args[0] || {};
    checkArgs('m.electricityMeter', a, ['cluster', 'current', 'voltage', 'power', 'energy', 'acFrequency', 'powerFactor', 'configureReporting', 'endpointNames',
        'threePhase', 'producedEnergy', 'electricalMeasurementType', 'apparentPower', 'status', 'extendedStatus', 'type']);
    if (a.threePhase) untr('m.electricityMeter: threePhase (phase B/C attributes are not in the generic tier)');
    if (a.producedEnergy) untr('m.electricityMeter: producedEnergy (CurrentSummationReceived is not in the generic tier)');
    if (a.apparentPower) untr('m.electricityMeter: apparentPower');
    if (a.electricalMeasurementType === 'dc' || a.electricalMeasurementType === 'both') untr('m.electricityMeter: DC measurement');
    if (a.status || a.extendedStatus) untr('m.electricityMeter: metering status');
    if (a.cluster === 'electrical') ctx.generic.exclude.add('energy');
    for (const [arg, key] of Object.entries(METER_KEYS)) {
        const v = a[arg];
        if (v === false) ctx.generic.exclude.add(key);
        else if (v && typeof v === 'object') {
            checkArgs(`m.electricityMeter ${arg}`, v, ['divisor', 'multiplier', 'min', 'max', 'change']);
            const p: any = {};
            if (v.divisor !== undefined) p.div = v.divisor;
            if (v.multiplier !== undefined) p.mul = v.multiplier;
            if (v.min !== undefined || v.max !== undefined || v.change !== undefined) {
                p.report = reportField(ctx.zhc, {min: v.min ?? 5, max: v.max ?? 900, change: v.change ?? 1});
            }
            ctx.patch(key, p);
        }
    }
    if (a.acFrequency === false) ctx.generic.exclude.add('frequency');
    if (a.powerFactor === false) ctx.generic.exclude.add('power_factor');
    if (a.acFrequency && typeof a.acFrequency === 'object') ctx.patch('frequency', {div: a.acFrequency.divisor ?? undefined, mul: a.acFrequency.multiplier ?? undefined});
    if (a.endpointNames) ctx.epsFor(a.endpointNames);
    ctx.flags.add('generic');
    ctx.claim(ext.exposes);
};

const windowCovering: ExtTranslator = (ctx, call, ext) => {
    const a = call.args[0] || {};
    checkArgs('m.windowCovering', a, ['controls', 'coverInverted', 'stateSource', 'configureReporting', 'coverMode', 'endpointNames']);
    if (a.coverMode) untr('m.windowCovering: coverMode (window covering mode attribute)');
    if (a.coverInverted) ctx.patch('cover', {invert: true});
    ctx.flags.add('generic');
    ctx.claim(ext.exposes);
};

const occupancy: ExtTranslator = (ctx, call, ext) => {
    const a = call.args[0] || {};
    checkArgs('m.occupancy', a, ['reporting', 'reportingConfig', 'pirConfig', 'ultrasonicConfig', 'contactConfig', 'endpointNames']);
    if (a.ultrasonicConfig || a.contactConfig) untr('m.occupancy: ultrasonic/contact configuration');
    for (const p of a.pirConfig || []) if (p !== 'otu_delay') untr(`m.occupancy: pirConfig ${p}`);
    if (a.reporting === false) ctx.patch('occupancy', {report: 'off'});
    else if (a.reportingConfig) ctx.patch('occupancy', {report: reportField(ctx.zhc, a.reportingConfig)});
    ctx.flags.add('generic');
    ctx.claim(ext.exposes);
};

const commands = (fn: string): ExtTranslator => (ctx, call, ext) => {
    checkArgs(fn, call.args[0], ['commands', 'bind', 'endpointNames', 'legacyAction']);
    ctx.flags.add('generic');
    ctx.claim(ext.exposes);
};

const thermostat: ExtTranslator = (ctx, call, ext) => {
    const a = call.args[0] || {};
    if (a.schedule || a.programmingOperationMode) untr('m.thermostat: weekly schedule / programming mode');
    if (a.acLouverPosition || a.temperatureSetpointHoldDuration || a.runningMode) untr('m.thermostat: louver/hold duration/running mode');
    for (const [k, v] of Object.entries(a)) if (typeof v === 'function') untr(`m.thermostat: argument ${k} is code`);
    ctx.flags.add('generic');
    ctx.claim(ext.exposes);
};

const thermostatUi: ExtTranslator = (ctx, call, ext) => {
    checkArgs('m.thermostatUi', call.args[0], ['cluster', 'endpointNames', 'reporting', 'bind']);
    ctx.flags.add('generic');
    ctx.claim(ext.exposes);
};

const lock: ExtTranslator = (ctx, call, ext) => {
    checkArgs('m.lock', call.args[0], ['endpointNames', 'pinCodeCount', 'readPinCodeOnProgrammingEvent']);
    ctx.flags.add('generic');
    // PIN code management is out of scope for v1 (spec 5.1): the pin_code
    // exposes stay unclaimed and make the definition partial.
    ctx.claim(asArray(ext.exposes).filter((e: any) => e && !/pin_code|user|programming/.test(e.name || '')));
};

const quirkCheckinInterval: ExtTranslator = (ctx, call) => {
    const t = call.args[0];
    const tl = ctx.zhc.libs.modernExtend.TIME_LOOKUP;
    const s = typeof t === 'number' ? t : tl[t];
    if (s === undefined) untr(`m.quirkCheckinInterval(${JSON.stringify(t)})`);
    ctx.device.checkin_s = s;
};

const POWER: Record<string, string> = {Battery: 'battery', 'Mains (single phase)': 'mains', 'Mains (3 phase)': 'mains', 'DC Source': 'mains'};
const forcePowerSource: ExtTranslator = (ctx, call) => {
    const p = POWER[call.args[0]?.powerSource];
    if (!p) untr(`m.forcePowerSource ${JSON.stringify(call.args[0])}`);
    ctx.device.power = p;
};

const forceDeviceType: ExtTranslator = (ctx, call) => {
    // zhc corrects Z2M's stored logical type; the hub decides sleepiness from
    // the Node descriptor's RxOnWhenIdle, which these devices report correctly.
    if (call.args[0]?.type === 'EndDevice') ctx.device.sleepy = true;
    ctx.noop('m.forceDeviceType', 'logical type override');
};

const bindCluster: ExtTranslator = (ctx, call) => {
    const a = call.args[0] || {};
    checkArgs('m.bindCluster', a, ['cluster', 'clusterType', 'endpointNames']);
    const cl = ctx.zcl.cluster(a.cluster, ctx.customClusters);
    if (!cl) untr(`m.bindCluster: cluster ${a.cluster}`);
    for (const ep of ctx.epsFor(a.endpointNames)) ctx.configure.push({bind: {...(ep !== undefined ? {ep} : {}), clusters: [cl.ID]}});
};

const pollControl: ExtTranslator = (ctx, call) => {
    const a = call.args[0] || {};
    checkArgs('m.pollControl', a, ['longPollInterval', 'checkinInterval', 'endpointId']);
    if (a.longPollInterval !== undefined) untr('m.pollControl: longPollInterval');
    if (a.checkinInterval !== undefined) ctx.configure.push({checkin: {...(a.endpointId && a.endpointId !== 1 ? {ep: a.endpointId} : {}), interval_qs: a.checkinInterval}});
};

const ignoreClusterReport: ExtTranslator = (ctx, call) => {
    const cl = ctx.zcl.cluster(call.args[0]?.cluster, ctx.customClusters);
    if (!cl) untr('m.ignoreClusterReport: cluster');
    ctx.ignore.push({cluster: cl.ID});
};

const customLocalTemperatureCalibrationRange: ExtTranslator = (ctx, call, ext) => {
    const {min, max} = call.args[0] || {};
    ctx.patch('local_temperature_calibration', {min, max});
    ctx.claim(ext.exposes);
};

const noopExt = (why: string): ExtTranslator => (ctx, call, ext) => {
    ctx.noop(call.fn, why);
    ctx.claim(ext.exposes);
};

export const MODERN: Record<string, ExtTranslator> = {
    'm.numeric': numeric,
    'm.enumLookup': enumLookup,
    'm.binary': binary,
    'm.text': text,
    'm.deviceAddCustomCluster': deviceAddCustomCluster,
    'm.deviceEndpoints': deviceEndpoints,
    'm.temperature': genericSensor('temperature'),
    'm.humidity': genericSensor('humidity'),
    'm.pressure': genericSensor('pressure'),
    'm.illuminance': genericSensor('illuminance'),
    'm.co2': genericSensor('co2'),
    'm.pm25': genericSensor('pm25'),
    'm.soilMoisture': genericSensor('soilMoisture'),
    'm.deviceTemperature': genericSensor('deviceTemperature'),
    'm.battery': battery,
    'm.onOff': onOff,
    'm.light': light,
    'm.identify': identify,
    'm.linkQuality': linkQuality,
    'm.iasZoneAlarm': iasZoneAlarm,
    'm.iasWarning': iasWarning,
    'm.electricityMeter': electricityMeter,
    'm.windowCovering': windowCovering,
    'm.occupancy': occupancy,
    'm.commandsOnOff': commands('m.commandsOnOff'),
    'm.commandsLevelCtrl': commands('m.commandsLevelCtrl'),
    'm.commandsColorCtrl': commands('m.commandsColorCtrl'),
    'm.commandsScenes': commands('m.commandsScenes'),
    'm.commandsWindowCovering': commands('m.commandsWindowCovering'),
    'm.thermostat': thermostat,
    'm.thermostatUi': thermostatUi,
    'm.lock': lock,
    'm.quirkCheckinInterval': quirkCheckinInterval,
    'm.forcePowerSource': forcePowerSource,
    'm.forceDeviceType': forceDeviceType,
    'm.bindCluster': bindCluster,
    'm.pollControl': pollControl,
    'm.ignoreClusterReport': ignoreClusterReport,
    'm.customLocalTemperatureCalibrationRange': customLocalTemperatureCalibrationRange,
};

export {ACCESS};
