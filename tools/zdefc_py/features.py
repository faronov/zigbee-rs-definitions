"""Feature IDs for `requires` (spec 8.5): small integers, append-only.

Provisional table of the definitions repository until the hub's
schema/zdef-v1 defines the authoritative one; IDs 1-5 follow the spec text.
A feature unknown to this table is assigned the next free ID only after it is
added here (CI fails otherwise), so IDs never change between releases.
"""
FEATURES = {
    'expr-v1': 1,
    'tuya': 2,
    'gp': 3,
    'struct.zcl_tagged': 4,
    'codec.tuya_schedule_day': 5,
    'codec.tuya_schedule_week': 6,
    'codec.utf16be_hex': 7,
    'codec.ascii': 8,
    'codec.bcd_time': 9,
    'codec.hhmm': 10,
    'codec.bitmap_flags': 11,
    'fp.manufacturer': 12,
    'fp.model': 13,
    'fp.app_version': 14,
    'fp.hw_version': 15,
    'fp.mfr_code': 16,
    'fp.sw_build': 17,
    'fp.stack_version': 18,
    'fp.power': 19,
    'template.hue_light': 20,
    'template.lumi': 21,
    'template.tuya': 22,
    'template.tuya_metering_zero_debounce': 23,
    'wasm': 60,
}


class Requires:
    def id(self, feature):
        if feature not in FEATURES:
            raise KeyError(f'feature {feature!r} has no ID in tools/zdefc_py/features.py')
        return FEATURES[feature]


TABLE = Requires()
