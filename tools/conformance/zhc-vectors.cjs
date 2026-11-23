// Expected zhc selections: for every fingerprint, zigbeeModel and white-label
// fingerprint of zigbee-herdsman-converters, the definition findByDevice picks.
const path = require('path');
const fs = require('fs');
const root = process.argv[2];
const zhc = require(path.join(root, 'node_modules/zigbee-herdsman-converters'));
const devdir = path.join(root, 'node_modules/zigbee-herdsman-converters/dist/devices');
const KEYS = ['modelID', 'manufacturerName', 'applicationVersion', 'stackVersion', 'hardwareVersion', 'softwareBuildID',
  'powerSource', 'type', 'dateCode', 'zclVersion', 'manufacturerID'];
function device(fp) {
  const eps = (fp.endpoints || []).map((e) => ({ID: e.ID, profileID: e.profileID, deviceID: e.deviceID,
    inputClusters: e.inputClusters || [], outputClusters: e.outputClusters || []}));
  const d = {ieeeAddr: '0x00124b0000000001', endpoints: eps, getEndpoint: (id) => eps.find((e) => e.ID === id)};
  for (const k of KEYS) if (fp[k] !== undefined) d[k] = fp[k];
  return d;
}
(async () => {
  const out = [];
  const seen = new Set();
  for (const f of fs.readdirSync(devdir).filter((x) => x.endsWith('.js')).sort()) {
    const {definitions} = require(path.join(devdir, f));
    if (!Array.isArray(definitions)) continue;
    for (const def of definitions) {
      const fps = [];
      for (const fp of def.fingerprint || []) fps.push(['fingerprint', fp]);
      for (const z of def.zigbeeModel || []) fps.push(['zigbeeModel', {modelID: z}]);
      for (const w of def.whiteLabel || []) for (const fp of w.fingerprint || []) fps.push(['whiteLabel', fp]);
      for (const [kind, fp] of fps) {
        if (!fp.modelID) continue; // findDefinition looks candidates up by modelID only
        const dev = device(fp);
        const key = JSON.stringify(dev, KEYS.concat(['endpoints', 'ID', 'profileID', 'deviceID', 'inputClusters', 'outputClusters']));
        if (seen.has(key)) continue;
        seen.add(key);
        let got = null, base = null;
        try { got = await zhc.findByDevice(dev); base = await zhc.findDefinition(dev); } catch (e) { got = {error: String(e)}; }
        const fpOut = {};
        for (const k of KEYS) if (dev[k] !== undefined) fpOut[k] = dev[k];
        if (dev.endpoints.length) fpOut.endpoints = dev.endpoints.map(({ID, profileID, deviceID, inputClusters, outputClusters}) => ({ID, profileID, deviceID, inputClusters, outputClusters}));
        out.push({kind, source: def.model, fp: fpOut, expect: got && !got.error ? {model: got.model, vendor: got.vendor, base: base && base.model} : null});
      }
    }
  }
  fs.writeFileSync(process.argv[3], JSON.stringify(out));
  const shadow = out.filter((v) => v.expect && v.kind !== 'whiteLabel' && v.expect.model !== v.source).length;
  console.log(`vectors ${out.length}, unresolved ${out.filter((v) => !v.expect).length}, picked another definition than their source ${shadow}`);
})();
