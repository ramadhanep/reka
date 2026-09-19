import { SetMetadata } from '@nestjs/common'

export const REQUIRE_MODULE_KEY = 'REQUIRE_MODULE_KEY'

export function RequireModule(moduleId: string): MethodDecorator & ClassDecorator {
  return SetMetadata(REQUIRE_MODULE_KEY, moduleId)
}
