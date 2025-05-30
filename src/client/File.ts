import Tree from "./Tree";
import { EventEmitter } from "events";
import * as util from "../protocol/util";
import StatusCode from "../protocol/smb2/StatusCode";
import PacketType from "../protocol/smb2/PacketType";
import FileAttribute from "../protocol/smb2/FileAttribute";
import ShareAccessType from "../protocol/smb2/ShareAccessType";
import { CreateOptions } from "../protocol/smb2/packets/Create";
import CreateDispositionType from "../protocol/smb2/CreateDispositionType";
import FilePipePrinterAccess from "../protocol/smb2/FilePipePrinterAccess";
import { FileInfoClass, InfoType } from "../protocol/smb2/packets/SetInfo";
import { Readable } from "stream";
import { FileWriteStream } from "./stream/FileWriteStream";

const maxReadChunkLength = 0x00010000;
const maxWriteChunkLength = 0x00010000 - 0x71;

interface OpenOptions {
  desiredAccess?: FilePipePrinterAccess;
  createDisposition?: CreateDispositionType;
  createOptions?: CreateOptions;
}

interface File {
  on(event: "open" | "close", callback: (file: File) => void): this;

  once(event: "open" | "close", callback: (file: File) => void): this;
}

class File extends EventEmitter {
  _id: Buffer;
  isOpen: boolean;
  fileSize: bigint;

  constructor(
    private tree: Tree
  ) {
    super();
  }

  async open(path: string, options: OpenOptions = {}) {
    if (this.isOpen) return;

    const buffer = Buffer.from(util.toWindowsFilePath(path), "ucs2");
    const response = await this.tree.request({ type: PacketType.Create }, {
      buffer,
      desiredAccess: typeof options.desiredAccess === "number" ?
        options.desiredAccess :
        FilePipePrinterAccess.ReadData,
      fileAttributes: FileAttribute.Normal,
      shareAccess:
        ShareAccessType.Read |
        ShareAccessType.Write |
        ShareAccessType.Delete,
      createDisposition: typeof options.createDisposition === "number" ?
        options.createDisposition :
        CreateDispositionType.Open,
      createOptions: typeof options.createDisposition === "number" ?
        options.createDisposition :
        CreateOptions.None,
      nameOffset: 0x0078,
      createContextsOffset: 0x007a + buffer.length
    });

    this._id = response.body.fileId as Buffer;
    this.fileSize = response.body.endOfFile as bigint;
    this.isOpen = true;

    this.emit("open", this);
  }

  async create(path: string) {
    await this.open(path, {
      desiredAccess: FilePipePrinterAccess.WriteData,
      createDisposition: CreateDispositionType.Create
    });
  }

  async remove() {
    const buffer = Buffer.alloc(1);
    buffer.writeUInt8(1, 0);

    await this.setInfo(FileInfoClass.DispositionInformation, buffer);
  }

  async rename(newPath: string) {
    const newPathUCS2 = Buffer.from(newPath, "ucs2");
    const buffer = Buffer.alloc(1 + 7 + 8 + 4 + newPathUCS2.length);

    buffer.fill(0x00);
    buffer.writeUInt8(1, 0);
    buffer.writeUInt32LE(newPathUCS2.length, 16);
    buffer.fill(newPathUCS2, 20);

    await this.setInfo(FileInfoClass.RenameInformation, buffer);
  }

  async setSize(size: bigint) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64LE(size);

    await this.setInfo(FileInfoClass.EndOfFileInformation, buffer);
  }

  async setInfo(fileInfoClass: number, buffer: Buffer) {
    await this.tree.request({ type: PacketType.SetInfo }, {
      infoType: InfoType.File,
      fileId: this._id,
      fileInfoClass,
      buffer
    });
  }

  private async writeChunk(offset: number, chunk: Buffer) {

      const offsetBuffer = Buffer.alloc(8);
      offsetBuffer.writeBigUInt64LE(BigInt(offset));

      await this.tree.request({ type: PacketType.Write }, {
        fileId: this._id,
        buffer: chunk,
        offset: offsetBuffer
      });
  }

  async write(content: Buffer | string) {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const chunkCount = Math.ceil(buffer.length / maxWriteChunkLength);

    for (let index = 0; index < chunkCount; index++) {
      const offset = index * maxWriteChunkLength;
      const nextOffset = (index + 1) * maxWriteChunkLength;
      const length = nextOffset > buffer.length ? buffer.length - offset : nextOffset - offset;
      const chunk = buffer.slice(offset, offset + length);

      await this.writeChunk(offset, chunk);
    }
  }

  createWriteStream() {
    return new FileWriteStream(maxWriteChunkLength, this.writeChunk.bind(this));
  }

  private async readChunk(initial: number, offset: number) {
    const fileSize = Number(this.fileSize);
    const nextOffset = (initial + 1) * maxReadChunkLength;
    const length = nextOffset > fileSize ? fileSize - offset : nextOffset - offset;

    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeInt32LE(length, 0);

    const offsetBuffer = Buffer.alloc(8);
    offsetBuffer.writeBigUInt64LE(BigInt(offset));

    const response = await this.tree.request({ type: PacketType.Read }, {
      fileId: this._id,
      length: lengthBuffer,
      offset: offsetBuffer
    });

    return response.body.buffer as Buffer;
  }

  async read() {
    const fileSize = Number(this.fileSize);
    const chunkCount = Math.ceil(fileSize / maxReadChunkLength);

    const buffer = Buffer.alloc(fileSize);
    for (let index = 0; index < chunkCount; index++) {
      const offset = index * maxReadChunkLength;
      ((await this.readChunk(index, offset)) as Buffer).copy(buffer, offset);
    }

    return buffer;
  }

  createReadStream() {
    const fileSize = Number(this.fileSize);
    return Readable.from(async function* read() {
      const chunkCount = Math.ceil(fileSize / maxReadChunkLength);

      for (let index = 0; index < chunkCount; index++) {
        const offset = index * maxReadChunkLength;
        yield ((await this.readChunk(index, offset)) as Buffer);
      }
    }.bind(this)());
  }

  async exists(path: string) {
    try {
      await this.open(path);
    } catch (err) {
      if (
        err.header.status === StatusCode.FileNameNotFound ||
        err.header.status === StatusCode.FilePathNotFound
      ) {
        return false;
      }
      throw err;
    }

    return true;
  }

  async close() {
    if (!this.isOpen) return;
    this.isOpen = false;

    await this.tree.request({ type: PacketType.Close }, { fileId: this._id });

    this.emit("close", this);
  }
}

export default File;