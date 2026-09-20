import { Injectable, Logger } from '@nestjs/common'

export interface WorkflowTransitionEventPayload {
  instanceId: string
  organizationId: string
  workflowDefinitionId: string
  subjectType: string
  subjectId: string
  transitionKey: string
  fromStateKey: string
  toStateKey: string
  actorId: string
  comment?: string | null
  occurredAt: Date
  metadata?: Record<string, unknown>
}

export type WorkflowTransitionListener = (
  event: WorkflowTransitionEventPayload,
) => void | Promise<void>

@Injectable()
export class WorkflowNotificationHook {
  private readonly logger = new Logger(WorkflowNotificationHook.name)
  private readonly listeners: Set<WorkflowTransitionListener> = new Set()

  subscribe(listener: WorkflowTransitionListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async emitTransition(payload: WorkflowTransitionEventPayload): Promise<void> {
    this.logger.debug(
      `Workflow transition executed event: ${payload.transitionKey} (${payload.fromStateKey} -> ${payload.toStateKey}) for instance ${payload.instanceId}`,
    )

    const promises = Array.from(this.listeners).map(async (listener) => {
      try {
        await listener(payload)
      } catch (err) {
        this.logger.error(`Error in workflow notification listener: ${err}`)
      }
    })

    await Promise.allSettled(promises)
  }
}
