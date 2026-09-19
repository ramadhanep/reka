import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface StorageProvider {
  readonly kind: 'local' | 's3-compatible'
  put(key: string, data: Uint8Array | string): Promise<void>
  get(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
}

export class LocalFilesystemStorage implements StorageProvider {
  readonly kind = 'local'

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
