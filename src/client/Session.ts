import Tree from "./Tree";
import Client from "./Client";
import { EventEmitter } from "events";
import Dialect from "../protocol/smb2/Dialect";
import Header from "../protocol/smb2/Header";
import * as util from "../protocol/util";
import * as ntlmUtil from "../protocol/ntlm/util";
import PacketType from "../protocol/smb2/PacketType";

export interface AuthenticateOptions {
  domain: string;
  username: string;
  password: string;
}

interface Session {
  on(event: "authenticate" | "logoff", callback: (session: Session) => void): this;

  once(event: "authenticate" | "logoff", callback: (session: Session) => void): this;
}

class Session extends EventEmitter {
  _id: string;
  authenticated: boolean = false;

  connectedTrees: Tree[] = [];

  constructor(
    public client: Client
  ) {
    super();
  }

  async connectTree(path: string) {
    const tree = new Tree(this);
    this.registerTree(tree);
    await tree.connect(path);

    return tree;
  }

  createRequest(header: Header = {}, body: any = {}) {
    return this.client.createRequest({
      sessionId: this._id,
      ...header
    }, body);
  }

  async request(header: Header = {}, body: any = {}) {
    return await this.client.request(
      {
        sessionId: this._id,
        ...header
      },
      body
    );
  }

  async authenticate(options: AuthenticateOptions) {
    if (this.authenticated) return;

    await this.request({
      type: PacketType.Negotiate
    }, {
      dialects: [
        Dialect.Smb202,
        Dialect.Smb210
      ],
      clientGuid: util.generateGuid()
    });
    const sessionSetupResponse = await this.request(
      { type: PacketType.SessionSetup },
      { buffer: ntlmUtil.encodeNegotiationMessage(this.client.host, options.domain) }
    );
    this._id = sessionSetupResponse.header.sessionId;

    const nonce = ntlmUtil.decodeChallengeMessage(sessionSetupResponse.body.buffer as Buffer);
    await this.request(
      { type: PacketType.SessionSetup },
      {
        buffer: ntlmUtil.encodeAuthenticationMessage(
          options.username,
          this.client.host,
          options.domain,
          nonce,
          options.password
        )
      }
    );

    this.authenticated = true;

    this.emit("authenticate", this);
  }

  private registerTree(tree: Tree) {
    tree
      .once("connect", () => this.connectedTrees.push(tree))
      .once("disconnect", () => this.connectedTrees.splice(this.connectedTrees.indexOf(tree), 1));
  }

  async logoff() {
    if (!this.authenticated) return;
    this.authenticated = false;

    await Promise.all(this.connectedTrees.map(x => x.disconnect()));

    await this.request({ type: PacketType.LogOff });
    delete this._id;

    this.emit("logoff", this);
  }
}

export default Session;
