import { Controller, Get, Res } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import {
  HealthService,
  type HealthStatus,
  type LiveHealth,
  type ReadyHealth,
} from './health.service.js'

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  status(): Promise<HealthStatus> {
    return this.healthService.status()
  }

  @Get('live')
  live(): Promise<LiveHealth> {
    return this.healthService.live()
  }

  @Get('ready')
  async ready(
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ReadyHealth | { status: 'not_ready'; database: 'down' }> {
    const result = await this.healthService.ready()
    if (result.database !== 'up') {
      reply.status(503)
      return { status: 'not_ready', database: 'down' }
    }
    return result
  }
}
