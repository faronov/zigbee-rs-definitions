// Golden tests: the generator output for a sample of zhc definitions must
// equal the reviewed YAML in generator/test/golden/ (spec 18.1).
//
// Update after a deliberate change: npm run golden:update, review the diff.
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {test} from 'node:test';
import {generate, header} from '../src/main';
import {toYaml} from '../src/yaml';

const ROOT = path.resolve(__dirname, '..', '..');
const GOLDEN = path.join(ROOT, 'generator', 'test', 'golden');
export const SAMPLE: Record<string, string> = {
    // tier A: m.numeric / m.binary settings on standard clusters
    EFEKTA_CO2_Smart_Monitor: 'A',
    // tier A: generic tier with fixed divisors (spec example innr-sp120.yaml)
    'SP 120': 'A',
    // tier A: Philips motion sensor, manufacturer-specific attributes
    '9290012607': 'A',
    // tier C: Aqara contact sensor (Lumi template family)
    'MCCGQ01LM': 'C',
    // tier B: Tuya TRV, climate parts, schedule codec (spec example tuya-ts0601-trv-me167.yaml)
    TS0601_thermostat_3: 'B',
    // tier B: Tuya T/H sensor (spec example tuya-ts0601-th-sensor.yaml)
    TS0601_temperature_humidity_sensor_2: 'B',
    // tier B: Tuya remote, commandTuyaAction events per endpoint
    TS0044: 'B',
    // tier B: Tuya 4-gang DP switch
    TS0601_switch_4_gang_1: 'B',
    // tier C: Hue light template
    '9290012573A': 'C',
    // tier C: Lumi template family
    WSDCGQ11LM: 'C',
    // tier A: Paulmann bulb, white labels selected by softwareBuildID
    '291.46': 'A',
    // partial: Tuya plug whose countdown needs a command-based number (v1 has none)
    TS011F_plug_1: 'P',
    // partial: IKEA remote (IKEA templates are not implemented yet)
    E1743: 'P',
};

const file = (model: string) => path.join(GOLDEN, `${model.replace(/[^A-Za-z0-9_.-]/g, '_')}.yaml`);

test('golden definitions', async () => {
    const {zhc, out} = await generate(ROOT, new Set(Object.keys(SAMPLE)));
    assert.strictEqual(out.length, Object.keys(SAMPLE).length, 'every sample model exists in zhc');
    const update = process.env.GOLDEN_UPDATE === '1';
    for (const o of out) {
        const yaml = toYaml(o.doc, header(zhc.version));
        if (update) fs.writeFileSync(file(o.rec.model), yaml);
        const expected = fs.readFileSync(file(o.rec.model), 'utf8');
        assert.strictEqual(yaml, expected, `${o.rec.model}: output differs from ${path.relative(ROOT, file(o.rec.model))}`);
        assert.strictEqual(o.rec.tier, SAMPLE[o.rec.model], `${o.rec.model}: tier`);
    }
});

test('canonical YAML quoting is YAML 1.1 and 1.2 safe', () => {
    const y = toYaml({zdef: 1, id: 'a/b', revision: 1, vendor: 'on', model: '0123', match: [{model: '12:30'}], entities: [{key: 'k', platform: 'select', map: {0: 'off', 1: 'yes'}}]});
    assert.match(y, /vendor: "on"/);
    assert.match(y, /model: "0123"/);
    assert.match(y, /"12:30"/);
    assert.match(y, /0: "off", 1: "yes"/);
});
