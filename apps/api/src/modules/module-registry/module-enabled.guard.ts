import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ModuleRegistryService } from './module-registry.service.js'
import { REQUIRE_MODULE_KEY } from './require-module.decorator.js'

@Injectable()
export class ModuleEnabledGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly registry: ModuleRegistryService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredModule =
      this.reflector.get<string | undefined>(REQUIRE_MODULE_KEY, context.getHandler()) ??
      this.reflector.get<string | undefined>(REQUIRE_MODULE_KEY, context.getClass())

    if (!requiredModule) {
      return true
    }

    if (!this.registry.isEnabled(requiredModule)) {
      throw new NotFoundException(`Module '${requiredModule}' is disabled`)
    }

    return true
  }
}
