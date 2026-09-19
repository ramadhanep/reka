import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import fastifyCookie from '@fastify/cookie'
import { API_PREFIX } from '@reka/contracts'
import { getConfig } from '@reka/config'
import { AppModule } from './app.module.js'
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js'

async function bootstrap(): Promise<void> {
  const config = getConfig()
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  )
  // fastify-cookie augments the Fastify instance type; cast to the register signature
  await app.register(fastifyCookie as unknown as Parameters<NestFastifyApplication['register']>[0])
  app.setGlobalPrefix(API_PREFIX)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  app.useGlobalFilters(new HttpExceptionFilter())
  app.enableCors({ origin: 'http://localhost:3000', credentials: true })
  app.enableShutdownHooks()
  await app.listen(config.apiPort, '0.0.0.0')
  console.log(`REKA API listening on port ${config.apiPort} (prefix ${API_PREFIX})`)
}

void bootstrap()
