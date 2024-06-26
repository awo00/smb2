import Header from "./Header";
import Packet from "./Packet";
import ProtocolRequest from "../Request";

export default class Request extends ProtocolRequest<Header> {
  typeName: string;
  data: any;

  constructor(header: Header, body?: any) {
    super(header, body);

    this.typeName = Packet.getPacketTypeName(this.header.type);
    const packet = Packet.getPacketByPacketType(this.header.type);
    if (Buffer.isBuffer(this.body.buffer) && packet.parseRequestBuffer) {
      this.data = packet.parseRequestBuffer(this.body.buffer);
    }
  }

  static parse(buffer: Buffer) {
    const { header, body } = Packet.parse(buffer);
    return new Request(header, body);
  }

  serialize() {
    return Packet.serialize(this.header, this.body);
  }
}