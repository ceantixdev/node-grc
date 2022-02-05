export type PacketHandler = (id: number, packet: Buffer) => void;

export class PacketTable {
    static readonly ALL_HANDLER = -1;
    static readonly DEFAULT_HANDLER = -2;

    private handlers: PacketHandler[][] = [];

    public getCallbacks(id: number): PacketHandler[] {
        let callbacks = (this.handlers[PacketTable.ALL_HANDLER] || []).concat(this.handlers[id] || []);
        if (callbacks.length == 0)
            callbacks = this.handlers[PacketTable.DEFAULT_HANDLER] || callbacks;

        return callbacks;
    }

    public setCatchAll(callback: PacketHandler) {
        this.on(-1, callback);
    }

    public setDefault(callback: PacketHandler) {
        this.on(-2, callback);
    }

    public on(id: number, callback: PacketHandler) {
        if (!(id in this.handlers))
            this.handlers[id] = [];

        this.handlers[id].push(callback);
    }
}
