import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import {
  WS_EVENTS,
  SessionStatusPayload,
  TargetStatusPayload,
  ScenePayload,
} from './events';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/live' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage(WS_EVENTS.SUBSCRIBE_SESSION)
  subscribeSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): void {
    void client.join(`session:${payload.sessionId}`);
    this.logger.log(`Client ${client.id} subscribed to session ${payload.sessionId}`);
  }

  @SubscribeMessage(WS_EVENTS.UNSUBSCRIBE_SESSION)
  unsubscribeSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string },
  ): void {
    void client.leave(`session:${payload.sessionId}`);
  }

  emitSessionStatus(payload: SessionStatusPayload): void {
    this.server
      .to(`session:${payload.sessionId}`)
      .emit(WS_EVENTS.SESSION_STATUS, payload);
  }

  emitTargetStatus(payload: TargetStatusPayload): void {
    this.server
      .to(`session:${payload.sessionId}`)
      .emit(WS_EVENTS.TARGET_STATUS, payload);
  }

  emitSceneUpdate(payload: ScenePayload): void {
    this.server
      .to(`session:${payload.sessionId}`)
      .emit(WS_EVENTS.SCENE_UPDATE, payload);
  }

  broadcastToAgency(agencyId: string, event: string, payload: unknown): void {
    this.server.to(`agency:${agencyId}`).emit(event, payload);
  }
}
