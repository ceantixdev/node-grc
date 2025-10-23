const DEFAULT_BUFFER_SIZE = 32

function decodeBits(b: Buffer)
{
    let res = 0;
    for (let i = 0; i < b.length; i++)
    {
        res <<= 7;
        res |= (b[i] - 32);
    }

    return res;
}

function encodeBits(v: number, b: number[])
{
    for (let i = b.length; i > 0; i--)
    {
        b[i - 1] = (v & 0x7f) + 32;
        v >>= 7;
    }
}

/**
 * Creates a BufferReader over an existing buffer, does not copy the buffer
 * 
 * Allows easily reading packets
 */
export class GBufferReader
{
    private buffer: Buffer
    private readPosition: number = 0

    public static from(buf: Buffer): GBufferReader {
        return new GBufferReader(buf);
    }

    protected constructor(buf: Buffer) {
        this.buffer = buf;
    }

    public get bytesLeft(): number {
        return Math.max(0, this.buffer.length - this.readPosition);
    }

    public reset(): void {
        this.readPosition = 0;
    }
    
    public seek(idx: number): void {
        this.readPosition = Math.min(this.buffer.length, Math.max(0, idx));
    }

    public readInt8(): number {
        let res = this.buffer.readInt8(this.readPosition);
        this.readPosition += 1;
        return res;
    }

    public readUInt8(): number {
        let res = this.buffer.readUInt8(this.readPosition);
        this.readPosition += 1;
        return res;
    }

    public readUInt16BE(): number {
        let res = this.buffer.readUInt16BE(this.readPosition);
        this.readPosition += 2;
        return res;
    }

    public readGUInt8(): number {
        let res = decodeBits(this.buffer.slice(this.readPosition, this.readPosition + 1));
        // let res = this.buffer.readUInt8(this.readPosition) - 32;
        this.readPosition += 1;
        return res;
    }

    public readGUInt16(): number {
        let res = decodeBits(this.buffer.slice(this.readPosition, this.readPosition + 2));
        this.readPosition += 2;
        return res;
    }

    public readGUInt24(): number {
        let res = decodeBits(this.buffer.slice(this.readPosition, this.readPosition + 3));
        this.readPosition += 3;
        return res;
    }

    public readGUInt32(): number {
        let res = decodeBits(this.buffer.slice(this.readPosition, this.readPosition + 4));
        this.readPosition += 4;
        return res;
    }

    public readGULong(): number {
        let res = decodeBits(this.buffer.slice(this.readPosition, this.readPosition + 5));
        this.readPosition += 5;
        return res;
    }

    public read(len: number): Buffer {
        const newReadPosition = Math.min(this.buffer.length, this.readPosition + len);
        let res = this.buffer.slice(this.readPosition, newReadPosition);
        this.readPosition = newReadPosition;
        return res;
    }

    public readChars(len: number): string {
        return this.read(len).toString("latin1");
    }

    public readGBuffer(len?: number): GBufferReader {
        if (!len) {
            len = this.readGUInt8();
        }
        
        return new GBufferReader(this.read(len));
    }

    public readGString(): string {
        return this.readChars(this.readGUInt8());
    }
}

/**
 * Dynamically-allocated buffer, used for writing packet data
 */
export class GBufferWriter
{
    private internalBuffer: Buffer
    private writePosition: number

    constructor(capacity: number) {
        this.internalBuffer = Buffer.allocUnsafe(capacity)
        this.writePosition = 0;
    }

    public static create(capacity: number = DEFAULT_BUFFER_SIZE): GBufferWriter {
        return new GBufferWriter(capacity);
    }

    public get buffer(): Buffer {
        return this.internalBuffer.slice(0, this.writePosition);
    }

    public get capacity(): number {
        return this.internalBuffer.length
    }

    public get length(): number {
        return this.writePosition;
    }

    public clear() {
        this.writePosition = 0;
    }

    public writeEnd(): void {
        if (this.length + 1 >= this.capacity)
        this.resize();

        this.internalBuffer.writeUInt8(0x0a, this.writePosition);
        this.writePosition += 1;
    }

    public resize(minimum?: number): boolean {
        minimum = minimum || this.internalBuffer.length;
        if (minimum < this.internalBuffer.length)
            return false;

        minimum *= 2;

        let newbuf = Buffer.allocUnsafe(minimum);
        newbuf.set(this.internalBuffer);
        this.internalBuffer = newbuf;
        return true;
    }

    public writeBuffer(buf: Buffer): void {
        const newSize = this.length + buf.length;
        if (newSize >= this.capacity)
            this.resize(newSize);

        this.internalBuffer.set(buf, this.writePosition);
        this.writePosition = newSize;
    }

    public writeChars(buf: string): void {
        const newSize = this.length + buf.length;
        if (newSize >= this.capacity)
            this.resize(newSize);

        this.internalBuffer.write(buf, this.writePosition, "latin1");
        this.writePosition = newSize;
    }

    public writeUInt8(v: number): void {
        if (this.length + 1 >= this.capacity)
            this.resize();

        this.internalBuffer.writeUInt8(v, this.writePosition);
        this.writePosition += 1;
    }

    public writeGUInt8(v: number): void {
        if (this.length + 1 >= this.capacity)
            this.resize();

        let b = [0]
        encodeBits(Math.min(v, 223), b);

        for (let i = 0; i < b.length; i++)
            this.internalBuffer.writeUInt8(b[i], this.writePosition + i);
        this.writePosition += b.length;

        // v = Math.min(v, 223);
        // this.internalBuffer.writeUInt8(v + 32, this.writePosition);
        // this.writePosition += 1;
    }

    public writeGUInt16(v: number): void {
        if (this.length + 2 >= this.capacity)
            this.resize();
    
        let b = [0, 0]
        encodeBits(Math.min(v, 28767), b);

        for (let i = 0; i < b.length; i++)
            this.internalBuffer.writeUInt8(b[i], this.writePosition + i);
        this.writePosition += b.length;
    }

    public writeGUInt24(v: number): void {
        if (this.length + 3 >= this.capacity)
            this.resize();
    
        let b = [0, 0, 0]
        encodeBits(Math.min(v, 3682399), b);

        for (let i = 0; i < b.length; i++)
            this.internalBuffer.writeUInt8(b[i], this.writePosition + i);
        this.writePosition += b.length;
    }

    public writeGUInt32(v: number): void {
        if (this.length + 4 >= this.capacity)
            this.resize();
    
        let b = [0, 0, 0, 0]
        encodeBits(Math.min(v, 471347295), b);

        for (let i = 0; i < b.length; i++)
            this.internalBuffer.writeUInt8(b[i], this.writePosition + i);
        this.writePosition += b.length;
    }

    public writeGULong(v: number): void {
        if (this.length + 5 >= this.capacity)
            this.resize();
    
        let b = [0, 0, 0, 0, 0]
        encodeBits(Math.min(v, 0xFFFFFFFF), b);

        for (let i = 0; i < b.length; i++)
            this.internalBuffer.writeUInt8(b[i], this.writePosition + i);
        this.writePosition += b.length;
    }

    public writeGString(str: string) {
        this.writeGUInt8(str.length);
        this.writeChars(str);
    }
}
