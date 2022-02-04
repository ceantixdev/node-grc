import { GProtocol, ProtocolGen } from "./common/GProtocol";
import { GSocket } from "./common/GSocket";
import { PacketTable } from "./common/PacketTable";
import { GBufferReader, GBufferWriter } from "./common/GBuffer";
import { gtokenize, guntokenize } from "./common/utils";
import { NPCControl } from "./npcControl";
import * as types from "./typesns";
import { PlayerProperties, RCIncomingPacket, RCOutgoingPacket } from "./misc/packet";
import { PromiseManger } from "./common/PromiseManager";
import { FileBrowser, RCFileBrowser } from "./fileBrowser";

enum UriConstants {
	FolderConfig = "gserver://config/folderconfig",
	ServerFlags = "gserver://config/serverflags",
	ServerOptions = "gserver://config/serveroptions"
}

interface RCInternal {
	socket(): GSocket | undefined
	promiseManager(): PromiseManger
}

export interface RemoteControlEvents extends types.NCEvents, types.RCEvents { }

export class RemoteControl implements types.RCInterface {
	private readonly config: types.ServerlistConfig;
	public readonly server: types.ServerEntry;
	private readonly eventHandler: RemoteControlEvents;
	private readonly packetTable: PacketTable;
	private readonly fileBrowser: RCFileBrowser;
	private readonly promiseMngr: PromiseManger = new PromiseManger();

	private sock?: GSocket;
	private npcControl?: NPCControl;
	private disconnectMsg?: string;

	public get socket(): GSocket | undefined {
		return this.sock;
	}

	public get FileBrowser(): FileBrowser {
		return this.fileBrowser;
	}

	public get NpcControl(): types.NCInterface | undefined {
		return this.npcControl;
	}

	constructor(config: types.ServerlistConfig, server: types.ServerEntry, eventHandler: RemoteControlEvents) {
		this.config = config;
		this.server = server;
		this.eventHandler = eventHandler;
		this.fileBrowser = new RCFileBrowser(this);

		this.packetTable = this.initializeHandlers();
		this.connect(server.ip, server.port);
	}

	public isConnected(): boolean {
		return !!this.sock;
	}

	public connect(host: string, port: number): boolean {
		if (this.sock) {
			return false;
		}

		this.sock = GSocket.connect(host, port, {
			connectCallback: () => this.onConnect(),
			disconnectCallback: (err?: Error) => this.onDisconnect(err),
			packetTable: this.packetTable
		});

		return true;
	}

	public disconnect(): void {
		this.sock?.disconnect();
	}

	private onConnect(): void {
		console.log("[RC] Connected!");

		if (!this.sock) {
			return;
		}

		// Send login packet
		const key = GProtocol.generateKey();

		const writer = GBufferWriter.create();
		writer.writeGUInt8(key);
		writer.writeChars("GSERV025");
		writer.writeGString(this.config.account);
		writer.writeGString(this.config.password);

		this.sock.sendData(this.sock.sendPacket(6, writer.buffer));
		this.sock.setProtocol(ProtocolGen.Gen5, key);
	}

	private onDisconnect(err?: Error): void {
		this.sock = undefined;

		if (this.npcControl) {
			this.npcControl.disconnect();
			this.npcControl = undefined;
		}

		this.eventHandler.onRCDisconnected?.(this, this.disconnectMsg || err?.message);

		console.log("[RC] Disconnected");
	}

	private requestNpcServer(): void {
		const writer = GBufferWriter.create(2 + "location".length);
		writer.writeGUInt16(2); // npc-server id
		writer.writeChars("location");
		this.sock?.sendData(this.sock.sendPacket(RCOutgoingPacket.PLI_NPCSERVERQUERY, writer.buffer));

		this.sock?.sendData(this.sock?.sendPacket(RCOutgoingPacket.PLI_RC_FILEBROWSER_START));

		// const d = this.changeDirectory("world/");
		// d.then((v) => {
		// 	console.log("Received directory listing: ", v);
		// 	this.fileBrowser.get("pics1.png").then((v) => {
		// 		fs.writeFileSync("/Users/joey/pics1.png", v);
		// 	});
		// });

		// const writer2 = GBufferWriter.create();
		// writer2.writeChars("world/");
		// this.sock?.sendData(this.sock?.sendPacket(RCOutgoingPacket.PLI_RC_FILEBROWSER_CD, writer2.buffer));
	}

	private connectToNpcServer(host: string, port: number): NPCControl | null {
		if (this.npcControl) {
			this.npcControl.disconnect();
			this.npcControl = undefined;
		}

		this.npcControl = new NPCControl(this.config, {
			host: host, port: port
		}, this.eventHandler);

		return this.npcControl;
	}

	////////////////////

	requestFolderConfig(): Promise<string> {
		this.sock?.sendData(this.sock.sendPacket(RCOutgoingPacket.PLI_RC_FOLDERCONFIGGET));
		return this.promiseMngr.createPromise(UriConstants.FolderConfig);
	}

	requestServerFlags(): Promise<string> {
		this.sock?.sendData(this.sock.sendPacket(RCOutgoingPacket.PLI_RC_SERVERFLAGSGET));
		return this.promiseMngr.createPromise(UriConstants.ServerFlags);
	}

	requestServerOptions(): Promise<string> {
		this.sock?.sendData(this.sock.sendPacket(RCOutgoingPacket.PLI_RC_SERVEROPTIONSGET));
		return this.promiseMngr.createPromise(UriConstants.ServerOptions);
	}

	setFolderConfig(text: string): void {
		const escapedBuffer = Buffer.from(gtokenize(text));
		this.sock?.sendData(this.sock.sendPacket(RCOutgoingPacket.PLI_RC_FOLDERCONFIGSET, escapedBuffer));
	}

	setServerFlags(text: string): void {
		const writer = GBufferWriter.create();
		const lines = text.split('\n');

		writer.writeGUInt16(lines.length);
		for (const line of lines) {
			writer.writeGString(line.slice(0, 223));
		}

		this.sock?.sendData(this.sock.sendPacket(RCOutgoingPacket.PLI_RC_SERVERFLAGSSET, writer.buffer));
	}

	setServerOptions(text: string): void {
		const escapedBuffer = Buffer.from(gtokenize(text));
		this.sock?.sendData(this.sock.sendPacket(RCOutgoingPacket.PLI_RC_SERVEROPTIONSSET, escapedBuffer));
	}

	sendRCChat(msg: string): void {
		this.sock?.sendData(this.sock.sendPacket(RCOutgoingPacket.PLI_RCCHAT, Buffer.from(msg)));
	}

	setNickName(name: string): void {
		const writer = GBufferWriter.create(2 + name.length);
		writer.writeGUInt8(PlayerProperties.PLPROP_NICKNAME);
		writer.writeGString(name);
		this.sock?.sendData(this.sock.sendPacket(RCOutgoingPacket.PLI_PLAYERPROPS, writer.buffer));
	}

	initializeHandlers(): PacketTable {
		const packetTable = new PacketTable;

		packetTable.setDefault((id: number, packet: Buffer): void => {
			console.log(`[RC] Unhandled Packet (${id}): ${packet.toString().replace(/\r/g, "")}`);
		});

		packetTable.on(RCIncomingPacket.PLO_DISCMESSAGE, (id: number, packet: Buffer): void => {
			this.disconnectMsg = packet.toString();
		});

		packetTable.on(RCIncomingPacket.PLO_SIGNATURE, (id: number, packet: Buffer): void => {
			console.log("[RC] Authenticated!");

			this.eventHandler.onRCConnected?.(this);
			this.requestNpcServer();
		});

		packetTable.on(RCIncomingPacket.PLO_NEWWORLDTIME, (id: number, packet: Buffer): void => {
			const reader = GBufferReader.from(packet);
			const serverTime = reader.readGUInt32();
		});

		packetTable.on(RCIncomingPacket.PLO_RCCHAT, (id: number, packet: Buffer): void => {
			const msg = packet.toString();
			this.eventHandler.onRCChat?.(msg);
		});

		packetTable.on(RCIncomingPacket.PLO_RC_SERVERFLAGSGET, (id: number, packet: Buffer): void => {
			const reader = GBufferReader.from(packet);
			const flagCount = reader.readGUInt16();

			let text = "";
			for (let i = 0; i < flagCount; i++) {
				text += reader.readGString() + "\n";
			}

			this.promiseMngr.resolvePromise(UriConstants.ServerFlags, text);
		});

		packetTable.on(RCIncomingPacket.PLO_RC_SERVEROPTIONSGET, (id: number, packet: Buffer): void => {
			const text = guntokenize(packet.toString());
			this.promiseMngr.resolvePromise(UriConstants.ServerOptions, text);
		});

		packetTable.on(RCIncomingPacket.PLO_RC_FOLDERCONFIGGET, (id: number, packet: Buffer): void => {
			const text = guntokenize(packet.toString());
			this.promiseMngr.resolvePromise(UriConstants.FolderConfig, text);
		});

		packetTable.on(RCIncomingPacket.PLO_NPCSERVERADDR, (id: number, packet: Buffer): void => {
			const reader = GBufferReader.from(packet);
			const npcServerPID = reader.readGUInt16();
			const address = reader.readChars(reader.bytesLeft);

			const split = address.split(",");
			if (split.length === 2) {
				// TODO(joey): in a future date, connect to this ip, and if it fails to connect
				// then use the server-ip's address as a backup to prevent breaking localhost servers
				if (split[0] === "127.0.0.1") {
					split[0] = this.server.ip;
				}

				this.connectToNpcServer(split[0], +split[1]);
			}
		});

		packetTable.on(RCIncomingPacket.PLO_RAWDATA, (id: number, packet: Buffer): void => {
			const rawDataSize = GBufferReader.from(packet).readGUInt24();
			if (this.sock && rawDataSize > 0) {
				this.sock.rawBytesAhead = rawDataSize;
			}
		});

		packetTable.on(RCIncomingPacket.PLO_RC_MAXUPLOADFILESIZE, (id: number, packet: Buffer): void => {
			const maxUploadSize = GBufferReader.from(packet).readGULong();
			console.log(`Upload Size: ${maxUploadSize} Mebibytes`);
		});

		// User folder rights
		packetTable.on(RCIncomingPacket.PLO_RC_FILEBROWSER_DIRLIST, (id: number, packet: Buffer): void => {
			const text = guntokenize(packet.toString());
			this.fileBrowser.setFolderRights(text);
		});

		// Directory listing
		packetTable.on(RCIncomingPacket.PLO_RC_FILEBROWSER_DIR, (id: number, packet: Buffer): void => {
			const reader = GBufferReader.from(packet);
			const folderName = reader.readGString();
			this.fileBrowser.setFolderFiles(reader, folderName);
		});

		// Filebrowser messages
		packetTable.on(RCIncomingPacket.PLO_RC_FILEBROWSER_MESSAGE, (id: number, packet: Buffer): void => {
			const msg = packet.toString();
			this.eventHandler.onFileBrowserMsg?.(msg);

			console.log("[RC] PLO_RC_FILEBROWSER_MESSAGE:", msg);
		});

		packetTable.on(RCIncomingPacket.PLO_LARGEFILESTART, (id: number, packet: Buffer): void => {
			const fileName = packet.toString();
			this.fileBrowser.startLargeFile(fileName);
		});

		packetTable.on(RCIncomingPacket.PLO_LARGEFILESIZE, (id: number, packet: Buffer): void => {
			const fileSize = GBufferReader.from(packet).readGULong();
			this.fileBrowser.setActiveFileSize(fileSize);
		});

		packetTable.on(RCIncomingPacket.PLO_LARGEFILEEND, (id: number, packet: Buffer): void => {
			const fileName = packet.toString();
			this.fileBrowser.finishLargeFile(fileName);
		});

		packetTable.on(RCIncomingPacket.PLO_FILE, (id: number, packet: Buffer): void => {
			const reader = GBufferReader.from(packet);

			const modTime = reader.readGULong();
			const fileName = reader.readGString();
			const fileData = reader.read(reader.bytesLeft - 1); // removing '\n' character

			this.fileBrowser.appendFileContent(fileName, modTime, fileData);

			console.log(`Partial file data received for ${fileName} -> ${fileData.length} bytes --- `, modTime, fileData.slice(fileData.length - 5));
		});

		packetTable.on(RCIncomingPacket.PLO_FILESENDFAILED, (id: number, packet: Buffer): void => {
			const fileName = packet.toString();
			this.fileBrowser.fileDownloadFailed(fileName);
		});

		return packetTable;
	}
}
