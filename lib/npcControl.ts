import { GBufferReader, GBufferWriter } from "./common/GBuffer";
import { ProtocolGen } from "./common/GProtocol";
import { GSocket } from "./common/GSocket";
import { PacketTable } from "./common/PacketTable";
import { PromiseManger } from "./common/PromiseManager";
import { gtokenize, guntokenize } from "./common/utils";
import { NPC, NPCManager, NPCPropID } from "./misc/npcs";
import { NCIncomingPacket, NCOutgoingPacket } from "./misc/packet";
import { NCEvents, NCInterface, ServerlistConfig } from "./typesns";

enum UriConstants {
	NpcPrefix = "npcserver://npcs/",
	ScriptPrefix = "npcserver://scripts/",
	WeaponPrefix = "npcserver://weapons/",
	WeaponList = "npcserver://weapons",
	LevelList = "npcserver://levellist"
}

enum ErrorMsg {
	NotFound = "Resource not found"
}

interface NpcControlConfig {
	host: string
	port: number
}

export class NPCControl implements NCInterface
{
	private sock?: GSocket;
	private readonly packetTable: PacketTable;
	private readonly eventHandler: NCEvents;

	private promiseMngr: PromiseManger = new PromiseManger();
	private npcMngr: NPCManager = new NPCManager();
	private classList: Set<string> = new Set<string>();
	
	public get classes(): Set<string> {
		return this.classList;
	}

	public get npcs(): NPC[] {
		return this.npcMngr.npcs;
	}

	constructor(private readonly config: ServerlistConfig, ncConfig: NpcControlConfig, eventHandler: NCEvents) {
		this.eventHandler = eventHandler;
		this.packetTable = this.initializeHandlers();
		this.connect(ncConfig.host, ncConfig.port);
	}

	public connect(host: string, port: number): boolean {
		if (this.sock) {
			return false;
		}

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

	requestLevelList(): Promise<string> {
		this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_LEVELLISTGET));
		return this.promiseMngr.createPromise(UriConstants.LevelList);
	}

	deleteWeapon(name: string): void {
		this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_WEAPONDELETE, Buffer.from(name)));
	}

	requestWeaponList(): Promise<Set<string>> {
		this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_WEAPONLISTGET));
		return this.promiseMngr.createPromise(UriConstants.WeaponList);
	}

	requestWeapon(name: string): Promise<[string, string]> {
		this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_WEAPONGET, Buffer.from(name)));
		return this.promiseMngr.createPromise(UriConstants.WeaponPrefix + name);
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

	requestNpcAttributes(name: string): Promise<string> {
		const npcObject = this.npcMngr.findNPC(name);
		if (npcObject) {
			const nb = GBufferWriter.create(3);
			nb.writeGUInt24(npcObject.id);
			this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_NPCGET, nb.buffer));
			return this.promiseMngr.createPromise(UriConstants.NpcPrefix + name + ".attrs");
		}

		return Promise.reject(ErrorMsg.NotFound);
	}

	requestNpcFlags(name: string): Promise<string> {
		const npcObject = this.npcMngr.findNPC(name);
		if (npcObject) {
			const nb = GBufferWriter.create(3);
			nb.writeGUInt24(npcObject.id);
			this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_NPCFLAGSGET, nb.buffer));
			return this.promiseMngr.createPromise(UriConstants.NpcPrefix + name + ".flags");
		}

		return Promise.reject(ErrorMsg.NotFound);
	}

	requestNpcScript(name: string): Promise<string> {
		const npcObject = this.npcMngr.findNPC(name);
		if (npcObject) {
			const nb = GBufferWriter.create(3);
			nb.writeGUInt24(npcObject.id);
			this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_NPCSCRIPTGET, nb.buffer));
			return this.promiseMngr.createPromise(UriConstants.NpcPrefix + name + ".script");
		}

		return Promise.reject(ErrorMsg.NotFound);
	}

	setNpcFlags(name: string, script: string): void {
		const npcObject = this.npcMngr.findNPC(name);
		if (npcObject) {
			const nb = GBufferWriter.create(3);
			nb.writeGUInt24(npcObject.id);
			nb.writeChars(gtokenize(script));
			this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_NPCFLAGSSET, nb.buffer));
		}
	}

	setNpcScript(name: string, script: string): void {
		const npcObject = this.npcMngr.findNPC(name);
		if (npcObject) {
			const nb = GBufferWriter.create(3);
			nb.writeGUInt24(npcObject.id);
			nb.writeChars(gtokenize(script));
			this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_NPCSCRIPTSET, nb.buffer));
		}
	}

	deleteClass(name: string): Promise<void> {
		this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_CLASSDELETE, Buffer.from(name)));
		return this.promiseMngr.createPromise("CLASS_DELETE_" + name);
	}

	requestClass(name: string): Promise<string> {
		this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_CLASSEDIT, Buffer.from(name)));
		return this.promiseMngr.createPromise(UriConstants.ScriptPrefix + name);
	}

	setClassScript(name: string, script: string): Promise<void> {
		const nb = GBufferWriter.create();
		nb.writeGString(name);
		nb.writeChars(gtokenize(script));
		this.sock?.sendData(this.sock.sendPacket(NCOutgoingPacket.PLI_NC_CLASSADD, nb.buffer));
		return this.promiseMngr.createPromise("CLASS_ADD_" + name);
	}

	private initializeHandlers(): PacketTable {
		const packetTable = new PacketTable;

		packetTable.setDefault((id: number, packet: Buffer): void => {
			if (id !== 42) {
				console.log(`[NC] Unhandled Packet (${id}): ${packet.toString().replace(/\r/g, "")}`);
			}
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
			this.promiseMngr.resolvePromise(UriConstants.LevelList, levelList);
		});

		packetTable.on(NCIncomingPacket.PLO_NC_NPCATTRIBUTES, (id: number, packet: Buffer): void => {
			const text = guntokenize(packet.toString());
			const name = text.substring("Variable dump from npc ".length + 1, text.indexOf('\n')).trimEnd();

			this.promiseMngr.resolvePromise(UriConstants.NpcPrefix + name + ".attrs", text);
		});

		packetTable.on(NCIncomingPacket.PLO_NC_NPCADD, (id: number, packet: Buffer): void => {
			const reader = GBufferReader.from(packet);

			const npcId = reader.readGUInt24();
			const npcObj = this.npcMngr.getNpc(npcId);
			npcObj.setProps(reader);

			this.eventHandler.onNpcAdded?.(npcObj.props[NPCPropID.NPCPROP_NAME] as string);
			// console.log(`NPC Added: ${npcObj.props[NPCPropID.NPCPROP_NAME]}`);
		});

		packetTable.on(NCIncomingPacket.PLO_NC_NPCDELETE, (id: number, packet: Buffer): void => {
			const reader = GBufferReader.from(packet);

			const npcId = reader.readGUInt24();
			// this.npcMngr.deleteNpc(npcId);

			const npcObj = this.npcMngr.getNpc(npcId);
			const npcName = npcObj.props[NPCPropID.NPCPROP_NAME] as string;

			if (this.npcMngr.deleteNpc(npcId)) {
				this.eventHandler.onNpcDeleted?.(npcName);
				console.log(`Delete npc ${npcName}`);
			}
		});
		
		packetTable.on(NCIncomingPacket.PLO_NC_NPCSCRIPT, (id: number, packet: Buffer): void => {
			const reader = GBufferReader.from(packet);
			const npcId = reader.readGUInt24();
			const text = guntokenize(reader.readChars(reader.bytesLeft));

			const npcObj = this.npcMngr.getNpc(npcId);
			if (npcObj) {
				const npcName = npcObj.props[NPCPropID.NPCPROP_NAME] as string;
				this.promiseMngr.resolvePromise(UriConstants.NpcPrefix + npcName + ".script", text);
			}
		});

		packetTable.on(NCIncomingPacket.PLO_NC_NPCFLAGS, (id: number, packet: Buffer): void => {
			const reader = GBufferReader.from(packet);
			const npcId = reader.readGUInt24();
			const text = guntokenize(reader.readChars(reader.bytesLeft));

			const npcObj = this.npcMngr.getNpc(npcId);
			if (npcObj) {
				const npcName = npcObj.props[NPCPropID.NPCPROP_NAME] as string;
				this.promiseMngr.resolvePromise(UriConstants.NpcPrefix + npcName + ".flags", text);
			}
		});

		packetTable.on(NCIncomingPacket.PLO_NC_CLASSGET, (id: number, packet: Buffer): void => {
			const reader = GBufferReader.from(packet);
			const name = reader.readGString();
			const script = guntokenize(reader.readChars(reader.bytesLeft));

			this.promiseMngr.resolvePromise(UriConstants.ScriptPrefix + name, script);
		});

		packetTable.on(NCIncomingPacket.PLO_NC_CLASSADD, (id: number, packet: Buffer): void => {
			const className = packet.toString();
			this.classList.add(className);
			this.promiseMngr.resolvePromise("CLASS_ADD_" + className, undefined);
		});

		packetTable.on(NCIncomingPacket.PLO_NC_CLASSDELETE, (id: number, packet: Buffer): void => {
			const className = packet.toString();
			this.classList.delete(className);
			this.promiseMngr.resolvePromise("CLASS_DELETE_" + className, undefined);
		});

		packetTable.on(NCIncomingPacket.PLO_NC_WEAPONGET, (id: number, packet: Buffer): void => {
			const reader = GBufferReader.from(packet);
			const name = reader.readGString();
			const image = reader.readGString();
			
			let script = reader.readChars(reader.bytesLeft);
			script = script.replace(/\xa7/g, '\n');

			this.promiseMngr.resolvePromise<[string, string]>(UriConstants.WeaponPrefix + name, [image, script]);
		});

		packetTable.on(NCIncomingPacket.PLO_NC_WEAPONLISTGET, (id: number, packet: Buffer): void => {
			const weaponList: Set<string> = new Set;

			const reader = GBufferReader.from(packet);
			while (reader.bytesLeft) {
				weaponList.add(reader.readGString());
			}

			this.promiseMngr.resolvePromise(UriConstants.WeaponList, weaponList);
		});

		return packetTable;
	}
}
