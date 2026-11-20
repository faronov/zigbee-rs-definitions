// ZCL name resolution through zigbee-herdsman's cluster table plus the
// custom clusters a definition adds (m.deviceAddCustomCluster, Lumi/Tuya
// helpers).

export const TYPE_NAMES: Record<number, string> = {
    0x10: 'bool', 0x18: 'map8', 0x19: 'map16', 0x1a: 'map24', 0x1b: 'map32', 0x08: 'map8', 0x09: 'map16',
    0x20: 'u8', 0x21: 'u16', 0x22: 'u24', 0x23: 'u32', 0x25: 'u48',
    0x28: 'i8', 0x29: 'i16', 0x2a: 'i24', 0x2b: 'i32', 0x30: 'enum8', 0x31: 'enum16', 0x39: 'f32',
    0x41: 'ostr', 0x42: 'str',
};

export interface AttrRef {
    cluster: number;
    clusterName?: string;
    attr: number;
    type?: string;
    typeId?: number;
    mfr?: number;
}

export class Zcl {
    private herdsman: any;
    constructor(herdsman: any) {
        this.herdsman = herdsman;
    }

    private std(c: string | number): any {
        try {
            const cl = this.herdsman.Zcl.Utils.getCluster(c, undefined, {});
            return cl && cl.ID !== undefined && !(typeof c === 'number' && cl.name === String(c)) ? cl : undefined;
        } catch {
            return undefined;
        }
    }

    // Custom clusters extend standard ones of the same name (as in zigbee-herdsman).
    cluster(c: string | number, custom: Record<string, any>): {ID: number; name: string; attributes: Record<string, any>; commands: Record<string, any>; manufacturerCode?: number} | undefined {
        let name: string | undefined;
        let cust: any;
        if (typeof c === 'number') {
            for (const [n, def] of Object.entries(custom)) if (def.ID === c) [name, cust] = [n, def];
        } else if (custom[c]) [name, cust] = [c, custom[c]];
        const std = this.std(cust ? cust.ID : c) ?? (name ? this.std(name) : undefined);
        if (!cust) return std ?? (typeof c === 'number' ? {ID: c, name: String(c), attributes: {}, commands: {}} : undefined);
        if (!std || std.ID !== cust.ID) return {name, ...cust};
        return {
            ...std, name: std.name,
            attributes: {...std.attributes, ...(cust.attributes || {})},
            commands: {...std.commands, ...(cust.commands || {})},
            commandsResponse: {...std.commandsResponse, ...(cust.commandsResponse || {})},
        } as any;
    }

    // Resolve a zhc (cluster, attribute) pair. `attribute` is a name or {ID, type}.
    attr(c: string | number, attribute: any, custom: Record<string, any>, mfrOption?: number): AttrRef | undefined {
        const cl = this.cluster(c, custom);
        if (!cl) return undefined;
        let id: number | undefined;
        let typeId: number | undefined;
        let mfr: number | undefined = mfrOption;
        if (attribute && typeof attribute === 'object') {
            id = attribute.ID;
            typeId = attribute.type;
            if (mfr == null && attribute.manufacturerCode !== undefined) mfr = attribute.manufacturerCode;
        } else if (typeof attribute === 'number') {
            id = attribute;
            const a = Object.values(cl.attributes || {}).find((x: any) => x.ID === attribute) as any;
            if (a) typeId = a.type;
        } else {
            const a = (cl.attributes || {})[attribute];
            if (!a) return undefined;
            id = a.ID;
            typeId = a.type;
            if (mfr == null && a.manufacturerCode !== undefined) mfr = a.manufacturerCode;
        }
        if (mfr == null && cl.manufacturerCode !== undefined) mfr = cl.manufacturerCode;
        if (id === undefined) return undefined;
        return {cluster: cl.ID, clusterName: cl.name, attr: id, typeId, type: typeId !== undefined ? TYPE_NAMES[typeId] : undefined, mfr};
    }

    command(c: string | number, cmd: string | number, custom: Record<string, any>): {cluster: number; id: number} | undefined {
        const cl = this.cluster(c, custom);
        if (!cl) return undefined;
        if (typeof cmd === 'number') return {cluster: cl.ID, id: cmd};
        const def = (cl.commands || {})[cmd];
        return def ? {cluster: cl.ID, id: def.ID} : undefined;
    }
}

// zhc reporting times ("1_HOUR", "MAX", ...) and repInterval names.
export const TIME_LOOKUP: Record<string, number> = {
    MAX: 65000, '4_HOURS': 14400, '1_HOUR': 3600, '30_MINUTES': 1800, '10_MINUTES': 600, '5_MINUTES': 300,
    '2_MINUTES': 120, '1_MINUTE': 60, '10_SECONDS': 10, '5_SECONDS': 5, '1_SECOND': 1, MIN: 0,
};

export function reportTime(t: any, timeLookup?: Record<string, number>): number | undefined {
    if (typeof t === 'number') return t;
    if (typeof t === 'string') return (timeLookup ?? TIME_LOOKUP)[t];
    return undefined;
}
