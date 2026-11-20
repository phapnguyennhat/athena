import { Logger, type OnModuleInit } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, type OnGatewayConnection } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { AiJobsService, toJobView } from '../ai-jobs/ai-jobs.service.js';
import { JwtAuth } from '../auth/jwt.auth.js';

/**
 * Pushes job status to the job owner's sockets. Auth is the access token in `handshake.auth.token`, checked once
 * at connect. No message handlers, so the global auth guard never runs here.
 */
@WebSocketGateway({ namespace: '/events', cors: { origin: true }, transports: ['websocket'] })
export class EventsGateway implements OnGatewayConnection, OnModuleInit {
  private readonly log = new Logger(EventsGateway.name);
  @WebSocketServer() private readonly server!: Namespace;

  constructor(
    private readonly jwt: JwtAuth,
    private readonly aiJobs: AiJobsService,
  ) {}

  onModuleInit() {
    this.aiJobs.onStatusChange = (job) => {
      const { id: jobId, ...rest } = toJobView(job);
      this.server.to(`user:${job.userId}`).emit('job.updated', { jobId, ...rest });
    };
  }

  // Nest drops this promise, so it must never reject.
  async handleConnection(client: Socket) {
    const token: unknown = client.handshake.auth?.token;
    const user = typeof token === 'string' && token ? await this.jwt.verifyAccessToken(token) : null;
    if (!user) {
      client.emit('auth_error');
      client.disconnect(true);
      return;
    }
    await Promise.resolve(client.join(`user:${user.id}`)).catch((e: unknown) => {
      this.log.error(`join failed: ${String(e)}`);
      client.disconnect(true);
    });
  }
}
