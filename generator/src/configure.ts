// Replaying zhc `configure` functions against a recording mock device and
// translating the recorded operations into zdef configure ops (spec 6.8).
import {Ctx, untr} from './ctx';
import {TYPE_NAMES} from './zcl';

interface Op {
    op: string;
    ep: number;
    cluster?: any;
    target?: any;
    items?: any[];
    attrs?: any[];
    payload?: any;
    cmd?: any;
    options?: any;
}

function mockDevice(d: any, ops: Op[]) {
    const eps = new Map<number, any>();
    const fp0 = Array.isArray(d.fingerprint) ? d.fingerprint[0] : undefined;
    const dev: any = {
        ieeeAddr: '0x00124b0000000001', networkAddress: 0x1234,
        modelID: d.zigbeeModel?.[0] ?? fp0?.modelID ?? 'model', manufacturerName: fp0?.manufacturerName ?? 'manufacturer',
        powerSource: 'Battery', type: 'EndDevice', softwareBuildID: '1.0', dateCode: '20200101', applicationVersion: 1, stackVersion: 1,
        hardwareVersion: 1, zclVersion: 1, manufacturerID: 0, meta: {}, customClusters: {}, interviewCompleted: true,
        getEndpoint: (id: number) => mkEp(id), save: () => {}, addCustomCluster: () => {}, skipDefaultResponse: false,
    };
    function mkEp(id: number) {
        if (eps.has(id)) return eps.get(id);
        const ep: any = {
            ID: id, deviceIeeeAddress: dev.ieeeAddr, clusters: {}, inputClusters: [], outputClusters: [], binds: [], configuredReportings: [],
            bind: async (cluster: any, target: any) => void ops.push({op: 'bind', ep: id, cluster, target}),
            unbind: async () => void ops.push({op: 'unbind', ep: id}),
            configureReporting: async (cluster: any, items: any[], options: any) => void ops.push({op: 'report', ep: id, cluster, items, options}),
            read: async (cluster: any, attrs: any[], options: any) => {
                ops.push({op: 'read', ep: id, cluster, attrs, options});
                return {};
            },
            write: async (cluster: any, payload: any, options: any) => void ops.push({op: 'write', ep: id, cluster, payload, options}),
            writeStructured: async () => void ops.push({op: 'writeStructured', ep: id}),
            command: async (cluster: any, cmd: any, payload: any, options: any) => {
                ops.push({op: 'command', ep: id, cluster, cmd, payload, options});
                return {};
            },
            defaultResponse: async () => {},
            addToGroup: async () => void ops.push({op: 'group', ep: id}),
            removeFromGroup: async () => void ops.push({op: 'group', ep: id}),
            saveClusterAttributeKeyValue: () => {}, getClusterAttributeValue: () => undefined,
            supportsInputCluster: () => true, supportsOutputCluster: () => true, getInputClusters: () => [], getOutputClusters: () => [],
            getDevice: () => dev, save: () => {},
        };
        eps.set(id, ep);
        return ep;
    }
    Object.defineProperty(dev, 'endpoints', {get: () => {
        if (!eps.size) mkEp(1);
        return [...eps.values()];
    }});
    return dev;
}

export const COORDINATOR = {ID: 1, deviceIeeeAddress: '0x00124b00ffffffff'};

// Replays run with a frozen clock; a configure function whose operations
// change with the clock (it writes the current time) is not data.
const RealDate = Date;
async function withClock<T>(t: number, f: () => Promise<T>): Promise<T> {
    class FrozenDate extends RealDate {
        constructor(...a: any[]) {
            if (a.length === 0) super(t);
            else super(...(a as [any]));
        }
        static now() {
            return t;
        }
    }
    (globalThis as any).Date = FrozenDate;
    try {
        return await f();
    } finally {
        (globalThis as any).Date = RealDate;
    }
}

export async function replay(d: any, fn: Function): Promise<Op[] | string> {
    const t0 = RealDate.UTC(2026, 0, 1);
    const a = await withClock(t0, () => replayOnce(d, fn));
    if (typeof a === 'string') return a;
    const b = await withClock(t0 + 86_400_123, () => replayOnce(d, fn));
    if (typeof b === 'string' || JSON.stringify(a, skipTarget) !== JSON.stringify(b, skipTarget)) return 'operations depend on the current time';
    return a;
}

const skipTarget = (k: string, v: any) => (k === 'target' ? (v === COORDINATOR ? 'coordinator' : v) : v);

async function replayOnce(d: any, fn: Function): Promise<Op[] | string> {
    const ops: Op[] = [];
    const def = {...d, endpoint: d.endpoint || (() => ({default: 1}))};
    try {
        await Promise.race([
            fn(mockDevice(d, ops), COORDINATOR, def),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 300)),
        ]);
        return ops;
    } catch (e: any) {
        return String(e?.message ?? e).slice(0, 120);
    }
}

// Clusters and attributes the generic tier binds and reports itself (spec 5.2, 5.3).
const GENERIC_CLUSTERS = new Set([0x0001, 0x0002, 0x0003, 0x0006, 0x0008, 0x0005, 0x0300, 0x0402, 0x0403, 0x0405, 0x0400, 0x0406, 0x040d, 0x042a, 0x0408, 0x0500,
    0x0201, 0x0202, 0x0204, 0x0102, 0x0101, 0x0702, 0x0b04, 0x0020, 0x0019, 0x0502, 0x0501]);
const GENERIC_REPORTED: Record<number, number[]> = {
    0x0006: [0x0000], 0x0008: [0x0000], 0x0300: [0x0000, 0x0001, 0x0003, 0x0004, 0x0007, 0x0008, 0x4000], 0x0402: [0x0000], 0x0405: [0x0000],
    0x0403: [0x0000, 0x0010], 0x0400: [0x0000], 0x0406: [0x0000], 0x040d: [0x0000], 0x042a: [0x0000], 0x0408: [0x0000], 0x0001: [0x0020, 0x0021],
    0x0002: [0x0000], 0x0b04: [0x050b, 0x0505, 0x0508, 0x0510, 0x0300], 0x0702: [0x0000, 0x0400], 0x0201: [0x0000, 0x0008, 0x0011, 0x0012, 0x001c, 0x0029],
    0x0102: [0x0008, 0x0009], 0x0101: [0x0000], 0x0202: [0x0000], 0x0500: [0x0002],
};

const scalarOk = (v: any) => typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string';

export function translateOps(ctx: Ctx, ops: Op[]): void {
    const binds = new Map<number, number[]>();
    for (const o of ops) {
        const cl = o.cluster !== undefined ? ctx.zcl.cluster(o.cluster, ctx.customClusters) : undefined;
        if (o.cluster !== undefined && !cl) untr(`configure: unknown cluster ${o.cluster}`);
        const epf = o.ep !== 1 ? {ep: o.ep} : {};
        const mfrOpt = o.options?.manufacturerCode;
        switch (o.op) {
            case 'bind': {
                if (o.target !== COORDINATOR && !(o.target && o.target.ID === COORDINATOR.ID)) untr('configure: bind to a group or another device');
                if (GENERIC_CLUSTERS.has(cl.ID)) break;
                const l = binds.get(o.ep) || [];
                if (!l.includes(cl.ID)) l.push(cl.ID);
                binds.set(o.ep, l);
                break;
            }
            case 'unbind':
                untr('configure: unbind');
                break;
            case 'report':
                for (const it of o.items || []) {
                    const ref = ctx.zcl.attr(o.cluster, it.attribute, ctx.customClusters, mfrOpt);
                    if (!ref) untr(`configure: reporting of unknown attribute ${JSON.stringify(it.attribute)}`);
                    if (ref.mfr == null && (GENERIC_REPORTED[ref.cluster] || []).includes(ref.attr)) continue;
                    if (!ref.type) untr(`configure: attribute type ${ref.typeId}`);
                    const change = typeof it.reportableChange === 'number' ? it.reportableChange : 0;
                    ctx.configure.push({report: {...epf, cluster: ref.cluster, attr: ref.attr, type: ref.type, ...(ref.mfr != null ? {mfr: ref.mfr} : {}),
                        report: [it.minimumReportInterval, it.maximumReportInterval, change]}});
                }
                break;
            case 'read': {
                const attrs: number[] = [];
                let mfr: number | undefined;
                for (const a of o.attrs || []) {
                    const ref = ctx.zcl.attr(o.cluster, a, ctx.customClusters, mfrOpt);
                    if (!ref) untr(`configure: read of unknown attribute ${JSON.stringify(a)}`);
                    if (ref.mfr == null && GENERIC_CLUSTERS.has(ref.cluster)) continue;
                    mfr = ref.mfr;
                    attrs.push(ref.attr);
                }
                if (attrs.length) ctx.configure.push({read: {...epf, cluster: cl.ID, attrs, ...(mfr != null ? {mfr} : {})}});
                break;
            }
            case 'write':
                for (const [k, v] of Object.entries<any>(o.payload || {})) {
                    const isTyped = v && typeof v === 'object' && 'value' in v && 'type' in v;
                    const ref = ctx.zcl.attr(o.cluster, /^\d+$/.test(k) ? {ID: Number(k), type: isTyped ? v.type : undefined} : k, ctx.customClusters, mfrOpt);
                    if (!ref) untr(`configure: write of unknown attribute ${k}`);
                    const value = isTyped ? v.value : v;
                    const type = isTyped ? TYPE_NAMES[v.type] : ref.type;
                    if (!type) untr(`configure: write type ${isTyped ? v.type : ref.typeId}`);
                    if (!scalarOk(value)) untr(`configure: write of a non-scalar value to ${k}`);
                    ctx.configure.push({write: {...epf, cluster: ref.cluster, attr: ref.attr, type, value, ...(ref.mfr != null ? {mfr: ref.mfr} : {})}});
                }
                break;
            case 'command': {
                if (cl.name === 'manuSpecificTuya' && o.cmd === 'dataQuery') {
                    const q = ctx.tuya.query || [];
                    if (!q.includes('configure')) q.unshift('configure');
                    ctx.tuya.query = q;
                    ctx.flags.add('tuya');
                    break;
                }
                if (cl.name === 'manuSpecificTuya' && o.cmd === 'mcuVersionRequest') {
                    ctx.tuya.mcu_version = true;
                    break;
                }
                const c = ctx.zcl.command(o.cluster, o.cmd, ctx.customClusters);
                if (!c) untr(`configure: unknown command ${o.cmd}`);
                const empty = !o.payload || (typeof o.payload === 'object' && Object.keys(o.payload).length === 0);
                if (!empty) untr(`configure: command ${cl.name}.${o.cmd} with a payload`);
                ctx.configure.push({cmd: {...epf, cluster: c.cluster, id: c.id, ...(mfrOpt != null ? {mfr: mfrOpt} : {})}});
                break;
            }
            default:
                untr(`configure: ${o.op}`);
        }
    }
    for (const [ep, clusters] of binds) ctx.configure.push({bind: {...(ep !== 1 ? {ep} : {}), clusters}});
}

// Tuya magic packet: reads of Basic 0x0004, 0x0000, 0x0001, 0x0005, 0x0007, 0xFFFE.
export function isMagicPacket(ops: Op[]): boolean {
    const reads = ops.filter((o) => o.op === 'read' && (o.cluster === 'genBasic' || o.cluster === 0));
    const attrs = reads.flatMap((o) => o.attrs || []);
    return ['manufacturerName', 'zclVersion', 'appVersion', 'modelId', 'powerSource'].every((a) => attrs.includes(a)) && attrs.includes(0xfffe);
}
