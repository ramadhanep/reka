import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { API_PREFIX } from '@reka/contracts'
import { getConfig } from '@reka/config'
import { AppModule } from './app.module.js'

async function bootstrap(): Promise<void> {
  const config = getConfig()
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  )
  app.setGlobalPrefix(API_PREFIX)
  app.enableShutdownHooks()
  await app.listen(config.apiPort, '0.0.0.0')
  console.log(`REKA API listening on port ${config.apiPort} (prefix ${API_PREFIX})`)
}

void bootstrap()
