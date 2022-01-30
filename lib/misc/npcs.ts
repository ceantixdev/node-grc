import { GBufferReader } from "../common/GBuffer";

type PropData = number | string;

export enum NPCPropID {
    NPCPROP_ID = 17,
    NPCPROP_SCRIPTER = 49,
    NPCPROP_NAME = 50,
    NPCPROP_TYPE = 51,
    NPCPROP_CURLEVEL = 52
}

export class NPCManager {
    private readonly npcList: {[key: number]: NPC} = {};

    public get npcs(): NPC[] {
        return Object.values(this.npcList); //.filter((v) => NPCPropID.NPCPROP_NAME in v.props);
    }

    public deleteNpc(id: number): boolean {
        if (id in this.npcList) {
            delete this.npcList[id];
            return true;
        }

        return false;
    }

    public getNpc(id: number, create: boolean = true): NPC {
        if (create && !(id in this.npcList)) {
            this.npcList[id] = new NPC(id);
        }

        return this.npcList[id] || undefined;
    }

    public findNPC(name: string): NPC | undefined {
        for (const [k, v] of Object.entries(this.npcList)) {
            if (v.getProp(NPCPropID.NPCPROP_NAME) === name) {
                return v;
            }
        }
    }
}

export class NPC {
    props: {[key: number]: PropData} = {};

    constructor(public readonly id: number) {
        this.props[NPCPropID.NPCPROP_ID] = id;
    }

    getProp(id: number): PropData {
        return this.props[id];
    }

    setProps(reader: GBufferReader) {
        while (reader.bytesLeft) {
            const propId: NPCPropID = reader.readGUInt8();
            switch (propId) {
                case NPCPropID.NPCPROP_ID:
                    this.props[propId] = reader.readGUInt16();
                    break;
                    
                case NPCPropID.NPCPROP_SCRIPTER:
                case NPCPropID.NPCPROP_NAME:
                case NPCPropID.NPCPROP_TYPE:
                case NPCPropID.NPCPROP_CURLEVEL:
                    this.props[propId] = reader.readGString();
                    break;

                default:
                    console.log(`Unhandled NPC Property: ${NPCPropID}`);
                    return;
            }
        }
    }
}