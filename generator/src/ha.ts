// zhc expose -> Home Assistant entity fields (spec 4.3/4.4, 17.2).
//
// Follows the rules of Zigbee2MQTT's Home Assistant discovery: binary ->
// binary_sensor or switch, numeric -> sensor or number, enum -> sensor (enum)
// or select, text -> sensor or text, by access; device classes, units and
// state classes by property name, then by unit.

export const ACCESS = {STATE: 1, SET: 2, GET: 4};

// HA unit strings (UnitOf* values) the catalog uses; anything else is mapped
// through UNIT_ALIASES or dropped with a note.
export const HA_UNITS = new Set([
    '°C', '°F', 'K', '%', 'Pa', 'hPa', 'kPa', 'bar', 'mbar', 'mmHg', 'inHg', 'psi', 'W', 'kW', 'mW', 'Wh', 'kWh', 'MWh',
    'V', 'mV', 'kV', 'A', 'mA', 'Hz', 'kHz', 'VA', 'kVA', 'var', 'kvar', 'varh', 'kvarh', 'µs', 'ms', 's', 'min', 'h',
    'd', 'w', 'mm', 'cm', 'm', 'km', 'in', 'ft', 'L', 'mL', 'm³', 'ft³', 'gal', 'm³/h', 'L/min', 'L/h', 'L/s', 'm/s',
    'km/h', 'mm/h', 'mm/d', 'µg/m³', 'mg/m³', 'g/m³', 'ppm', 'ppb', 'lx', 'dB', 'dBA', 'dBm', 'µS/cm', 'mS/cm', 'g',
    'kg', 'mg', '°', 'W/m²', 'mired', 'B', 'kB', 'MB', 'GB', 'bit/s', 'kbit/s', 'p/m³', 'mol/m³', 'mm/s',
]);
const UNIT_ALIASES: Record<string, string> = {
    'ug/m3': 'µg/m³', 'μg/m³': 'µg/m³', 'µg/m3': 'µg/m³', 'mg/m3': 'mg/m³', 'g/m3': 'g/m³', 'm3': 'm³', 'm3/h': 'm³/h',
    lux: 'lx', Lux: 'lx', LUX: 'lx', sec: 's', secs: 's', seconds: 's', second: 's', minutes: 'min', minute: 'min',
    mins: 'min', hours: 'h', hour: 'h', hr: 'h', days: 'd', day: 'd', 'μS/cm': 'µS/cm', 'uS/cm': 'µS/cm', 'ºC': '°C',
    'C': '°C', 'kwh': 'kWh', 'KWh': 'kWh', 'kW·h': 'kWh', 'Kw': 'kW', 'l': 'L', 'l/min': 'L/min', 'l/h': 'L/h',
    'degree': '°', 'degrees': '°', '℃': '°C', 'dbm': 'dBm', 'db': 'dB', 'kvarh': 'kvarh', 'kVArh': 'kvarh', 'kVAr': 'kvar',
    'μs': 'µs', 'us': 'µs', meters: 'm', meter: 'm', metres: 'm', 'mins.': 'min', seconds_: 's', percent: '%', 'Percent': '%', 'kVAh': 'kVA', 'mmhg': 'mmHg', 'liters': 'L', 'litre': 'L', 'm³/s': 'm³/h',
};

export function haUnit(u: any): {unit?: string; dropped?: string} {
    if (u === undefined || u === null || u === '') return {};
    const s = String(u);
    if (HA_UNITS.has(s)) return {unit: s};
    if (UNIT_ALIASES[s] && HA_UNITS.has(UNIT_ALIASES[s]) && !(s === 'kVAh' || s === 'm³/s')) return {unit: UNIT_ALIASES[s]};
    return {dropped: s};
}

// Numeric sensor metadata by property (base name without endpoint suffix).
type NumMeta = {device_class?: string; state_class?: string; category?: string; enabled?: boolean; unit?: string};
const NUMERIC: Record<string, NumMeta> = {
    temperature: {device_class: 'temperature', state_class: 'measurement'},
    local_temperature: {device_class: 'temperature', state_class: 'measurement'},
    device_temperature: {device_class: 'temperature', state_class: 'measurement', category: 'diagnostic'},
    soil_temperature: {device_class: 'temperature', state_class: 'measurement'},
    external_temperature: {device_class: 'temperature', state_class: 'measurement'},
    floor_temperature: {device_class: 'temperature', state_class: 'measurement'},
    humidity: {device_class: 'humidity', state_class: 'measurement'},
    soil_moisture: {device_class: 'moisture', state_class: 'measurement'},
    moisture: {device_class: 'moisture', state_class: 'measurement'},
    pressure: {device_class: 'atmospheric_pressure', state_class: 'measurement'},
    illuminance: {device_class: 'illuminance', state_class: 'measurement'},
    illuminance_lux: {device_class: 'illuminance', state_class: 'measurement'},
    co2: {device_class: 'carbon_dioxide', state_class: 'measurement'},
    eco2: {device_class: 'carbon_dioxide', state_class: 'measurement'},
    co: {device_class: 'carbon_monoxide', state_class: 'measurement'},
    voc: {device_class: 'volatile_organic_compounds', state_class: 'measurement'},
    pm25: {device_class: 'pm25', state_class: 'measurement'},
    pm10: {device_class: 'pm10', state_class: 'measurement'},
    pm1: {device_class: 'pm1', state_class: 'measurement'},
    battery: {device_class: 'battery', state_class: 'measurement', category: 'diagnostic'},
    voltage: {device_class: 'voltage', state_class: 'measurement'},
    battery_voltage: {device_class: 'voltage', state_class: 'measurement', category: 'diagnostic', enabled: false},
    current: {device_class: 'current', state_class: 'measurement'},
    power: {device_class: 'power', state_class: 'measurement'},
    active_power: {device_class: 'power', state_class: 'measurement'},
    power_factor: {device_class: 'power_factor', state_class: 'measurement'},
    energy: {device_class: 'energy', state_class: 'total_increasing'},
    produced_energy: {device_class: 'energy', state_class: 'total_increasing'},
    energy_consumed: {device_class: 'energy', state_class: 'total_increasing'},
    energy_produced: {device_class: 'energy', state_class: 'total_increasing'},
    ac_frequency: {device_class: 'frequency', state_class: 'measurement'},
    frequency: {device_class: 'frequency', state_class: 'measurement'},
    linkquality: {state_class: 'measurement', category: 'diagnostic', enabled: false},
    distance: {device_class: 'distance', state_class: 'measurement'},
    target_distance: {device_class: 'distance', state_class: 'measurement'},
    noise: {device_class: 'sound_pressure', state_class: 'measurement'},
    gas_value: {state_class: 'measurement'},
    formaldehyd: {state_class: 'measurement'},
    water_consumed: {device_class: 'water', state_class: 'total_increasing'},
    pi_heating_demand: {state_class: 'measurement'},
};
// Unit -> device class fallback for sensors (only unambiguous ones).
const UNIT_CLASS: Record<string, string> = {
    '°C': 'temperature', '°F': 'temperature', 'W': 'power', 'kW': 'power', 'kWh': 'energy', 'Wh': 'energy',
    'V': 'voltage', 'mV': 'voltage', 'A': 'current', 'mA': 'current', 'Hz': 'frequency', 'lx': 'illuminance',
    'hPa': 'pressure', 'kPa': 'pressure', 'Pa': 'pressure', 'µg/m³': 'pm25', 'dBm': 'signal_strength',
};
const PREFIX_CLASS: [RegExp, string][] = [
    [/^(voltage|rms_voltage)(_|$)/, 'voltage'], [/^(current|rms_current)(_|$)/, 'current'], [/^(power|active_power)(_|$)/, 'power'],
    [/^energy(_|$)/, 'energy'], [/^(temperature|local_temperature)(_|$)/, 'temperature'], [/^humidity(_|$)/, 'humidity'],
];

const BINARY: Record<string, {device_class?: string; category?: string; invert?: boolean}> = {
    occupancy: {device_class: 'occupancy'}, presence: {device_class: 'presence'}, motion: {device_class: 'motion'},
    contact: {device_class: 'door', invert: true}, water_leak: {device_class: 'moisture'}, smoke: {device_class: 'smoke'},
    gas: {device_class: 'gas'}, carbon_monoxide: {device_class: 'carbon_monoxide'}, vibration: {device_class: 'vibration'},
    tamper: {device_class: 'tamper', category: 'diagnostic'}, battery_low: {device_class: 'battery', category: 'diagnostic'},
    moving: {device_class: 'moving'}, sos: {device_class: 'safety'}, alarm: {device_class: 'safety'},
    heating: {device_class: 'heat'}, window_open: {device_class: 'window'}, rain: {device_class: 'moisture'},
    water_leak_1: {device_class: 'moisture'}, fault: {device_class: 'problem', category: 'diagnostic'},
    error: {device_class: 'problem', category: 'diagnostic'}, light: {device_class: 'light'},
    lock: {device_class: 'lock'}, charging: {device_class: 'battery_charging'}, plug: {device_class: 'plug'},
};
const PRIMARY_SWITCH = /^(state|switch|valve|pump|relay|socket|outlet)(_(l|ep|left|right|center|top|bottom|middle)?\d*)?$/;

export interface EntityMeta {
    key: string;
    platform: string;
    device_class?: string;
    unit?: string;
    state_class?: string;
    category?: string;
    enabled?: boolean;
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
    invert?: boolean;
    notes: string[];
}

export function baseName(expose: any): string {
    return expose.name ?? expose.property ?? 'value';
}

export function propertyOf(expose: any): string {
    return expose.property ?? expose.name ?? (expose.endpoint ? `${expose.type}_${expose.endpoint}` : expose.type);
}

// Entity metadata for a scalar expose (binary, numeric, enum, text).
export function exposeMeta(expose: any, key?: string): EntityMeta {
    const name = baseName(expose);
    const access = expose.access ?? ACCESS.STATE;
    const writable = (access & ACCESS.SET) !== 0;
    const notes: string[] = [];
    const m: EntityMeta = {key: key ?? name, platform: 'sensor', notes};
    const cat = expose.category; // zhc: 'config' | 'diagnostic'
    switch (expose.type) {
        case 'binary': {
            const b = BINARY[name] ?? {};
            if (writable) {
                m.platform = 'switch';
                if (!PRIMARY_SWITCH.test(name)) m.category = 'config';
            } else {
                m.platform = 'binary_sensor';
                if (b.device_class) m.device_class = b.device_class;
                if (b.category) m.category = b.category;
                if (b.invert) m.invert = true;
            }
            break;
        }
        case 'numeric': {
            const u = haUnit(expose.unit);
            if (u.unit) m.unit = u.unit;
            if (u.dropped) notes.push(`unit "${u.dropped}" is not an HA unit; dropped`);
            if (writable) {
                m.platform = 'number';
                m.category = 'config';
                if (expose.value_min !== undefined) m.min = expose.value_min;
                if (expose.value_max !== undefined) m.max = expose.value_max;
                if (expose.value_step !== undefined) m.step = expose.value_step;
                const nm = NUMERIC[name];
                if (nm?.device_class && nm.device_class !== 'battery' && nm.device_class !== 'energy') m.device_class = nm.device_class;
            } else {
                m.platform = 'sensor';
                const nm = NUMERIC[name];
                let dc = nm?.device_class;
                if (!dc) for (const [re, c] of PREFIX_CLASS) if (re.test(name)) dc = c;
                if (!dc && m.unit && UNIT_CLASS[m.unit] && !(m.unit === 'µg/m³')) dc = UNIT_CLASS[m.unit];
                if (dc && !unitFits(dc, m.unit)) dc = undefined;
                if (dc) m.device_class = dc;
                m.state_class = nm?.state_class ?? (dc === 'energy' ? 'total_increasing' : 'measurement');
                if (nm?.category) m.category = nm.category;
                if (nm?.enabled === false) m.enabled = false;
            }
            break;
        }
        case 'enum': {
            m.options = (expose.values ?? []).map(String);
            if (writable) {
                m.platform = 'select';
                m.category = 'config';
            } else {
                m.platform = 'sensor';
                m.device_class = 'enum';
            }
            break;
        }
        case 'text': {
            m.platform = writable ? 'text' : 'sensor';
            if (writable) m.category = 'config';
            break;
        }
        default:
            m.platform = 'sensor';
    }
    if (cat === 'config' || cat === 'diagnostic') m.category = cat;
    if (writable && m.category === 'diagnostic' && m.platform !== 'sensor' && m.platform !== 'binary_sensor') m.category = 'config';
    return m;
}

// Units HA accepts per sensor device class (subset of HA's DEVICE_CLASS_UNITS).
const CLASS_UNITS: Record<string, (string | undefined)[]> = {
    temperature: ['°C', '°F', 'K'], humidity: ['%'], moisture: ['%'], battery: ['%'], atmospheric_pressure: ['hPa', 'kPa', 'Pa', 'mbar', 'bar', 'mmHg', 'inHg', 'psi'],
    pressure: ['hPa', 'kPa', 'Pa', 'mbar', 'bar', 'mmHg', 'inHg', 'psi'], illuminance: ['lx'], carbon_dioxide: ['ppm'],
    carbon_monoxide: ['ppm', 'mg/m³', 'µg/m³'], volatile_organic_compounds: ['µg/m³', 'mg/m³'], pm25: ['µg/m³'], pm10: ['µg/m³'],
    pm1: ['µg/m³'], voltage: ['V', 'mV', 'kV'], current: ['A', 'mA'], power: ['W', 'kW', 'mW'], power_factor: ['%', undefined],
    energy: ['Wh', 'kWh', 'MWh'], frequency: ['Hz', 'kHz'], distance: ['mm', 'cm', 'm', 'km', 'in', 'ft'], sound_pressure: ['dB', 'dBA'],
    signal_strength: ['dB', 'dBm'], water: ['L', 'm³', 'gal', 'ft³', 'mL'], duration: ['s', 'min', 'h', 'd', 'ms'],
};

export function unitFits(dc: string, unit: string | undefined): boolean {
    const ok = CLASS_UNITS[dc];
    if (!ok) return true;
    return ok.includes(unit);
}

// HA hvac action labels for zhc running_state values.
export const HVAC_ACTION: Record<string, string> = {
    idle: 'idle', heat: 'heating', cool: 'cooling', fan_only: 'fan', heating: 'heating', cooling: 'cooling', fan: 'fan',
    dry: 'drying', drying: 'drying', off: 'off', preheating: 'preheating',
};
export const HVAC_MODES = new Set(['off', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only']);
