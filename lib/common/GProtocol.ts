import zlib = require('zlib');

// @ts-ignore
import compressjs = require('compressjs');

export enum ProtocolGen {
	Gen1 = 0,
	Gen2 = 1,
	Gen3 = 2,
	Gen4 = 3,
	Gen5 = 4
}

enum CompressionType {
	NONE = 0x02,
	ZLIB = 0x04,
	BZ2 = 0x06
}

enum Direction {
	Outgoing = 0,
	Incoming = 1
}

const start_iterator = [0, 0, 0x04A80B38, 0x4A80B38, 0x4A80B38, 0];

function getIteratorLimit(compressionType: CompressionType) : number {
	return compressionType == CompressionType.NONE ? 0x0C : 0x04;
}

export class GProtocol
{
	key: number = 0
	iterator: Uint32Array = new Uint32Array(2)
	gen: ProtocolGen = ProtocolGen.Gen1
	
	public static generateKey(): number {
		return Math.floor(Math.random() * 128);
	}
	
	public static initialize(gen: ProtocolGen, key?: number) : GProtocol {
		key = key || GProtocol.generateKey();
		return new GProtocol(gen, key);
	}

	protected constructor(gen: ProtocolGen, key: number) {
		this.key = key;
		this.gen = gen;
		this.iterator[0] = this.iterator[1] = start_iterator[gen];
	}

	apply(compressionType: CompressionType, dir: Direction, buf: Buffer)
	{
		let limit = getIteratorLimit(compressionType);

		for (let i = 0; i < buf.length; i++)
		{
			if (i % 4 == 0)
			{
				if (limit <= 0)
					break;

				limit -= 1;

				this.iterator[dir] = Math.imul(this.iterator[dir], 0x8088405) + this.key;
			}

			buf[i] ^= (this.iterator[dir] >> ((i % 4) * 8)) & 0xFF;
		}
	}

	decrypt(buf: Buffer): Buffer
	{
		switch (this.gen)
		{
			case ProtocolGen.Gen1:
				return buf;

			case ProtocolGen.Gen2:
				return zlib.inflateSync(buf);

			case ProtocolGen.Gen3:
			{
				buf = zlib.inflateSync(buf);

				this.iterator[Direction.Incoming] *= 0x8088405;
				this.iterator[Direction.Incoming] += this.key;
				let removePos = (this.iterator[Direction.Incoming] & 0x0FFFF) % buf.length;

				let newBuf = Buffer.allocUnsafe(buf.length - 1);
				buf.copy(newBuf, 0, 0, removePos);
				buf.copy(newBuf, removePos + 1, removePos + 1);
				return buf;
			}

			case ProtocolGen.Gen4:
			case ProtocolGen.Gen5:
			{
				let compressionType = CompressionType.BZ2;
				if (this.gen == ProtocolGen.Gen5)
					compressionType = buf.readUInt8();

				this.apply(compressionType, Direction.Incoming, buf.slice(1));

				switch (compressionType)
				{
					case CompressionType.NONE:
						buf = buf.slice(1);
						break;

					case CompressionType.ZLIB:
						buf = zlib.inflateSync(buf.slice(1));
						break;

					case CompressionType.BZ2:
						buf = Buffer.from(compressjs.Bzip2.decompressFile(buf.slice(1)));
						break;
				}

				return buf;
			}
		}
	}

	encrypt(buf: Buffer): Buffer
	{
		switch (this.gen)
		{
			case ProtocolGen.Gen1:
				return buf;

			case ProtocolGen.Gen2:
				return zlib.deflateSync(buf);
			
			case ProtocolGen.Gen3:
				buf = zlib.deflateSync(buf);
				this.iterator[Direction.Outgoing] *= 0x8088405;
				this.iterator[Direction.Outgoing] += this.key;
				let removePos = (this.iterator[Direction.Outgoing] & 0x0FFFF) % buf.length;

				let newBuf = Buffer.allocUnsafe(buf.length - 1);
				buf.copy(newBuf, 0, 0, removePos);
				buf.copy(newBuf, removePos + 1, removePos + 1);
				return buf;

			case ProtocolGen.Gen4:
			case ProtocolGen.Gen5:
			{
				let compressionType = CompressionType.BZ2;

				// Forcing zlib over bz2 due to the bz2 implementation being coded in
				// javascript rather than a native node module. 
				if (this.gen == ProtocolGen.Gen5)
					compressionType = CompressionType.ZLIB;

				switch (compressionType)
				{
					case CompressionType.ZLIB:
						buf = zlib.deflateSync(buf);
						break;

					case CompressionType.BZ2:
						buf = compressjs.Bzip2.compressFile(buf)
						break;
				}

				this.apply(compressionType, Direction.Outgoing, buf);

				return Buffer.concat([Buffer.from([compressionType]), buf]);
			}
		}
	}
}
