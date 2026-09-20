import { describe, expect, it } from 'vitest'
import {
  WorkflowNotificationHook,
  type WorkflowTransitionEventPayload,
} from './workflow-notification.hook.js'

describe('WorkflowNotificationHook', () => {
  it('notifies subscribed listeners on transition execution', async () => {
    const hook = new WorkflowNotificationHook()
    const received: WorkflowTransitionEventPayload[] = []

    const unsubscribe = hook.subscribe((event) => {
      received.push(event)
    })

    const payload: WorkflowTransitionEventPayload = {
      instanceId: 'inst-1',
      organizationId: 'org-1',
      workflowDefinitionId: 'def-1',
      subjectType: 'purchase_request',
      subjectId: 'PR-100',
      transitionKey: 'submit',
      fromStateKey: 'draft',
      toStateKey: 'submitted',
      actorId: 'user-1',
      occurredAt: new Date(),
    }

    await hook.emitTransition(payload)

    expect(received).toHaveLength(1)
    expect(received[0].transitionKey).toBe('submit')
    expect(received[0].fromStateKey).toBe('draft')
    expect(received[0].toStateKey).toBe('submitted')

    // Unsubscribe
    unsubscribe()
    await hook.emitTransition(payload)
    expect(received).toHaveLength(1)
  })

  it('tolerates listener failures without interrupting other listeners or failing emit', async () => {
    const hook = new WorkflowNotificationHook()
    let healthyCalled = false

    hook.subscribe(() => {
      throw new Error('Failing listener')
    })

    hook.subscribe(() => {
      healthyCalled = true
    })

    await expect(
      hook.emitTransition({
        instanceId: 'inst-1',
        organizationId: 'org-1',
        workflowDefinitionId: 'def-1',
        subjectType: 'expense',
        subjectId: 'EXP-1',
        transitionKey: 'approve',
        fromStateKey: 'submitted',
        toStateKey: 'approved',
        actorId: 'user-1',
        occurredAt: new Date(),
      }),
    ).resolves.not.toThrow()

    expect(healthyCalled).toBe(true)
  })
})
