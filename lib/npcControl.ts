import { GBufferReader, GBufferWriter } from "./common/GBuffer";
import { ProtocolGen } from "./common/GProtocol";
import { GSocket } from "./common/GSocket";
import { PacketTable } from "./common/PacketTable";
import { gtokenize, guntokenize } from "./common/utils";
import { NPC, NPCManager, NPCPropID } from "./misc/npcs";
import { NCIncomingPacket, NCOutgoingPacket } from "./misc/packet";
import { NCEvents, NCInterface, ServerlistConfig } from "./typesns";

interface NpcControlConfig {
	host: string
	port: number
}

export class NPCControl implements NCInterface
{
	private sock?: GSocket;
	private readonly packetTable: PacketTable;
	private readonly eventHandler: NCEvents;

	private npcMngr: NPCManager = new NPCManager();
	private classList: Set<string> = new Set<string>();
	private weaponList: Set<string> = new Set<string>();
	
	public get classes(): Set<string> {
		return this.classList;
	}

	public get npcs(): NPC[] {
		return this.npcMngr.npcs;
	}

	public get testnpcmngr(): NPCManager {
		return this.npcMngr;
	}
	
	public get weapons(): Set<string> {
		return this.weaponList;
	}

	constructor(private readonly config: ServerlistConfig, ncConfig: NpcControlConfig, eventHandler: NCEvents) {
		this.eventHandler = eventHandler;
		this.packetTable = this.initializeHandlers();
		this.connect(ncConfig.host, ncConfig.port);
	}

	public connect(host: string, port: number): boolean {
		if (this.sock)
			return false;

		this.sock = GSocket.connect(host, port, {
			connectCallback: () => this.onConnect(),
			disconnectCallback: () => this.onDisconnect(),
			packetTable: this.packetTable
		});

		return true;
	}

	public disconnect(): void {
		this.sock?.disconnect();
	}
	
	public requestLevelList(): void {
		this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_LEVELLISTGET));
	}

	public updateLevelList(text: string): void {

	}

	////////////////////

	private onConnect(): void {
		console.log("[NC] Connected!");

		if (!this.sock) {
			console.log("[NC] no sock?");
			return;
		}

		// Send login packet
		let nb = GBufferWriter.create();
		nb.writeChars("NCL21075");
		nb.writeGString(this.config.account);
		nb.writeGString(this.config.password);
		this.sock.sendData(this.sock.sendPacket(3, nb.buffer));

		this.sock.setProtocol(ProtocolGen.Gen3, 0);

		// The only proof that you passed verification, is the fact that you are
		// still connected to the server.
		this.eventHandler.onNCConnected?.();
	}

	private onDisconnect(): void {
		console.log("[NC] Disconnected!");

		if (!this.sock) {
			console.log("[NC] no sock?");
			return;
		}

		this.eventHandler.onNCDisconnected?.();
	}

	////////////////////

	deleteWeapon(name: string): void {
		this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_WEAPONDELETE, Buffer.from(name)));
	}

	requestWeaponList(): void {
		this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_WEAPONLISTGET));
	}

	requestWeapon(name: string): void {
		this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_WEAPONGET, Buffer.from(name)));
	}

	setWeaponScript(name: string, image: string, script: string): void {
		// Weapons are sent by replacing newlines with \xa7 character
		script = script.replace(/\n/g, '§');
		script = script.replace(/\r/g, "");

		const writer = GBufferWriter.create(1 + name.length + 1 + image.length + script.length);
		writer.writeGString(name);
		writer.writeGString(image);
		writer.writeChars(script);
		this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_WEAPONADD, writer.buffer));
	}
	
	deleteNpc(name: string): void {
		throw new Error("Method not implemented.");
	}

	requestNpcAttributes(name: string): void {
		const npcObject = this.npcMngr.findNPC(name);
		if (npcObject) {
			const nb = GBufferWriter.create(3);
			nb.writeGUInt24(npcObject.id);
			this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_NPCGET, nb.buffer));
		}
	}

	requestNpcFlags(name: string): void {
		const npcObject = this.npcMngr.findNPC(name);
		if (npcObject) {
			const nb = GBufferWriter.create(3);
			nb.writeGUInt24(npcObject.id);
			this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_NPCFLAGSGET, nb.buffer));
		}
	}

	requestNpcScript(name: string): void {
		const npcObject = this.npcMngr.findNPC(name);
		if (npcObject) {
			const nb = GBufferWriter.create(3);
			nb.writeGUInt24(npcObject.id);
			this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_NPCSCRIPTGET, nb.buffer));
		}
	}

	setNpcFlags(name: string, script: string): void {
		throw new Error("Method not implemented.");
	}

	setNpcScript(name: string, script: string): void {
		throw new Error("Method not implemented.");
	}

	deleteClass(name: string): void {
		this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_CLASSDELETE, Buffer.from(name)));
	}

	requestClass(name: string): void {
		this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_CLASSEDIT, Buffer.from(name)));
	}

	setClassScript(name: string, script: string): void {
		const nb = GBufferWriter.create();
		nb.writeGString(name);
		nb.writeChars(gtokenize(script));
		this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_CLASSADD, nb.buffer));
	}

	private initializeHandlers(): PacketTable {
		const packetTable = new PacketTable;

		packetTable.setDefault((id: number, packet: Buffer): void => {
			console.log(`[NC] Unhandled Packet (${id}): ${packet.toString().replace(/\r/g, "")}`);
		});

		packetTable.on(NCIncomingPacket.PLO_NEWWORLDTIME, (id: number, packet: Buffer): void => {
			const reader = GBufferReader.from(packet);
			const serverTime = reader.readGUInt32();
		});

		packetTable.on(NCIncomingPacket.PLO_RCCHAT, (id: number, packet: Buffer): void => {
			const msg = packet.toString();
			this.eventHandler.onNCChat?.(msg);
		});

		packetTable.on(NCIncomingPacket.PLO_NC_LEVELLIST, (id: number, packet: Buffer): void => {
			const levelList = guntokenize(packet.toString());
			this.eventHandler.onReceiveLevelList?.(levelList);
		});

		packetTable.on(NCIncomingPacket.PLO_NC_NPCATTRIBUTES, (id: number, packet: Buffer): void => {
			// TODO: Use a queue to keep track of npc names, FIFO
			//	OR pull the name from the "Variable dump from npc xyz"
			const text = guntokenize(packet.toString());
			this.eventHandler.onReceiveNpcAttributes?.("", text);
		});

		packetTable.on(NCIncomingPacket.PLO_NC_NPCADD, (id: number, packet: Buffer): void => {
			const reader = GBufferReader.from(packet);

			const npcId = reader.readGUInt24();
			const npcObj = this.npcMngr.getNpc(npcId);
			npcObj.setProps(reader);

			// @ts-ignore
			this.requestNpcAttributes(npcObj.props[NPCPropID.NPCPROP_NAME]);

			console.log(`NPC Added: ${npcObj.props[NPCPropID.NPCPROP_NAME]}`);
		});

		packetTable.on(NCIncomingPacket.PLO_NC_NPCDELETE, (id: number, packet: Buffer): void => {
			const reader = GBufferReader.from(packet);

			const npcId = reader.readGUInt24();
			// this.npcMngr.deleteNpc(npcId);

			const npcObj = this.npcMngr.getNpc(npcId);
			const npcName = npcObj.props[NPCPropID.NPCPROP_NAME];

			if (this.npcMngr.deleteNpc(npcId)) {
				console.log(`Delete npc ${npcObj.props[NPCPropID.NPCPROP_NAME]}`);
			}
		});
		
		packetTable.on(NCIncomingPacket.PLO_NC_NPCSCRIPT, (id: number, packet: Buffer): void => {
			const reader = GBufferReader.from(packet);
			const npcId = reader.readGUInt24();
			const text = guntokenize(reader.readChars(reader.bytesLeft));

			const npcObj = this.npcMngr.getNpc(npcId);

			// @ts-ignore
			this.eventHandler.onReceiveNpcScript?.(npcObj.props[NPCPropID.NPCPROP_NAME], text);
		});

		packetTable.on(NCIncomingPacket.PLO_NC_NPCFLAGS, (id: number, packet: Buffer): void => {
			const reader = GBufferReader.from(packet);
			const npcId = reader.readGUInt24();
			const text = guntokenize(reader.readChars(reader.bytesLeft));

			const npcObj = this.npcMngr.getNpc(npcId);

			// @ts-ignore
			this.eventHandler.onReceiveNpcFlags?.(npcObj.props[NPCPropID.NPCPROP_NAME], text);
		});

		packetTable.on(NCIncomingPacket.PLO_NC_CLASSGET, (id: number, packet: Buffer): void => {
			const reader = GBufferReader.from(packet);
			const name = reader.readGString();
			const script = guntokenize(reader.readChars(reader.bytesLeft));

			this.eventHandler.onReceiveClassScript?.(name, script);
		});

		packetTable.on(NCIncomingPacket.PLO_NC_CLASSADD, (id: number, packet: Buffer): void => {
			const className = packet.toString();
			this.classList.add(className);
		});

		packetTable.on(NCIncomingPacket.PLO_NC_CLASSDELETE, (id: number, packet: Buffer): void => {
			const className = packet.toString();
			this.classList.delete(className);
		});

		packetTable.on(NCIncomingPacket.PLO_NC_WEAPONGET, (id: number, packet: Buffer): void => {
			const reader = GBufferReader.from(packet);
			const name = reader.readGString();
			const image = reader.readGString();
			
			let script = reader.readChars(reader.bytesLeft);
			script = script.replace(/\xa7/g, '\n');

			this.eventHandler.onReceiveWeaponScript?.(name, image, script);
		});

		packetTable.on(NCIncomingPacket.PLO_NC_WEAPONLISTGET, (id: number, packet: Buffer): void => {
			this.weaponList.clear();

			const reader = GBufferReader.from(packet);
			while (reader.bytesLeft) {
				this.weaponList.add(reader.readGString());
			}
			
			this.eventHandler.onReceiveWeaponList?.([...this.weaponList]);
		});

		return packetTable;
	}
}
