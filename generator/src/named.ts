// Named standard converters (converters/fromZigbee `fz.*`, toZigbee `tz.*`).
//
// "generic": the hub's generic tier (spec 5) implements the same semantics,
// so the converter needs no data; its cluster then serves the definition's
// exposes of that cluster. "noop": nothing to do on the hub (Z2M-internal).
// Anything not listed is untranslated.

const G = 'generic';
const N = 'noop';

export const STD: Record<string, string> = {};
const gen = (names: string) => names.split(/\s+/).filter(Boolean).forEach((n) => (STD[n] = G));
const noop = (names: string) => names.split(/\s+/).filter(Boolean).forEach((n) => (STD[n] = N));

gen(`fz.on_off fz.brightness fz.level_config fz.power_on_behavior fz.color_colortemp fz.battery fz.metering fz.electrical_measurement
fz.temperature fz.humidity fz.pressure fz.illuminance fz.occupancy fz.co2 fz.pm25 fz.soil_moisture fz.device_temperature
fz.command_on fz.command_off fz.command_toggle fz.command_move fz.command_step fz.command_stop fz.command_move_to_level
fz.command_move_to_color_temp fz.command_move_to_color fz.command_step_color_temperature fz.command_move_hue fz.command_recall
fz.command_enhanced_move_to_hue_and_saturation fz.command_move_color_temperature fz.command_color_loop_set fz.command_move_to_hue
fz.command_move_to_saturation fz.command_step_hue fz.command_step_saturation fz.command_move_to_hue_and_saturation fz.command_stop_move_step
fz.command_off_with_effect fz.command_cover_open fz.command_cover_close fz.command_cover_stop fz.command_store
fz.thermostat fz.hvac_user_interface fz.fan fz.cover_position_tilt fz.lock fz.lock_operation_event fz.identify
fz.ias_contact_alarm_1 fz.ias_occupancy_alarm_1 fz.ias_occupancy_alarm_2 fz.ias_water_leak_alarm_1 fz.ias_smoke_alarm_1 fz.ias_gas_alarm_1
fz.ias_gas_alarm_2 fz.ias_carbon_monoxide_alarm_1 fz.ias_vibration_alarm_1 fz.ias_sos_alarm_2 fz.ias_no_alarm fz.ias_alarm_only_alarm_1
fz.ias_contact_alarm_1_report fz.ias_occupancy_alarm_1_report fz.ias_water_leak_alarm_1_report fz.ias_occupancy_only_alarm_2 fz.ias_enroll
fz.ias_siren fz.on_off_skip_duplicate_transaction fz.on_off_force_multiendpoint fz.occupancy_timeout fz.gas_metering
fz.command_status_change_notification_action fz.command_arm fz.command_panic fz.command_emergency fz.command_arm_with_transaction
tz.on_off tz.light_onoff_brightness tz.light_brightness_move tz.light_brightness_step tz.level_config tz.ignore_rate tz.ignore_transition
tz.power_on_behavior tz.light_color_mode tz.light_color_options tz.light_colortemp_move tz.light_colortemp_step tz.light_colortemp_startup
tz.effect tz.light_hue_saturation_move tz.light_hue_saturation_step tz.light_color_colortemp tz.light_colortemp tz.light_color
tz.currentsummdelivered tz.electrical_measurement_power tz.acvoltage tz.accurrent tz.frequency tz.powerfactor tz.metering_power
tz.thermostat_occupied_heating_setpoint tz.thermostat_local_temperature tz.thermostat_system_mode tz.thermostat_local_temperature_calibration
tz.thermostat_running_state tz.thermostat_keypad_lockout tz.thermostat_control_sequence_of_operation tz.thermostat_unoccupied_heating_setpoint
tz.thermostat_max_heat_setpoint_limit tz.thermostat_min_heat_setpoint_limit tz.thermostat_occupied_cooling_setpoint tz.thermostat_unoccupied_cooling_setpoint
tz.thermostat_temperature_display_mode tz.thermostat_pi_heating_demand tz.thermostat_min_cool_setpoint_limit tz.thermostat_max_cool_setpoint_limit
tz.thermostat_occupancy tz.thermostat_running_mode tz.thermostat_setpoint_raise_lower
tz.cover_position_tilt tz.cover_state tz.lock tz.fan_mode tz.warning tz.squawk tz.identify tz.temperature tz.humidity
tz.battery_percentage_remaining tz.battery_voltage tz.occupancy_timeout`);

noop(`fz.ignore_occupancy_report fz.ignore_temperature_report fz.ignore_humidity_report fz.ignore_pressure_report fz.ignore_tuya_set_time
fz.ignore_iaszone_report fz.ignore_onoff_report fz.ignore_iaszone_attreport fz.ignore_illuminance_report fz.ignore_power_report fz.ignore_genIdentify
fz.ignore_command_on fz.ignore_command_step fz.ignore_genLevelCtrl_report fz.ignore_haDiagnostic fz.ignore_iaszone_statuschange
fz.ignore_multistate_report fz.ignore_command_off_with_effect fz.ignore_command_stop fz.ignore_iasace_commandgetpanelstatus fz.ignore_metering
fz.ignore_electrical_measurement fz.ignore_command_off fz.ignore_light_brightness_report fz.ignore_tuya_raw fz.ignore_basic_report
fz.ignore_time_read fz.ignore_poll_ctrl fz.ignore_genOta fz.ignore_zclversion_read fz.ignore_db
fz.linkquality_from_basic fz.power_source fz.hw_version tz.power_source fz.checkin_presence`);

// Why the rest is untranslated (for the report).
export const STD_REASON: Record<string, string> = {
    'tz.pincode_lock': 'PIN code management is out of scope for v1 (spec 5.1)',
    'fz.lock_pin_code_response': 'PIN code management is out of scope for v1',
    'fz.lock_programming_event': 'PIN code management is out of scope for v1',
    'fz.lock_user_status_response': 'PIN code management is out of scope for v1',
    'tz.lock_userstatus': 'PIN code management is out of scope for v1',
    'fz.thermostat_weekly_schedule': 'ZCL thermostat weekly schedule (no codec yet)',
    'tz.thermostat_weekly_schedule': 'ZCL thermostat weekly schedule (no codec yet)',
    'tz.thermostat_clear_weekly_schedule': 'ZCL thermostat weekly schedule (no codec yet)',
};

// Clusters whose exposes a generic fz converter serves.
export function fzClusters(conv: any): string[] {
    return [].concat(conv?.cluster ?? []).map(String);
}

// Expose -> the clusters that can serve it in the generic tier.
const BY_NAME: Record<string, string[]> = {
    temperature: ['msTemperatureMeasurement'], humidity: ['msRelativeHumidity'], pressure: ['msPressureMeasurement'],
    illuminance: ['msIlluminanceMeasurement'], illuminance_lux: ['msIlluminanceMeasurement'], co2: ['msCO2'], pm25: ['pm25Measurement'],
    soil_moisture: ['msSoilMoisture'], device_temperature: ['genDeviceTempCfg'], occupancy: ['msOccupancySensing', 'ssIasZone'],
    occupancy_timeout: ['msOccupancySensing'], battery: ['genPowerCfg'], battery_low: ['ssIasZone', 'genPowerCfg'], tamper: ['ssIasZone'],
    voltage: ['genPowerCfg', 'haElectricalMeasurement'], power: ['haElectricalMeasurement', 'seMetering'], current: ['haElectricalMeasurement'],
    power_factor: ['haElectricalMeasurement'], ac_frequency: ['haElectricalMeasurement'], energy: ['seMetering'],
    contact: ['ssIasZone'], water_leak: ['ssIasZone'], smoke: ['ssIasZone'], gas: ['ssIasZone'], carbon_monoxide: ['ssIasZone'],
    vibration: ['ssIasZone'], sos: ['ssIasZone'], alarm: ['ssIasZone'], alarm_1: ['ssIasZone'], alarm_2: ['ssIasZone'],
    power_on_behavior: ['genOnOff'], effect: ['genIdentify', 'genOnOff'], identify: ['genIdentify'], keypad_lockout: ['hvacUserInterfaceCfg', 'hvacThermostat'],
    temperature_display_mode: ['hvacUserInterfaceCfg'], pi_heating_demand: ['hvacThermostat'], running_state: ['hvacThermostat'],
    local_temperature: ['hvacThermostat'], linkquality: ['*'], fan_mode: ['hvacFanCtrl'], fan_state: ['hvacFanCtrl'],
};
const BY_TYPE: Record<string, string[]> = {
    light: ['genOnOff', 'genLevelCtrl', 'lightingColorCtrl'], switch: ['genOnOff'], cover: ['closuresWindowCovering'], climate: ['hvacThermostat'],
    lock: ['closuresDoorLock'], fan: ['hvacFanCtrl'],
};
const ACTION_CLUSTERS = ['genOnOff', 'genLevelCtrl', 'genScenes', 'lightingColorCtrl', 'closuresWindowCovering', 'ssIasAce', 'ssIasZone'];

export function exposeClusters(expose: any): string[] | undefined {
    if (!expose) return undefined;
    if (BY_TYPE[expose.type]) return BY_TYPE[expose.type];
    if (expose.type === 'composite' && (expose.name === 'warning' || expose.name === 'squawk')) return ['ssIasWd'];
    if (expose.name === 'action') return ACTION_CLUSTERS;
    return BY_NAME[expose.name];
}
