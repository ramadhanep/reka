import type { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger'
import { API_MAJOR_VERSION, API_PREFIX } from '@reka/contracts'

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('REKA API')
    .setDescription(
      'REKA business operating platform REST API. All endpoints are versioned ' +
        `under /api/v${API_MAJOR_VERSION} and protected by a session cookie ` +
        '(reka_session) plus organization-scoped permissions.',
    )
    .setVersion(`${API_MAJOR_VERSION}.0.0`)
    .addCookieAuth('reka_session', { type: 'http', scheme: 'cookie' })
    .addServer(API_PREFIX)
    .build()
  // Swagger already reflects the application's global prefix into the paths.
  return SwaggerModule.createDocument(app, config)
}

export function setupOpenApi(app: INestApplication, path = 'docs'): void {
  const document = buildOpenApiDocument(app)
  SwaggerModule.setup(path, app, document, { jsonDocumentUrl: 'docs-json' })
}
