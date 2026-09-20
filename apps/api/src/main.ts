import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import fastifyCookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import { API_PREFIX } from '@reka/contracts'
import { getConfig } from '@reka/config'
import { AppModule } from './app.module.js'
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js'
import { createPinoLogger, StructuredLogger } from './common/logger.js'
import { setupOpenApi } from './common/openapi.js'

const BODY_LIMIT_BYTES = 1_048_576

async function bootstrap(): Promise<void> {
  const config = getConfig()
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: {
        level: config.logLevel,
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie', 'authorization', 'cookie'],
          censor: '[REDACTED]',
        },
      },
      bodyLimit: BODY_LIMIT_BYTES,
    }),
  )
  await app.register(fastifyCookie as unknown as Parameters<NestFastifyApplication['register']>[0])
  await app.register(helmet as unknown as Parameters<NestFastifyApplication['register']>[0], {
    crossOriginEmbedderPolicy: false,
  })
  app.setGlobalPrefix(API_PREFIX)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  app.useGlobalFilters(new HttpExceptionFilter())
  app.useLogger(new StructuredLogger(createPinoLogger(config.logLevel)))
  app.enableCors({ origin: config.corsOrigins, credentials: true })
  if (config.openapiEnabled && config.env !== 'test') {
    setupOpenApi(app)
  }
  app.enableShutdownHooks()
  await app.listen(config.apiPort, '0.0.0.0')
  const pino = createPinoLogger(config.logLevel)
  pino.info({ port: config.apiPort, prefix: API_PREFIX }, 'reka api started')
}

void bootstrap()
