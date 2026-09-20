import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export interface StorageProvider {
  readonly kind: 'local' | 's3-compatible'
  put(key: string, data: Uint8Array | string): Promise<void>
  get(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
  getPresignedUrl?(key: string, expiresIn?: number): Promise<string>
}

export class LocalFilesystemStorage implements StorageProvider {
  readonly kind = 'local' as const

  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    return join(this.root, key)
  }

  async put(key: string, data: Uint8Array | string): Promise<void> {
    const path = this.resolve(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, data)
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key))
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true })
  }
}

export interface S3CompatibleStorageConfig {
  endpoint: string
  bucket: string
  region?: string
  accessKey: string
  secretKey: string
  forcePathStyle?: boolean
}

export class S3CompatibleStorage implements StorageProvider {
  readonly kind = 's3-compatible' as const
  private readonly client: S3Client
  private readonly bucket: string

  constructor(config: S3CompatibleStorageConfig) {
    this.bucket = config.bucket
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region ?? 'auto',
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: config.forcePathStyle ?? false,
    })
  }

  async put(key: string, data: Uint8Array | string): Promise<void> {
    const body = typeof data === 'string' ? Buffer.from(data) : data
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
      }),
    )
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    )
    if (!response.Body) {
      throw new Error(`Object not found: ${key}`)
    }
    const chunks: Uint8Array[] = []
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    )
  }

  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })
    return getSignedUrl(this.client, command, { expiresIn })
  }
}

export function createStorageProvider(config: {
  provider: 'local'
  root: string
}): LocalFilesystemStorage
export function createStorageProvider(
  config: { provider: 's3-compatible' } & S3CompatibleStorageConfig,
): S3CompatibleStorage
export function createStorageProvider(
  config:
    | { provider: 'local'; root: string }
    | ({ provider: 's3-compatible' } & S3CompatibleStorageConfig),
): StorageProvider {
  if (config.provider === 'local') {
    return new LocalFilesystemStorage(config.root)
  }
  return new S3CompatibleStorage(config)
}
