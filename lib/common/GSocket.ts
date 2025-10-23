import net = require('net');
import { GProtocol, ProtocolGen } from './GProtocol';
import { PacketHandler, PacketTable } from './PacketTable';

export type ConnectHandler = () => void;
export type DisconnectHandler = (err?: Error) => void;

export interface SocketConfigurartion {
    connectCallback?: ConnectHandler
    disconnectCallback?: DisconnectHandler
    packetTable?: PacketTable
}

export class GSocket {
    private buffer: Buffer;
    private enc: GProtocol | null = null;
    private sock: net.Socket | null = null;
    private packetHandler: PacketTable;
    private config: SocketConfigurartion;

    public rawBytesAhead: number = 0;

    protected constructor(cfg: SocketConfigurartion) {
        this.buffer = Buffer.allocUnsafe(0);
        this.config = cfg;
        this.packetHandler = cfg?.packetTable || new PacketTable;
    }

    public static connect(host: string, port: number, cfg?: SocketConfigurartion): GSocket {
        const newSock = new GSocket(cfg || {});
        newSock.setProtocol(ProtocolGen.Gen2);
        newSock.connect(host, port);
        return newSock;
    }

    // Expose PacketHandler methods
    public on(id: number, callback: PacketHandler) {
        return this.packetHandler.on(id, callback);
    }

    private connect(host: string, port: number) {
        this.sock = new net.Socket();
        this.sock.setTimeout(10000);

        this.sock.connect(port, host, this.config.connectCallback);

        this.sock.on("data", (data: Buffer) => {
            this.buffer = Buffer.concat([this.buffer, data]);

            while (this.buffer.length > 0) {
                const readLen = this.buffer.readUInt16BE();
                if (this.buffer.length < readLen + 2)
                    break;

                this.processData(this.buffer.slice(2, 2 + readLen));
                this.buffer = this.buffer.slice(2 + readLen);
            }
        });

        this.sock.on('close', () => {
            console.log(`[SOCKET CLOSE] ${host}:${port}`);

            this.config.disconnectCallback?.();
        });

        this.sock.on('error', (error) => {
            console.log(`[SOCKET ERROR] ${host}:${port}`);

            this.disconnect();
        });

        this.sock.on('timeout', () => {
            console.log(`[SOCKET TIMED OUT] ${host}:${port}`);
        });
    }

    public disconnect() {
        if (this.sock) {
            this.sock.destroy();
            this.sock = null;
        }
    }

    public setProtocol(protocol: ProtocolGen, key?: number) {
        this.enc = GProtocol.initialize(protocol, key);
    }

    public sendData(buf: Buffer) {
        if (this.enc)
            buf = this.enc.encrypt(buf);

        let nb = Buffer.allocUnsafe(buf.length + 2);
        buf.copy(nb, 2);
        nb.writeUInt16BE(buf.length, 0);

        this.sock?.write(nb);
    }

    public sendPacket(id: number, buf?: Buffer) {
        // Ensure packet ends with the ending mark (newline, 0x0a)
        if (!buf || buf.length === 0 || buf[buf.length - 1] !== 0x0a) {
           buf = Buffer.concat([buf || Buffer.alloc(0), Buffer.from([0x0a])]);
        }

        const buffers = [Buffer.from([id + 32])];

        if (buf)
            buffers.push(buf);

        // Append new line to packets
        if (!buf || buf[buf.length - 1] != 0xa)
            buffers.push(Buffer.from([0xa]));

        return Buffer.concat(buffers);
    }

    private processData(buf: Buffer) {
        if (this.enc)
            buf = this.enc.decrypt(buf);

        let offset = 0;
        while (offset < buf.length) {
            let idx;

            // Read data from buffer, terminating at '\n' or rawBytesAhead if defined
            if (this.rawBytesAhead > 0) {
                if (this.rawBytesAhead > buf.length - offset) {
                    break;
                }

                idx = offset + this.rawBytesAhead;
            }
            else {
                idx = buf.indexOf('\n', offset);
                if (idx === -1) {
                    break;
                }
            }

            // Copy data into a new buffer
            let b = Buffer.allocUnsafe(idx - offset);
            buf.copy(b, 0, offset, idx);

            if (this.rawBytesAhead > 0) {
                // Reset raw
                this.rawBytesAhead = 0;
                offset = idx;
            } else {
                // Skip passed the newline
                offset = idx + 1;
            }

            // Process the packet
            let packetId = b.readUInt8();
            this.processPacket(packetId - 32, b.slice(1));
        }
    }

    private processPacket(id: number, buf: Buffer) {
        let handlers = this.packetHandler.getCallbacks(id);
        for (let handle of handlers) {
            handle(id, buf);
        }
    }
}
