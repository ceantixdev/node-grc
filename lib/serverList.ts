import { GBufferReader, GBufferWriter } from "./common/GBuffer";
import { GProtocol, ProtocolGen } from "./common/GProtocol";
import { GSocket } from "./common/GSocket";
import { PacketTable } from "./common/PacketTable";
import { ServerCategory, ServerEntry, ServerlistConfig } from "./typesns";

function determineServerType(serverName: string): [string, ServerCategory] {
	switch (serverName.substring(0, 2)) {
		case "H ":
			return [serverName.substring(2).trimLeft(), ServerCategory.hosted];

		case "P ":
			return [serverName.substring(2).trimLeft(), ServerCategory.gold];

		case "U ":
			return [serverName.substring(2).trimLeft(), ServerCategory.hidden];

		case "3 ":
			return [serverName.substring(2).trimLeft(), ServerCategory.g3d];
	}

	return [serverName, ServerCategory.classic];
}

export class Serverlist
{
	private readonly config: ServerlistConfig = {
		host: "listserver.graal.in",
		port: 14922,
		account: "",
		password: "",
		nickname: "unknown"
	};

	private packetTable: PacketTable

	private sock?: GSocket
	
	private resolvePromise: ((value: ServerEntry[] | PromiseLike<ServerEntry[]>) => void) | undefined;
	// private rejectPromise: ((reason?: any) => void) | undefined;

	constructor(config: Partial<ServerlistConfig>)
	{
		this.config = {...this.config, ...config };
		this.packetTable = this.initializeHandlers();
	}

	public static request(config: Partial<ServerlistConfig>): Promise<ServerEntry[]> {
		return new Promise<ServerEntry[]>(function(resolve, reject) {
			const serverList = new Serverlist(config);
			serverList.resolvePromise = resolve;

			serverList.packetTable.on(4, (id: number, packet: Buffer): void => {
				const discMsg = packet.toString();
				reject(discMsg);
			});

			serverList.sock = GSocket.connect(serverList.config.host, serverList.config.port, {
				connectCallback: () => serverList.sendLoginPacket(),
				disconnectCallback: (err) => reject(err),
				packetTable: serverList.packetTable
			});
		  });
	}
	
	private disconnect()
	{
		if (this.sock)
		{
			this.sock.disconnect();
			this.sock = undefined;
		}
	}
	
	private sendLoginPacket(): void
	{
		if (!this.sock)
			return;

		let nb = GBufferWriter.create();
		
		// Handshake packet
		let someKey = GProtocol.generateKey();
		nb.writeGUInt8(someKey);
		nb.writeChars("G3D30123");
		nb.writeChars("rc2");
		this.sock.sendData(this.sock.sendPacket(7, nb.buffer));
		this.sock.setProtocol(ProtocolGen.Gen5, someKey);

		// Send credentials
		nb.clear();
		nb.writeGString(this.config.account);
		nb.writeGString(this.config.password);
		this.sock.sendData(this.sock.sendPacket(1, nb.buffer));
	}

	private initializeHandlers()
	{
		const packetTable = new PacketTable;

		// packetTable.setCatchAll((id: number, packet: Buffer): void => {
		//     console.log(`Unhandled Packet (${id}): `, packet);
		// });

		packetTable.on(0, (id: number, packet: Buffer): void => {
			let internalBuf = GBufferReader.from(packet);
			let serverCount = internalBuf.readGUInt8();
		
			let servers = []
			for (let i = 0; i < serverCount; i++)
			{
				internalBuf.readGUInt8();

				const serverName = internalBuf.readGString();
				const serverTypeData = determineServerType(serverName);
				
				const entry: ServerEntry = {
					name: serverTypeData[0],
					category: serverTypeData[1],
					language: internalBuf.readGString(),
					description: internalBuf.readGString(),
					url: internalBuf.readGString(),
					version: internalBuf.readGString(),
					pcount: ~~internalBuf.readGString(),
					ip: internalBuf.readGString(),
					port: ~~internalBuf.readGString()
				};
		
				servers.push(entry);
			}

			if (this.resolvePromise)
			{
				this.resolvePromise(servers);
				this.resolvePromise = undefined;

				this.disconnect();
			}
		});

		// packetTable.on(2, (id: number, packet: Buffer): void => {
		//     let statusMsg = packet.toString();
		//     console.log(`Status Msg: ${statusMsg}`);
		// });

		// packetTable.on(3, (id: number, packet: Buffer): void => {
		//     let siteUrl = packet.toString();
		//     console.log(`Website: ${siteUrl}`);
		// });

		// packetTable.on(4, (id: number, packet: Buffer): void => {
		// 	let discMsg = packet.toString();
		//     console.log(`Disconnected for ${discMsg}`);
		// 	this.rejectPromise(discMsg);
		// });

		return packetTable;
	}
}
