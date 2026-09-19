import { describe, expect, it } from 'vitest'
import { appName } from './app-info.ts'

describe('appInfo', () => {
  it('exposes the application name', () => {
    expect(appName).toBe('REKA')
  })
})
