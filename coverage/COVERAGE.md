# Coverage of zigbee-herdsman-converters by herdsman-gen

Generated from zigbee-herdsman-converters **26.130.0** (4664 definitions). Regenerate with
`npm run generate`; method in [`generator/README.md`](../generator/README.md).

| Tier | Definitions | Share |
|---|---:|---:|
| A generic declarative (fully translated) | 1861 | 39.9 % |
| B Tuya declarative (fully translated) | 421 | 9.0 % |
| C vendor template (fully translated, needs a hub template) | 917 | 19.7 % |
| P partial (some items untranslated; on demand only) | 1465 | 31.4 % |
| **Fully translated (A + B + C)** | **3199** | **68.6 %** |
| Fully translated without templates (A + B) | 2282 | 48.9 % |

- Partial definitions whose only gap is an expose without a translated converter: 71.
- Canonical YAML written: 3924 KiB in 4664 files.
- Coordinator/adapter definitions (excluded from the popularity ranking): 13.

## Vendor templates used by tier C

| Template | Definitions |
|---|---:|
| `hue_light` | 582 |
| `tuya` | 174 |
| `lumi` | 161 |

## Top untranslated items

Ranked by the number of partial definitions they block. "Sole" counts the definitions that become fully
translated if only this item is implemented. Locations are zhc source lines from its source maps.

| # | Item | Blocks | Sole | Example locations |
|---:|---|---:|---:|---|
| 1 | inline fromZigbee (custom code) | 431 | 20 | `src/devices/third_reality.ts:318`, `src/devices/acova.ts:18`, `src/devices/adeo.ts:17` |
| 2 | inline toZigbee (custom code) | 264 | 8 | `src/devices/acova.ts:36`, `src/devices/adeo.ts:57`, `src/devices/amina.ts:156` |
| 3 | inline extend (custom code) | 253 | 21 | `src/lib/nodon.ts:49`, `src/lib/adurosmart.ts:104`, `src/devices/ariston.ts:13` |
| 4 | ledvance.ledvanceLight | 107 | 0 | `src/devices/ledvance.ts:46`, `src/devices/ledvance.ts:60`, `src/devices/ledvance.ts:67` |
| 5 | Tuya value converter: inline Tuya value converter | 98 | 3 | `src/devices/avatto.ts:319`, `src/devices/avatto.ts:565`, `src/devices/avatto.ts:798` |
| 6 | ikea.ikeaLight | 66 | 0 | `src/devices/ikea.ts:58`, `src/devices/ikea.ts:70`, `src/devices/ikea.ts:77` |
| 7 | tz.thermostat_weekly_schedule | 31 | 0 | `src/converters/toZigbee.ts:1535` |
| 8 | onEvent (custom code) | 29 | 6 | `src/devices/aurora_lighting.ts:70`, `src/devices/daewoo.ts:151`, `src/devices/ewelink.ts:426` |
| 9 | fz.thermostat_weekly_schedule | 25 | 0 | `src/converters/fromZigbee.ts:220` |
| 10 | configure: configure function could not be replayed | 22 | 3 | `src/devices/candeo.ts:906`, `src/devices/ewelink.ts:422`, `src/devices/ewelink.ts:469` |
| 11 | Tuya value converter: DP options skip | 22 | 0 | `src/lib/tuya.ts:1517` |
| 12 | legrand.fzLegrand.cluster_fc01 | 22 | 0 | `src/lib/legrand.ts:514` |
| 13 | m.electricityMeter (argument … not translated) | 22 | 0 | `src/devices/bituo_technik.ts:96`, `src/devices/bituo_technik.ts:123`, `src/devices/bituo_technik.ts:171` |
| 14 | legrand.tzLegrand.identify | 21 | 2 | `src/lib/legrand.ts:394` |
| 15 | m.poll | 19 | 3 | `src/devices/acova.ts:111`, `src/devices/busch_jaeger.ts:117`, `src/devices/custom_devices_diy.ts:2496` |
| 16 | legrand.tzLegrand.led_mode | 19 | 0 | `src/lib/legrand.ts:377` |
| 17 | namron.fromZigbee.namron_hvac_user_interface | 19 | 0 | `src/lib/namron.ts:210` |
| 18 | namron.toZigbee.namron_thermostat_child_lock | 19 | 0 | `src/lib/namron.ts:409` |
| 19 | sunricher.extend.externalSwitchType | 19 | 0 | `src/devices/iluminize.ts:17`, `src/devices/iluminize.ts:24`, `src/devices/nordtronic.ts:51` |
| 20 | tz.ballast_config | 19 | 0 | `src/converters/toZigbee.ts:892` |
| 21 | tz.thermostat_clear_weekly_schedule | 19 | 0 | `src/converters/toZigbee.ts:1840` |
| 22 | fingerprint | 18 | 4 |  |
| 23 | m.numeric (argument … is code) | 18 | 0 | `src/devices/custom_devices_diy.ts:860`, `src/devices/custom_devices_diy.ts:881`, `src/devices/custom_devices_diy.ts:913` |
| 24 | tz.thermostat_outdoor_temperature | 16 | 0 | `src/converters/toZigbee.ts:1817` |
| 25 | tz.thermostat_programming_operation_mode | 16 | 0 | `src/converters/toZigbee.ts:1727` |
| 26 | tuya.modernExtend.tuyaOnOff | 15 | 0 | `src/devices/tuya.ts:9494`, `src/devices/tuya.ts:9607`, `src/devices/tuya.ts:9650` |
| 27 | sunricher.extend.minimumPWM | 14 | 0 | `src/devices/icasa.ts:22`, `src/devices/iluminize.ts:17`, `src/devices/iluminize.ts:24` |
| 28 | fz.ias_occupancy_alarm_1_with_timeout | 13 | 0 | `src/converters/fromZigbee.ts:1289` |
| 29 | m.actionEnumLookup | 13 | 0 | `src/devices/coselig.ts:38`, `src/devices/lumi.ts:2759`, `src/devices/moes.ts:2102` |
| 30 | tz.pincode_lock | 13 | 0 | `src/converters/toZigbee.ts:441` |
| 31 | fz.cover_position_via_brightness | 12 | 0 | `src/converters/fromZigbee.ts:1823` |
| 32 | fz.lock_programming_event | 12 | 0 | `src/converters/fromZigbee.ts:297` |
| 33 | ikea.ikeaBattery | 12 | 0 | `src/devices/ikea.ts:930`, `src/devices/ikea.ts:944`, `src/devices/ikea.ts:958` |
| 34 | tz.cover_via_brightness | 12 | 0 | `src/converters/toZigbee.ts:543` |
| 35 | tz.thermostat_temperature_setpoint_hold | 12 | 0 | `src/converters/toZigbee.ts:1765` |
| 36 | meta.omitOptionalLevelAndColorParams | 11 | 10 |  |
| 37 | fz.lock_pin_code_response | 11 | 0 | `src/converters/fromZigbee.ts:384` |
| 38 | m.thermostat (louver/hold duration/running mode) | 11 | 0 | `src/devices/lumi.ts:6166`, `src/devices/lytko.ts:969`, `src/devices/lytko.ts:1017` |
| 39 | adurosmart.extend.onOffReporting | 10 | 9 | `src/devices/adurosmart.ts:11`, `src/devices/adurosmart.ts:14` |
| 40 | m.skipDefaultResponse | 10 | 9 | `src/devices/ewelink.ts:159`, `src/devices/ewelink.ts:174`, `src/devices/ewelink.ts:190` |
| 41 | ewelink.modernExtend.ewelinkBattery | 10 | 0 | `src/devices/ewelink.ts:409`, `src/devices/ewelink.ts:457`, `src/devices/ewelink.ts:502` |
| 42 | fz.lighting_ballast_configuration | 10 | 0 | `src/converters/fromZigbee.ts:1853` |
| 43 | philips.m.onOff | 10 | 0 | `src/devices/philips.ts:3296`, `src/devices/philips.ts:3303`, `src/devices/philips.ts:3310` |
| 44 | tz.thermostat_temperature_setpoint_hold_duration | 10 | 0 | `src/converters/toZigbee.ts:1774` |
| 45 | fz.cover_state_via_onoff | 9 | 0 | `src/converters/fromZigbee.ts:1834` |
| 46 | ledvance.ledvanceOnOff | 9 | 0 | `src/devices/ledvance.ts:53`, `src/devices/ledvance.ts:89`, `src/devices/ledvance.ts:97` |
| 47 | tz.thermostat_remote_sensing | 9 | 0 | `src/converters/toZigbee.ts:1526` |
| 48 | bosch.boschGeneralExtend.handleRenamedCustomCluster | 8 | 0 | `src/devices/bosch.ts:592`, `src/devices/bosch.ts:989`, `src/devices/bosch.ts:1026` |
| 49 | legrand.tzLegrand.legrand_device_mode | 8 | 0 | `src/lib/legrand.ts:410` |
| 50 | tz.thermostat_relay_status_log | 8 | 0 | `src/converters/toZigbee.ts:1945` |
| 51 | configure: configure | 7 | 2 | `src/devices/bosch.ts:1580`, `src/devices/custom_devices_diy.ts:1452`, `src/devices/daewoo.ts:143` |
| 52 | m.electricityMeter | 7 | 0 | `src/devices/atlantic.ts:121`, `src/devices/develco.ts:383`, `src/devices/owon.ts:1406` |
| 53 | m.enumLookup (argument … is code) | 7 | 0 | `src/devices/custom_devices_diy.ts:820`, `src/devices/custom_devices_diy.ts:932`, `src/devices/danfoss.ts:454` |
| 54 | m.iasGetPanelStatusResponse | 7 | 0 | `src/devices/centralite.ts:275`, `src/devices/develco.ts:1458`, `src/devices/hive.ts:161` |
| 55 | tz.lock_sound_volume | 7 | 0 | `src/converters/toZigbee.ts:429` |
| 56 | Tuya value converter: lookup map is a function of the device options | 6 | 0 | `src/lib/tuya.ts:1517` |
| 57 | bosch.boschGeneralExtend.batteryWithPercentageAndLowStatus | 6 | 0 | `src/devices/bosch.ts:578`, `src/devices/bosch.ts:597`, `src/devices/bosch.ts:734` |
| 58 | bosch.boschGeneralExtend.handleZclVersionReadRequest | 6 | 0 | `src/devices/bosch.ts:770`, `src/devices/bosch.ts:829`, `src/devices/bosch.ts:1008` |
| 59 | fz.ias_ace_occupancy_with_timeout | 6 | 0 | `src/converters/fromZigbee.ts:2158` |
| 60 | m.electricityMeter (threePhase (phase B/C attributes are not in the generic tier)) | 6 | 0 | `src/devices/amina.ts:335`, `src/devices/bacchus.ts:267`, `src/devices/datek.ts:274` |

## Most dropped exposes

| Expose | Definitions |
|---|---:|
| `action` | 223 |
| `light` | 188 |
| `effect` | 177 |
| `battery` | 106 |
| `power_on_behavior` | 102 |
| `voltage` | 74 |
| `battery_low` | 67 |
| `switch` | 59 |
| `climate` | 58 |
| `power` | 58 |
| `child_lock` | 56 |
| `energy` | 54 |
| `current` | 53 |
| `pin_code` | 45 |
| `action_user` | 44 |
| `color_options` | 44 |
| `action_source_name` | 39 |
| `sound_volume` | 33 |
| `occupancy` | 32 |
| `auto_relock_time` | 30 |
| `lock` | 28 |
| `tamper` | 27 |
| `ac_frequency` | 27 |
| `ballast_minimum_level` | 24 |
| `ballast_maximum_level` | 24 |

## Per vendor file

| File | A | B | C | P | Full |
|---|---:|---:|---:|---:|---:|
| philips | 6 | 0 | 582 | 20 | 96.7 % |
| tuya | 26 | 266 | 93 | 198 | 66.0 % |
| lumi | 8 | 0 | 161 | 16 | 91.4 % |
| innr | 118 | 0 | 0 | 1 | 99.2 % |
| ikea | 11 | 0 | 0 | 90 | 10.9 % |
| gledopto | 85 | 0 | 0 | 9 | 90.4 % |
| heiman | 41 | 0 | 1 | 39 | 51.9 % |
| efekta | 76 | 0 | 0 | 0 | 100.0 % |
| schneider_electric | 36 | 0 | 0 | 40 | 47.4 % |
| sunricher | 39 | 0 | 0 | 37 | 51.3 % |
| sonoff | 24 | 0 | 0 | 44 | 35.3 % |
| namron | 51 | 0 | 0 | 12 | 81.0 % |
| ledvance | 0 | 0 | 0 | 51 | 0.0 % |
| adeo | 44 | 0 | 0 | 6 | 88.0 % |
| moes | 3 | 22 | 8 | 15 | 68.8 % |
| osram | 3 | 0 | 0 | 45 | 6.3 % |
| slacky_diy | 8 | 0 | 0 | 34 | 19.0 % |
| shinasystem | 18 | 0 | 0 | 23 | 43.9 % |
| orvibo | 19 | 0 | 0 | 21 | 47.5 % |
| paulmann | 37 | 0 | 0 | 3 | 92.5 % |
| hobeian | 2 | 30 | 2 | 5 | 87.2 % |
| third_reality | 31 | 0 | 0 | 6 | 83.8 % |
| legrand | 1 | 0 | 0 | 35 | 2.8 % |
| robb | 35 | 0 | 0 | 0 | 100.0 % |
| nue_3a | 28 | 0 | 0 | 4 | 87.5 % |
| hive | 20 | 0 | 0 | 11 | 64.5 % |
| adurosmart | 17 | 0 | 0 | 13 | 56.7 % |
| candeo | 15 | 0 | 0 | 15 | 50.0 % |
| custom_devices_diy | 12 | 0 | 0 | 18 | 40.0 % |
| develco | 9 | 0 | 0 | 21 | 30.0 % |
| feibit | 28 | 0 | 0 | 2 | 93.3 % |
| iluminize | 26 | 0 | 0 | 4 | 86.7 % |
| yale | 0 | 0 | 0 | 30 | 0.0 % |
| muller_licht | 25 | 0 | 0 | 4 | 86.2 % |
| sengled | 28 | 0 | 0 | 1 | 96.6 % |
| smartthings | 21 | 0 | 0 | 7 | 75.0 % |
| zemismart | 3 | 4 | 5 | 15 | 44.4 % |
| lincukoo | 5 | 18 | 2 | 1 | 96.2 % |
| owon | 17 | 0 | 0 | 8 | 68.0 % |
| shelly | 4 | 0 | 0 | 21 | 16.0 % |
| aurora_lighting | 19 | 0 | 0 | 4 | 82.6 % |
| qa | 0 | 12 | 6 | 5 | 78.3 % |
| sinope | 6 | 0 | 0 | 17 | 26.1 % |
| sylvania | 2 | 0 | 0 | 21 | 8.7 % |
| immax | 14 | 4 | 1 | 3 | 86.4 % |
| onokom | 22 | 0 | 0 | 0 | 100.0 % |
| bitron | 12 | 0 | 0 | 9 | 57.1 % |
| ewelink | 5 | 0 | 0 | 16 | 23.8 % |
| somfy | 21 | 0 | 0 | 0 | 100.0 % |
| bosch | 2 | 0 | 0 | 17 | 10.5 % |
| pushok | 11 | 0 | 0 | 8 | 57.9 % |
| zigbeetlc | 17 | 0 | 0 | 2 | 89.5 % |
| dawon_dns | 16 | 0 | 0 | 2 | 88.9 % |
| yokis | 12 | 0 | 0 | 6 | 66.7 % |
| lidl | 2 | 4 | 5 | 6 | 64.7 % |
| nodon | 5 | 0 | 0 | 12 | 29.4 % |
| ctm | 6 | 0 | 0 | 10 | 37.5 % |
| easyiot | 5 | 0 | 0 | 11 | 31.3 % |
| konke | 12 | 0 | 0 | 4 | 75.0 % |
| linkind | 13 | 0 | 0 | 3 | 81.3 % |
| lonsonho | 3 | 2 | 8 | 3 | 81.3 % |
| terncy | 3 | 0 | 0 | 13 | 18.8 % |
| avatto | 0 | 7 | 1 | 7 | 53.3 % |
| centralite | 9 | 0 | 0 | 6 | 60.0 % |
| hornbach | 14 | 0 | 0 | 0 | 100.0 % |
| leedarson | 13 | 0 | 0 | 1 | 92.9 % |
| awox | 12 | 0 | 0 | 1 | 92.3 % |
| lytko | 0 | 0 | 0 | 13 | 0.0 % |
| salus_controls | 8 | 0 | 0 | 5 | 61.5 % |
| yandex | 6 | 0 | 0 | 7 | 46.2 % |
| climax | 8 | 0 | 0 | 4 | 66.7 % |
| diyruz | 3 | 0 | 0 | 9 | 25.0 % |
| ecodim | 10 | 0 | 2 | 0 | 100.0 % |
| envilar | 12 | 0 | 0 | 0 | 100.0 % |
| paul_neuhaus | 1 | 0 | 0 | 11 | 8.3 % |
| bituo_technik | 0 | 0 | 0 | 11 | 0.0 % |
| gs | 11 | 0 | 0 | 0 | 100.0 % |
| icasa | 9 | 0 | 0 | 2 | 81.8 % |
| mercator | 3 | 7 | 1 | 0 | 100.0 % |
| niko | 7 | 0 | 0 | 4 | 63.6 % |
| nous | 1 | 2 | 4 | 4 | 63.6 % |
| samotech | 8 | 0 | 0 | 3 | 72.7 % |
| sber | 4 | 0 | 1 | 6 | 45.5 % |
| sercomm | 10 | 0 | 0 | 1 | 90.9 % |
| simon | 5 | 0 | 6 | 0 | 100.0 % |
| essentialb | 10 | 0 | 0 | 0 | 100.0 % |
| heimgard_technologies | 6 | 0 | 0 | 4 | 60.0 % |
| iris | 9 | 0 | 0 | 1 | 90.0 % |
| livolo | 0 | 0 | 0 | 10 | 0.0 % |
| shenzhen_homa | 10 | 0 | 0 | 0 | 100.0 % |
| ubisys | 1 | 0 | 0 | 9 | 10.0 % |
| vesternet | 9 | 0 | 0 | 1 | 90.0 % |
| bacchus | 4 | 0 | 0 | 5 | 44.4 % |
| dresden_elektronik | 8 | 0 | 0 | 1 | 88.9 % |
| eglo | 8 | 0 | 0 | 1 | 88.9 % |
| ge | 9 | 0 | 0 | 0 | 100.0 % |
| lightsolutions | 9 | 0 | 0 | 0 | 100.0 % |
| multir | 4 | 0 | 0 | 5 | 44.4 % |
| neo | 1 | 1 | 2 | 5 | 44.4 % |
| streda | 5 | 0 | 0 | 4 | 55.6 % |
| trust | 8 | 0 | 0 | 1 | 88.9 % |
| datek | 5 | 0 | 0 | 3 | 62.5 % |
| ecosmart | 8 | 0 | 0 | 0 | 100.0 % |
| gewiss | 5 | 0 | 0 | 3 | 62.5 % |
| halemeier | 7 | 0 | 0 | 1 | 87.5 % |
| hej | 8 | 0 | 0 | 0 | 100.0 % |
| lellki | 3 | 2 | 3 | 0 | 100.0 % |
| rgb_genie | 7 | 0 | 0 | 1 | 87.5 % |
| vimar | 8 | 0 | 0 | 0 | 100.0 % |
| visonic | 7 | 0 | 0 | 1 | 87.5 % |
| engo | 0 | 2 | 0 | 5 | 28.6 % |
| hzc_electric | 6 | 0 | 0 | 1 | 85.7 % |
| ihorn | 6 | 0 | 0 | 1 | 85.7 % |
| imou | 6 | 0 | 0 | 1 | 85.7 % |
| kwikset | 0 | 0 | 0 | 7 | 0.0 % |
| leviton | 4 | 0 | 0 | 3 | 57.1 % |
| manhot | 0 | 7 | 0 | 0 | 100.0 % |
| msh | 3 | 0 | 0 | 4 | 42.9 % |
| nordtronic | 6 | 0 | 0 | 1 | 85.7 % |
| nova_digital | 0 | 6 | 1 | 0 | 100.0 % |
| schwaiger | 7 | 0 | 0 | 0 | 100.0 % |
| the_light_group | 7 | 0 | 0 | 0 | 100.0 % |
| ynoa | 7 | 0 | 0 | 0 | 100.0 % |
| ajax_online | 5 | 0 | 1 | 0 | 100.0 % |
| atlantic | 3 | 0 | 0 | 3 | 50.0 % |
| domraem | 6 | 0 | 0 | 0 | 100.0 % |
| frient | 5 | 0 | 0 | 1 | 83.3 % |
| honyar | 5 | 1 | 0 | 0 | 100.0 % |
| lifecontrol | 4 | 0 | 0 | 2 | 66.7 % |
| livingwise | 4 | 0 | 0 | 2 | 66.7 % |
| lupus | 3 | 1 | 0 | 2 | 66.7 % |
| nyce | 5 | 0 | 0 | 1 | 83.3 % |
| profalux | 3 | 0 | 0 | 3 | 50.0 % |
| prolight | 6 | 0 | 0 | 0 | 100.0 % |
| skydance | 0 | 0 | 4 | 2 | 66.7 % |
| stelpro | 0 | 0 | 0 | 6 | 0.0 % |
| vsmart | 2 | 0 | 0 | 4 | 33.3 % |
| woox | 1 | 0 | 2 | 3 | 50.0 % |
| inovelli | 0 | 0 | 0 | 5 | 0.0 % |
| keen_home | 2 | 0 | 0 | 3 | 40.0 % |
| makegood | 0 | 1 | 1 | 3 | 40.0 % |
| orztech | 0 | 5 | 0 | 0 | 100.0 % |
| perenio | 3 | 0 | 0 | 2 | 60.0 % |
| slv | 5 | 0 | 0 | 0 | 100.0 % |
| acova | 1 | 0 | 0 | 3 | 25.0 % |
| acuity_brands_lighting | 3 | 0 | 0 | 1 | 75.0 % |
| aeotec | 4 | 0 | 0 | 0 | 100.0 % |
| airam | 4 | 0 | 0 | 0 | 100.0 % |
| blitzwolf | 1 | 0 | 0 | 3 | 25.0 % |
| box | 0 | 4 | 0 | 0 | 100.0 % |
| casaia | 4 | 0 | 0 | 0 | 100.0 % |
| danfoss | 0 | 0 | 0 | 4 | 0.0 % |
| enbrighten | 4 | 0 | 0 | 0 | 100.0 % |
| futurehome | 2 | 0 | 0 | 2 | 50.0 % |
| insta | 4 | 0 | 0 | 0 | 100.0 % |
| jxuan | 1 | 0 | 0 | 3 | 25.0 % |
| led_trading | 3 | 0 | 0 | 1 | 75.0 % |
| ls | 3 | 0 | 0 | 1 | 75.0 % |
| m_elec | 4 | 0 | 0 | 0 | 100.0 % |
| onesti | 1 | 0 | 0 | 3 | 25.0 % |
| plugwise | 2 | 0 | 0 | 2 | 50.0 % |
| somgoms | 0 | 0 | 4 | 0 | 100.0 % |
| spotmau | 4 | 0 | 0 | 0 | 100.0 % |
| tci | 4 | 0 | 0 | 0 | 100.0 % |
| universal_electronics_inc | 1 | 0 | 0 | 3 | 25.0 % |
| viessmann | 3 | 0 | 0 | 1 | 75.0 % |
| bega | 3 | 0 | 0 | 0 | 100.0 % |
| bticino | 0 | 0 | 0 | 3 | 0.0 % |
| calex | 3 | 0 | 0 | 0 | 100.0 % |
| databyte | 1 | 0 | 0 | 2 | 33.3 % |
| elko | 2 | 0 | 0 | 1 | 66.7 % |
| enocean | 0 | 0 | 0 | 3 | 0.0 % |
| eurotronic | 0 | 0 | 0 | 3 | 0.0 % |
| evn | 3 | 0 | 0 | 0 | 100.0 % |
| istar | 3 | 0 | 0 | 0 | 100.0 % |
| jasco | 2 | 0 | 0 | 1 | 66.7 % |
| klikaanklikuit | 3 | 0 | 0 | 0 | 100.0 % |
| lds | 3 | 0 | 0 | 0 | 100.0 % |
| lg | 3 | 0 | 0 | 0 | 100.0 % |
| openlumi | 3 | 0 | 0 | 0 | 100.0 % |
| rademacher | 3 | 0 | 0 | 0 | 100.0 % |
| smarli | 1 | 0 | 0 | 2 | 33.3 % |
| swann | 3 | 0 | 0 | 0 | 100.0 % |
| tlwglobal | 3 | 0 | 0 | 0 | 100.0 % |
| villeroy_boch | 3 | 0 | 0 | 0 | 100.0 % |
| wirenboard | 1 | 0 | 0 | 2 | 33.3 % |
| xal | 3 | 0 | 0 | 0 | 100.0 % |
| xyzroe | 0 | 0 | 0 | 3 | 0.0 % |
| ysrsai | 0 | 0 | 3 | 0 | 100.0 % |
| ITCommander | 1 | 0 | 0 | 1 | 50.0 % |
| alchemy | 2 | 0 | 0 | 0 | 100.0 % |
| alecto | 0 | 0 | 1 | 1 | 50.0 % |
| automaton | 0 | 1 | 1 | 0 | 100.0 % |
| besisglas | 2 | 0 | 0 | 0 | 100.0 % |
| busch_jaeger | 1 | 0 | 0 | 1 | 50.0 % |
| byun | 0 | 0 | 0 | 2 | 0.0 % |
| chacon | 1 | 0 | 0 | 1 | 50.0 % |
| cleverio | 1 | 0 | 1 | 0 | 100.0 % |
| echostar | 1 | 0 | 0 | 1 | 50.0 % |
| ecolink | 2 | 0 | 0 | 0 | 100.0 % |
| edp | 2 | 0 | 0 | 0 | 100.0 % |
| ezviz | 2 | 0 | 0 | 0 | 100.0 % |
| fantem | 0 | 0 | 0 | 2 | 0.0 % |
| fireangel | 0 | 0 | 0 | 2 | 0.0 % |
| frankever | 0 | 2 | 0 | 0 | 100.0 % |
| giex | 0 | 0 | 0 | 2 | 0.0 % |
| halo_smart_labs | 0 | 0 | 0 | 2 | 0.0 % |
| hampton_bay | 2 | 0 | 0 | 0 | 100.0 % |
| hilux | 2 | 0 | 0 | 0 | 100.0 % |
| hommyn | 1 | 0 | 0 | 1 | 50.0 % |
| ilightsin | 2 | 0 | 0 | 0 | 100.0 % |
| imhotepcreation | 1 | 0 | 0 | 1 | 50.0 % |
| javis | 0 | 0 | 0 | 2 | 0.0 % |
| jiawen | 2 | 0 | 0 | 0 | 100.0 % |
| kmpcil | 0 | 0 | 0 | 2 | 0.0 % |
| linxura | 0 | 0 | 0 | 2 | 0.0 % |
| lixee | 0 | 0 | 0 | 2 | 0.0 % |
| lutron | 0 | 0 | 0 | 2 | 0.0 % |
| matcall_bv | 2 | 0 | 0 | 0 | 100.0 % |
| meazon | 0 | 0 | 0 | 2 | 0.0 % |
| miboxer | 0 | 0 | 1 | 1 | 50.0 % |
| mill | 2 | 0 | 0 | 0 | 100.0 % |
| modular | 2 | 0 | 0 | 0 | 100.0 % |
| mowe | 0 | 2 | 0 | 0 | 100.0 % |
| netvox | 2 | 0 | 0 | 0 | 100.0 % |
| nobo | 0 | 0 | 0 | 2 | 0.0 % |
| qmotion | 1 | 0 | 0 | 1 | 50.0 % |
| quotra | 2 | 0 | 0 | 0 | 100.0 % |
| repenic_ltd | 1 | 0 | 0 | 1 | 50.0 % |
| rtx | 1 | 0 | 0 | 1 | 50.0 % |
| scanproducts | 2 | 0 | 0 | 0 | 100.0 % |
| securifi | 1 | 0 | 0 | 1 | 50.0 % |
| siglis | 0 | 0 | 0 | 2 | 0.0 % |
| smart_home_pty | 2 | 0 | 0 | 0 | 100.0 % |
| smartenit | 2 | 0 | 0 | 0 | 100.0 % |
| smlight | 0 | 0 | 0 | 2 | 0.0 % |
| sprut | 1 | 0 | 0 | 1 | 50.0 % |
| stello | 0 | 0 | 0 | 2 | 0.0 % |
| tech | 0 | 0 | 0 | 2 | 0.0 % |
| tplink | 2 | 0 | 0 | 0 | 100.0 % |
| vav | 1 | 0 | 0 | 1 | 50.0 % |
| waxman | 1 | 0 | 0 | 1 | 50.0 % |
| weiser | 0 | 0 | 0 | 2 | 0.0 % |
| weten | 1 | 1 | 0 | 0 | 100.0 % |
| airzone_aidoo | 1 | 0 | 0 | 0 | 100.0 % |
| akuvox | 1 | 0 | 0 | 0 | 100.0 % |
| aldi | 1 | 0 | 0 | 0 | 100.0 % |
| allesin | 1 | 0 | 0 | 0 | 100.0 % |
| amina | 0 | 0 | 0 | 1 | 0.0 % |
| anchor | 1 | 0 | 0 | 0 | 100.0 % |
| ariston | 0 | 0 | 0 | 1 | 0.0 % |
| atsmart | 1 | 0 | 0 | 0 | 100.0 % |
| axis | 1 | 0 | 0 | 0 | 100.0 % |
| bankamp | 1 | 0 | 0 | 0 | 100.0 % |
| beca | 0 | 0 | 0 | 1 | 0.0 % |
| belkin | 1 | 0 | 0 | 0 | 100.0 % |
| blaupunkt | 0 | 0 | 0 | 1 | 0.0 % |
| bouffalo_lab | 1 | 0 | 0 | 0 | 100.0 % |
| brimate | 1 | 0 | 0 | 0 | 100.0 % |
| brun_holding | 1 | 0 | 0 | 0 | 100.0 % |
| bseed | 0 | 0 | 1 | 0 | 100.0 % |
| bubendorff | 1 | 0 | 0 | 0 | 100.0 % |
| cel | 1 | 0 | 0 | 0 | 100.0 % |
| cigol | 0 | 0 | 0 | 1 | 0.0 % |
| cleode | 1 | 0 | 0 | 0 | 100.0 % |
| commercial_electric | 1 | 0 | 0 | 0 | 100.0 % |
| coselig | 0 | 0 | 0 | 1 | 0.0 % |
| cree | 1 | 0 | 0 | 0 | 100.0 % |
| current_products_corp | 1 | 0 | 0 | 0 | 100.0 % |
| cwd | 1 | 0 | 0 | 0 | 100.0 % |
| cy_lighting | 1 | 0 | 0 | 0 | 100.0 % |
| daewoo | 0 | 0 | 0 | 1 | 0.0 % |
| danalock | 0 | 0 | 0 | 1 | 0.0 % |
| digi | 1 | 0 | 0 | 0 | 100.0 % |
| direct_signs | 1 | 0 | 0 | 0 | 100.0 % |
| dlink | 0 | 0 | 0 | 1 | 0.0 % |
| dnake | 1 | 0 | 0 | 0 | 100.0 % |
| dowsing_reynolds | 1 | 0 | 0 | 0 | 100.0 % |
| dqsmart | 1 | 0 | 0 | 0 | 100.0 % |
| easyaccess | 0 | 0 | 0 | 1 | 0.0 % |
| eatonhalo_led | 1 | 0 | 0 | 0 | 100.0 % |
| ecozy | 0 | 0 | 0 | 1 | 0.0 % |
| edflab | 0 | 0 | 0 | 1 | 0.0 % |
| ekaza | 0 | 1 | 0 | 0 | 100.0 % |
| enkin | 1 | 0 | 0 | 0 | 100.0 % |
| ensystec | 0 | 0 | 0 | 1 | 0.0 % |
| espressif | 1 | 0 | 0 | 0 | 100.0 % |
| essentials | 0 | 0 | 0 | 1 | 0.0 % |
| eucontrols | 1 | 0 | 0 | 0 | 100.0 % |
| evanell | 0 | 0 | 0 | 1 | 0.0 % |
| evology | 1 | 0 | 0 | 0 | 100.0 % |
| evvr | 1 | 0 | 0 | 0 | 100.0 % |
| ezex | 1 | 0 | 0 | 0 | 100.0 % |
| fontastic | 0 | 0 | 0 | 1 | 0.0 % |
| gidealed | 1 | 0 | 0 | 0 | 100.0 % |
| giderwel | 1 | 0 | 0 | 0 | 100.0 % |
| girier | 0 | 1 | 0 | 0 | 100.0 % |
| gluon | 0 | 0 | 0 | 1 | 0.0 % |
| gmmts | 0 | 0 | 0 | 1 | 0.0 % |
| gmy | 1 | 0 | 0 | 0 | 100.0 % |
| gumax | 1 | 0 | 0 | 0 | 100.0 % |
| handshake_finland | 1 | 0 | 0 | 0 | 100.0 % |
| heatit | 1 | 0 | 0 | 0 | 100.0 % |
| heatzy | 0 | 0 | 0 | 1 | 0.0 % |
| heiwa | 0 | 0 | 0 | 1 | 0.0 % |
| hfh | 1 | 0 | 0 | 0 | 100.0 % |
| hoftronic | 1 | 0 | 0 | 0 | 100.0 % |
| homeseer | 1 | 0 | 0 | 0 | 100.0 % |
| idinio | 1 | 0 | 0 | 0 | 100.0 % |
| ilux | 1 | 0 | 0 | 0 | 100.0 % |
| intuis | 0 | 0 | 0 | 1 | 0.0 % |
| iolloi | 1 | 0 | 0 | 0 | 100.0 % |
| iotperfect | 0 | 1 | 0 | 0 | 100.0 % |
| jethome | 0 | 0 | 0 | 1 | 0.0 % |
| jumitech | 1 | 0 | 0 | 0 | 100.0 % |
| kami | 0 | 0 | 0 | 1 | 0.0 % |
| ksentry | 1 | 0 | 0 | 0 | 100.0 % |
| kurvia | 1 | 0 | 0 | 0 | 100.0 % |
| lanesto | 1 | 0 | 0 | 0 | 100.0 % |
| letsled | 1 | 0 | 0 | 0 | 100.0 % |
| letv | 0 | 0 | 0 | 1 | 0.0 % |
| librasoft | 0 | 0 | 0 | 1 | 0.0 % |
| linknlink | 0 | 0 | 0 | 1 | 0.0 % |
| linptech | 0 | 0 | 0 | 1 | 0.0 % |
| lubeez | 1 | 0 | 0 | 0 | 100.0 % |
| lux | 0 | 0 | 0 | 1 | 0.0 % |
| mazda | 0 | 0 | 0 | 1 | 0.0 % |
| megaman | 1 | 0 | 0 | 0 | 100.0 % |
| micromatic | 1 | 0 | 0 | 0 | 100.0 % |
| miele | 0 | 0 | 0 | 1 | 0.0 % |
| mindy | 0 | 0 | 0 | 1 | 0.0 % |
| multiterm | 0 | 0 | 0 | 1 | 0.0 % |
| nanoleaf | 1 | 0 | 0 | 0 | 100.0 % |
| nedis | 0 | 0 | 0 | 1 | 0.0 % |
| net2grid | 1 | 0 | 0 | 0 | 100.0 % |
| netica | 1 | 0 | 0 | 0 | 100.0 % |
| nexelec | 1 | 0 | 0 | 0 | 100.0 % |
| ninja_blocks | 1 | 0 | 0 | 0 | 100.0 % |
| niviss | 1 | 0 | 0 | 0 | 100.0 % |
| nodieby | 0 | 0 | 0 | 1 | 0.0 % |
| novo | 0 | 0 | 1 | 0 | 100.0 % |
| onenuo | 0 | 0 | 0 | 1 | 0.0 % |
| oujiabao | 0 | 0 | 0 | 1 | 0.0 % |
| ozsmartthings | 0 | 0 | 1 | 0 | 100.0 % |
| peq | 1 | 0 | 0 | 0 | 100.0 % |
| philio | 1 | 0 | 0 | 0 | 100.0 % |
| pirogovx | 0 | 0 | 0 | 1 | 0.0 % |
| plaid | 0 | 0 | 0 | 1 | 0.0 % |
| pulsar | 1 | 0 | 0 | 0 | 100.0 % |
| purmo | 0 | 0 | 0 | 1 | 0.0 % |
| qoto | 0 | 0 | 0 | 1 | 0.0 % |
| quirky | 1 | 0 | 0 | 0 | 100.0 % |
| radium | 1 | 0 | 0 | 0 | 100.0 % |
| raex | 1 | 0 | 0 | 0 | 100.0 % |
| ribag | 0 | 0 | 0 | 1 | 0.0 % |
| roome | 1 | 0 | 0 | 0 | 100.0 % |
| rti_tek | 0 | 0 | 0 | 1 | 0.0 % |
| saswell | 0 | 0 | 0 | 1 | 0.0 % |
| schlage | 0 | 0 | 0 | 1 | 0.0 % |
| seastar_intelligence | 1 | 0 | 0 | 0 | 100.0 % |
| selena | 1 | 0 | 0 | 0 | 100.0 % |
| senoro | 0 | 1 | 0 | 0 | 100.0 % |
| sensy_one | 1 | 0 | 0 | 0 | 100.0 % |
| shada | 1 | 0 | 0 | 0 | 100.0 % |
| shade_control | 1 | 0 | 0 | 0 | 100.0 % |
| shyugj | 1 | 0 | 0 | 0 | 100.0 % |
| siemens | 1 | 0 | 0 | 0 | 100.0 % |
| sikom | 0 | 0 | 0 | 1 | 0.0 % |
| silicon_labs | 1 | 0 | 0 | 0 | 100.0 % |
| simpla_home | 1 | 0 | 0 | 0 | 100.0 % |
| siterwell | 0 | 0 | 0 | 1 | 0.0 % |
| smart9 | 0 | 0 | 0 | 1 | 0.0 % |
| smartwings | 1 | 0 | 0 | 0 | 100.0 % |
| soanalarm | 0 | 1 | 0 | 0 | 100.0 % |
| sohan_electric | 1 | 0 | 0 | 0 | 100.0 % |
| solaredge | 1 | 0 | 0 | 0 | 100.0 % |
| soma | 1 | 0 | 0 | 0 | 100.0 % |
| sowilo | 1 | 0 | 0 | 0 | 100.0 % |
| spacetronik | 0 | 1 | 0 | 0 | 100.0 % |
| stuckatprototype | 0 | 0 | 0 | 1 | 0.0 % |
| superled | 1 | 0 | 0 | 0 | 100.0 % |
| tapestry | 1 | 0 | 0 | 0 | 100.0 % |
| task_lighting | 1 | 0 | 0 | 0 | 100.0 % |
| tcl | 1 | 0 | 0 | 0 | 100.0 % |
| technicolor | 0 | 0 | 0 | 1 | 0.0 % |
| teelicht | 1 | 0 | 0 | 0 | 100.0 % |
| teploluxe | 0 | 0 | 0 | 1 | 0.0 % |
| tis_control | 1 | 0 | 0 | 0 | 100.0 % |
| titan_products | 1 | 0 | 0 | 0 | 100.0 % |
| tnce | 1 | 0 | 0 | 0 | 100.0 % |
| tubeszb | 1 | 0 | 0 | 0 | 100.0 % |
| uhome | 1 | 0 | 0 | 0 | 100.0 % |
| vbled | 1 | 0 | 0 | 0 | 100.0 % |
| vrey | 1 | 0 | 0 | 0 | 100.0 % |
| wally | 0 | 0 | 0 | 1 | 0.0 % |
| wisdom | 1 | 0 | 0 | 0 | 100.0 % |
| wmun | 0 | 0 | 0 | 1 | 0.0 % |
| woolley | 0 | 0 | 0 | 1 | 0.0 % |
| wyze | 0 | 0 | 0 | 1 | 0.0 % |
| xenon | 0 | 1 | 0 | 0 | 100.0 % |
| xinghuoyuan | 1 | 0 | 0 | 0 | 100.0 % |
| yookee | 1 | 0 | 0 | 0 | 100.0 % |
| zbeacon | 1 | 0 | 0 | 0 | 100.0 % |
| zen | 0 | 0 | 0 | 1 | 0.0 % |
| zipato | 1 | 0 | 0 | 0 | 100.0 % |
| zunzunbee | 0 | 0 | 0 | 1 | 0.0 % |
