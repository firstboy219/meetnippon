import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { runWithTenant } from '../tenant/tenant-context';

interface SocketCtx { userId: string; tenantId: string; role: string; }

/**
 * Real-time chat transport. Authenticates the Socket.IO handshake with the same
 * access token, then relays messages to conversation rooms. Each handler runs
 * inside the tenant AsyncLocalStorage context so the Prisma isolation guard
 * applies exactly as it does on HTTP.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class ChatGateway implements OnGatewayConnection {
  private readonly logger = new Logger(ChatGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly chat: ChatService,
  ) {}

  private ctxOf(client: Socket): SocketCtx | null {
    return (client.data?.ctx as SocketCtx) ?? null;
  }

  handleConnection(client: Socket) {
    const token = (client.handshake.auth?.token || client.handshake.query?.token) as string | undefined;
    if (!token) return client.disconnect();
    try {
      const p: any = this.jwt.verify(token, { secret: this.config.get<string>('JWT_ACCESS_SECRET') });
      const ctx: SocketCtx = { userId: p.sub, tenantId: p.tenantId, role: p.role };
      client.data.ctx = ctx;
      client.join(`user:${ctx.userId}`);
      client.join(`tenant:${ctx.tenantId}`);
    } catch {
      client.disconnect();
    }
  }

  @SubscribeMessage('conversation:join')
  async onJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
    const ctx = this.ctxOf(client);
    if (!ctx) return { ok: false };
    try {
      await runWithTenant({ tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role }, () =>
        this.chat.getMessages(body.conversationId),
      );
      client.join(`conv:${body.conversationId}`);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage('message:send')
  async onSend(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string; body: string }) {
    const ctx = this.ctxOf(client);
    if (!ctx || !body?.body?.trim()) return { ok: false };
    const message = await runWithTenant({ tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role }, () =>
      this.chat.sendMessage(body.conversationId, body.body.trim()),
    );
    this.emitMessage(body.conversationId, message);
    return { ok: true, message };
  }

  /** Broadcast a message to a conversation room (also used by the REST path). */
  emitMessage(conversationId: string, message: unknown) {
    this.server?.to(`conv:${conversationId}`).emit('message:new', message);
  }
}
