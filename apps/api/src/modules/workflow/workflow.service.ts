import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  WorkflowDefinitionStatus,
  WorkflowDefinitionSummary,
  WorkflowInstanceSummary,
  WorkflowStateSummary,
  WorkflowTransitionHistorySummary,
  WorkflowTransitionSummary,
} from '@reka/contracts'
import type { Database, Db } from '@reka/database'
import { DATABASE } from '../../common/database.token.js'
import { AccessService } from '../access/access.service.js'
import { AuditService } from '../audit/audit.service.js'
import { findMemberByOrgAndUser } from '../organization/member.repo.js'
import { WorkflowNotificationHook } from './workflow-notification.hook.js'
import type {
  WorkflowInstanceRow,
  WorkflowStateRow,
  WorkflowTransitionRow,
} from './workflow.schema.js'
import {
  validateWorkflowDefinitionGraph,
  type StateDraftInput,
  type TransitionDraftInput,
} from './workflow-validator.js'
import {
  createTransitionHistory,
  createWorkflowDefinition,
  createWorkflowInstance,
  createWorkflowStates,
  createWorkflowTransitions,
  findLatestActiveDefinitionByKey,
  findStateById,
  findStatesByDefinitionId,
  findTransitionByKeyAndFromState,
  findTransitionHistoryByInstanceId,
  findTransitionsByDefinitionId,
  findTransitionsFromState,
  findWorkflowDefinitionById,
  findWorkflowDefinitions,
  findWorkflowInstanceById,
  findWorkflowInstanceForUpdate,
  getDefinitionMaxVersion,
  updateWorkflowDefinition,
  updateWorkflowInstance,
} from './workflow.repo.js'

export interface CreateWorkflowDefinitionDto {
  key: string
  name: string
  description?: string | null
  states: StateDraftInput[]
  transitions: TransitionDraftInput[]
}

export interface UpdateWorkflowDefinitionDto {
  name?: string
  description?: string | null
  status?: WorkflowDefinitionStatus
  states?: StateDraftInput[]
  transitions?: TransitionDraftInput[]
}

export interface CreateWorkflowInstanceDto {
  workflowDefinitionId?: string
  workflowDefinitionKey?: string
  subjectType: string
  subjectId: string
}

export interface ExecuteTransitionDto {
  comment?: string | null
  metadata?: Record<string, unknown>
}

@Injectable()
export class WorkflowService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly accessService: AccessService,
    private readonly auditService: AuditService,
    private readonly notificationHook: WorkflowNotificationHook,
  ) {}

  async createDefinition(
    input: CreateWorkflowDefinitionDto,
    actorId: string | null,
    organizationId?: string | null,
  ): Promise<WorkflowDefinitionSummary> {
    const trimmedKey = input.key?.trim().toLowerCase()
    if (!trimmedKey) {
      throw new BadRequestException('Workflow key is required')
    }
    if (!input.name?.trim()) {
      throw new BadRequestException('Workflow name is required')
    }

    validateWorkflowDefinitionGraph({
      states: input.states,
      transitions: input.transitions,
    })

    return this.database.db.transaction(async (tx) => {
      const maxVersion = await getDefinitionMaxVersion(tx, trimmedKey, organizationId)
      const version = maxVersion + 1

      const definition = await createWorkflowDefinition(tx, {
        organizationId: organizationId ?? null,
        key: trimmedKey,
        name: input.name.trim(),
        description: input.description ?? null,
        version,
        status: 'draft',
      })

      // Map of stateKey -> stateId
      const stateInserts = input.states.map((s) => ({
        workflowDefinitionId: definition.id,
        key: s.key.trim().toLowerCase(),
        name: s.name.trim(),
        isInitial: !!s.isInitial,
        isTerminal: !!s.isTerminal,
        metadata: s.metadata ?? {},
      }))

      const createdStates = await createWorkflowStates(tx, stateInserts)
      const stateMap = new Map<string, string>()
      for (const s of createdStates) {
        stateMap.set(s.key, s.id)
      }

      const transitionInserts = input.transitions.map((t) => {
        const fromKey = t.fromStateKey.trim().toLowerCase()
        const toKey = t.toStateKey.trim().toLowerCase()
        const fromStateId = stateMap.get(fromKey)
        const toStateId = stateMap.get(toKey)

        if (!fromStateId || !toStateId) {
          throw new BadRequestException(
            `Transition '${t.key}' specifies invalid state key: ${!fromStateId ? fromKey : toKey}`,
          )
        }

        return {
          workflowDefinitionId: definition.id,
          key: t.key.trim().toLowerCase(),
          name: t.name.trim(),
          fromStateId,
          toStateId,
          requiredPermission: t.requiredPermission ?? null,
          metadata: t.metadata ?? {},
        }
      })

      const createdTransitions = await createWorkflowTransitions(tx, transitionInserts)

      await this.auditService.record(
        {
          actorId,
          organizationId: organizationId ?? null,
          action: 'workflow.definition.created',
          resourceType: 'workflow_definition',
          resourceId: definition.id,
          metadata: {
            key: definition.key,
            version: definition.version,
            name: definition.name,
          },
        },
        tx,
      )

      return this.formatDefinitionSummary(definition, createdStates, createdTransitions)
    })
  }

  async getDefinition(
    id: string,
    organizationId?: string | null,
  ): Promise<WorkflowDefinitionSummary> {
    const definition = await findWorkflowDefinitionById(this.database.db, id)
    if (!definition) {
      throw new NotFoundException(`Workflow definition '${id}' not found`)
    }

    if (
      organizationId &&
      definition.organizationId &&
      definition.organizationId !== organizationId
    ) {
      throw new NotFoundException(`Workflow definition '${id}' not found`)
    }

    const states = await findStatesByDefinitionId(this.database.db, definition.id)
    const transitions = await findTransitionsByDefinitionId(this.database.db, definition.id)

    return this.formatDefinitionSummary(definition, states, transitions)
  }

  async listDefinitions(organizationId?: string | null): Promise<WorkflowDefinitionSummary[]> {
    const definitions = await findWorkflowDefinitions(this.database.db, organizationId)
    return definitions.map((d) => this.formatDefinitionSummary(d))
  }

  async updateDefinition(
    id: string,
    input: UpdateWorkflowDefinitionDto,
    actorId: string | null,
    organizationId?: string | null,
  ): Promise<WorkflowDefinitionSummary> {
    const definition = await findWorkflowDefinitionById(this.database.db, id)
    if (!definition) {
      throw new NotFoundException(`Workflow definition '${id}' not found`)
    }

    if (organizationId && definition.organizationId === null) {
      throw new ForbiddenException(
        'Cannot modify a system-wide workflow definition from an organization scope',
      )
    }

    if (
      organizationId &&
      definition.organizationId &&
      definition.organizationId !== organizationId
    ) {
      throw new ForbiddenException('Cannot modify workflow definition of another organization')
    }

    // Check if trying to edit states/transitions on non-draft definition
    const hasStatesOrTransitions = !!(input.states || input.transitions)
    if (hasStatesOrTransitions && definition.status !== 'draft') {
      throw new BadRequestException(
        `Cannot modify states or transitions on a '${definition.status}' workflow definition. Create a new version instead.`,
      )
    }

    return this.database.db.transaction(async (tx) => {
      // If status is transitioning to 'active', validate graph first
      if (input.status === 'active' && definition.status !== 'active') {
        const states = await findStatesByDefinitionId(tx, definition.id)
        const transitions = await findTransitionsByDefinitionId(tx, definition.id)

        const stateIdToKey = new Map(states.map((s) => [s.id, s.key]))

        validateWorkflowDefinitionGraph({
          states: states.map((s) => ({
            key: s.key,
            name: s.name,
            isInitial: s.isInitial,
            isTerminal: s.isTerminal,
          })),
          transitions: transitions.map((t) => ({
            key: t.key,
            name: t.name,
            fromStateKey: stateIdToKey.get(t.fromStateId) ?? '',
            toStateKey: stateIdToKey.get(t.toStateId) ?? '',
          })),
        })
      }

      const updates: Record<string, unknown> = {}
      if (input.name !== undefined) updates.name = input.name.trim()
      if (input.description !== undefined) updates.description = input.description
      if (input.status !== undefined) updates.status = input.status

      const updated = await updateWorkflowDefinition(tx, definition.id, updates)

      const states = await findStatesByDefinitionId(tx, definition.id)
      const transitions = await findTransitionsByDefinitionId(tx, definition.id)

      // Audit log
      const auditAction =
        input.status === 'active' && definition.status !== 'active'
          ? 'workflow.definition.published'
          : input.status === 'archived'
            ? 'workflow.definition.archived'
            : 'workflow.definition.updated'

      await this.auditService.record(
        {
          actorId,
          organizationId: organizationId ?? null,
          action: auditAction,
          resourceType: 'workflow_definition',
          resourceId: definition.id,
          metadata: {
            previousStatus: definition.status,
            newStatus: updated.status,
          },
        },
        tx,
      )

      return this.formatDefinitionSummary(updated, states, transitions)
    })
  }

  async createNextVersion(
    id: string,
    actorId: string,
    organizationId?: string | null,
  ): Promise<WorkflowDefinitionSummary> {
    const source = await findWorkflowDefinitionById(this.database.db, id)
    if (!source) {
      throw new NotFoundException(`Workflow definition '${id}' not found`)
    }

    if (organizationId && source.organizationId === null) {
      throw new ForbiddenException(
        'Cannot version a system-wide workflow definition from an organization scope',
      )
    }

    if (organizationId && source.organizationId && source.organizationId !== organizationId) {
      throw new ForbiddenException('Cannot version workflow definition of another organization')
    }

    return this.database.db.transaction(async (tx) => {
      const maxVersion = await getDefinitionMaxVersion(
        tx,
        source.key,
        source.organizationId ?? organizationId,
      )
      const nextVersion = maxVersion + 1

      const newDefinition = await createWorkflowDefinition(tx, {
        organizationId: source.organizationId ?? organizationId ?? null,
        key: source.key,
        name: source.name,
        description: source.description,
        version: nextVersion,
        status: 'draft',
      })

      const sourceStates = await findStatesByDefinitionId(tx, source.id)
      const stateInserts = sourceStates.map((s) => ({
        workflowDefinitionId: newDefinition.id,
        key: s.key,
        name: s.name,
        isInitial: s.isInitial,
        isTerminal: s.isTerminal,
        metadata: s.metadata,
      }))

      const createdStates = await createWorkflowStates(tx, stateInserts)
      const stateKeyToNewId = new Map(createdStates.map((s) => [s.key, s.id]))
      const stateOldIdToKey = new Map(sourceStates.map((s) => [s.id, s.key]))

      const sourceTransitions = await findTransitionsByDefinitionId(tx, source.id)
      const transitionInserts = sourceTransitions.map((t) => {
        const fromKey = stateOldIdToKey.get(t.fromStateId)!
        const toKey = stateOldIdToKey.get(t.toStateId)!
        return {
          workflowDefinitionId: newDefinition.id,
          key: t.key,
          name: t.name,
          fromStateId: stateKeyToNewId.get(fromKey)!,
          toStateId: stateKeyToNewId.get(toKey)!,
          requiredPermission: t.requiredPermission,
          metadata: t.metadata,
        }
      })

      const createdTransitions = await createWorkflowTransitions(tx, transitionInserts)

      await this.auditService.record(
        {
          actorId,
          organizationId: organizationId ?? null,
          action: 'workflow.definition.version_created',
          resourceType: 'workflow_definition',
          resourceId: newDefinition.id,
          metadata: {
            sourceDefinitionId: source.id,
            key: newDefinition.key,
            version: newDefinition.version,
          },
        },
        tx,
      )

      return this.formatDefinitionSummary(newDefinition, createdStates, createdTransitions)
    })
  }

  /**
   * Ensures a system-wide (global) workflow definition exists and is active for
   * the given key. Business modules call this during bootstrap to register their
   * generic lifecycle through the workflow engine. Actor is optional and null
   * for system-initiated seeds.
   */
  async ensureGlobalDefinition(
    input: CreateWorkflowDefinitionDto,
    actorId: string | null,
  ): Promise<WorkflowDefinitionSummary> {
    const key = input.key.trim().toLowerCase()
    const existing = await findLatestActiveDefinitionByKey(this.database.db, key, null)
    if (existing) {
      return this.getDefinition(existing.id, null)
    }
    const draft = await this.createDefinition(input, actorId, null)
    return this.updateDefinition(draft.id, { status: 'active' }, actorId, null)
  }

  async createInstance(
    input: CreateWorkflowInstanceDto,
    actorId: string,
    organizationId: string,
    db?: Db,
  ): Promise<WorkflowInstanceSummary> {
    if (!organizationId) {
      throw new BadRequestException('Organization ID is required')
    }
    if (!input.subjectType?.trim()) {
      throw new BadRequestException('Subject type is required')
    }
    if (!input.subjectId?.trim()) {
      throw new BadRequestException('Subject ID is required')
    }

    const run = async (tx: Db): Promise<WorkflowInstanceSummary> => {
      let definition = input.workflowDefinitionId
        ? await findWorkflowDefinitionById(tx, input.workflowDefinitionId)
        : null

      if (!definition && input.workflowDefinitionKey) {
        definition = await findLatestActiveDefinitionByKey(
          tx,
          input.workflowDefinitionKey.trim().toLowerCase(),
          organizationId,
        )
      }

      if (!definition) {
        throw new NotFoundException(
          `Workflow definition not found for ${
            input.workflowDefinitionId
              ? `id '${input.workflowDefinitionId}'`
              : `key '${input.workflowDefinitionKey}'`
          }`,
        )
      }

      if (definition.status !== 'active') {
        throw new BadRequestException(
          `Cannot create instance from '${definition.status}' workflow definition. Definition must be active.`,
        )
      }

      if (definition.organizationId && definition.organizationId !== organizationId) {
        throw new ForbiddenException('Cannot use workflow definition from another organization')
      }

      const states = await findStatesByDefinitionId(tx, definition.id)
      const initialState = states.find((s) => s.isInitial)
      if (!initialState) {
        throw new BadRequestException(
          `Workflow definition '${definition.key}' has no initial state defined`,
        )
      }

      const instance = await createWorkflowInstance(tx, {
        organizationId,
        workflowDefinitionId: definition.id,
        subjectType: input.subjectType.trim(),
        subjectId: input.subjectId.trim(),
        currentStateId: initialState.id,
        status: initialState.isTerminal ? 'completed' : 'active',
        createdBy: actorId,
      })

      await this.auditService.record(
        {
          actorId,
          organizationId,
          action: 'workflow.instance.created',
          resourceType: 'workflow_instance',
          resourceId: instance.id,
          metadata: {
            workflowDefinitionId: definition.id,
            key: definition.key,
            subjectType: instance.subjectType,
            subjectId: instance.subjectId,
            initialStateKey: initialState.key,
          },
        },
        tx,
      )

      const availableTransitions = await findTransitionsFromState(
        tx,
        definition.id,
        initialState.id,
      )

      return {
        id: instance.id,
        organizationId: instance.organizationId,
        workflowDefinitionId: instance.workflowDefinitionId,
        subjectType: instance.subjectType,
        subjectId: instance.subjectId,
        currentStateId: instance.currentStateId,
        currentStateKey: initialState.key,
        currentStateName: initialState.name,
        status: instance.status as any,
        availableTransitions: availableTransitions.map(this.formatTransitionSummary),
        createdBy: instance.createdBy,
        createdAt: instance.createdAt.toISOString(),
        updatedAt: instance.updatedAt.toISOString(),
      }
    }

    if (db) {
      return run(db)
    }
    return this.database.db.transaction(async (tx) => run(tx as unknown as Db))
  }

  async getInstance(id: string, organizationId: string): Promise<WorkflowInstanceSummary> {
    const instance = await findWorkflowInstanceById(this.database.db, id)
    if (!instance) {
      throw new NotFoundException(`Workflow instance '${id}' not found`)
    }

    if (instance.organizationId !== organizationId) {
      throw new ForbiddenException('Cannot access workflow instance from another organization')
    }

    const currentState = await findStateById(this.database.db, instance.currentStateId)
    const availableTransitions =
      instance.status === 'active' && currentState && !currentState.isTerminal
        ? await findTransitionsFromState(
            this.database.db,
            instance.workflowDefinitionId,
            instance.currentStateId,
          )
        : []

    return {
      id: instance.id,
      organizationId: instance.organizationId,
      workflowDefinitionId: instance.workflowDefinitionId,
      subjectType: instance.subjectType,
      subjectId: instance.subjectId,
      currentStateId: instance.currentStateId,
      currentStateKey: currentState?.key,
      currentStateName: currentState?.name,
      status: instance.status as any,
      availableTransitions: availableTransitions.map(this.formatTransitionSummary),
      createdBy: instance.createdBy,
      createdAt: instance.createdAt.toISOString(),
      updatedAt: instance.updatedAt.toISOString(),
    }
  }

  async getInstanceHistory(
    id: string,
    organizationId: string,
  ): Promise<WorkflowTransitionHistorySummary[]> {
    const instance = await findWorkflowInstanceById(this.database.db, id)
    if (!instance) {
      throw new NotFoundException(`Workflow instance '${id}' not found`)
    }

    if (instance.organizationId !== organizationId) {
      throw new ForbiddenException('Cannot access workflow instance from another organization')
    }

    const history = await findTransitionHistoryByInstanceId(this.database.db, instance.id)
    return history.map((h) => ({
      id: h.id,
      instanceId: h.instanceId,
      organizationId: h.organizationId,
      transitionId: h.transitionId,
      transitionKey: h.transitionKey,
      fromStateId: h.fromStateId,
      fromStateKey: h.fromStateKey,
      toStateId: h.toStateId,
      toStateKey: h.toStateKey,
      actorId: h.actorId,
      comment: h.comment,
      metadata: h.metadata,
      createdAt: h.createdAt.toISOString(),
    }))
  }

  async executeTransition(
    instanceId: string,
    transitionKey: string,
    dto: ExecuteTransitionDto,
    actorId: string,
    organizationId: string,
    db?: Db,
  ): Promise<WorkflowInstanceSummary> {
    const trimmedKey = transitionKey?.trim().toLowerCase()
    if (!trimmedKey) {
      throw new BadRequestException('Transition key is required')
    }

    const run = async (
      tx: Db,
    ): Promise<{
      instance: WorkflowInstanceRow
      currentState: WorkflowStateRow
      toState: WorkflowStateRow
      transition: WorkflowTransitionRow
      availableTransitions: WorkflowTransitionRow[]
    }> => {
      // 1. Acquire row lock on workflow instance
      const instance = await findWorkflowInstanceForUpdate(tx, instanceId)
      if (!instance) {
        throw new NotFoundException(`Workflow instance '${instanceId}' not found`)
      }

      // 2. Organization tenant boundary check
      if (instance.organizationId !== organizationId) {
        throw new ForbiddenException('Cannot access workflow instance from another organization')
      }

      // 3. Status check
      if (instance.status !== 'active') {
        throw new BadRequestException(
          `Cannot transition workflow instance in '${instance.status}' status`,
        )
      }

      // 4. Current state check
      const currentState = await findStateById(tx, instance.currentStateId)
      if (!currentState) {
        throw new BadRequestException('Current workflow state not found')
      }
      if (currentState.isTerminal) {
        throw new BadRequestException(
          `Workflow instance is in terminal state '${currentState.key}' and cannot transition`,
        )
      }

      // 5. Look up transition matching current state
      const transition = await findTransitionByKeyAndFromState(
        tx,
        instance.workflowDefinitionId,
        trimmedKey,
        instance.currentStateId,
      )

      if (!transition) {
        const allDefTransitions = await findTransitionsByDefinitionId(
          tx,
          instance.workflowDefinitionId,
        )
        const existsElsewhere = allDefTransitions.some((t) => t.key === trimmedKey)
        if (existsElsewhere) {
          throw new BadRequestException(
            `Transition '${trimmedKey}' cannot be executed from current state '${currentState.key}'`,
          )
        }
        throw new NotFoundException(`Transition '${trimmedKey}' not found in workflow definition`)
      }

      // 6. Transition authorization check against RBAC
      const membership = await findMemberByOrgAndUser(tx, organizationId, actorId)
      if (!membership || membership.status !== 'active') {
        throw new ForbiddenException('Actor is not an active member of this organization')
      }

      if (transition.requiredPermission) {
        const userPermissions = await this.accessService.getRolePermissionKeys(
          tx,
          membership.roleId,
        )
        if (!userPermissions.includes(transition.requiredPermission)) {
          throw new ForbiddenException(
            `Missing required permission: ${transition.requiredPermission}`,
          )
        }
      }

      // 7. Target state
      const toState = await findStateById(tx, transition.toStateId)
      if (!toState) {
        throw new BadRequestException(`Target state '${transition.toStateId}' not found`)
      }

      // 8. Update instance state and status
      const nextStatus = toState.isTerminal ? 'completed' : 'active'
      const updated = await updateWorkflowInstance(tx, instance.id, {
        currentStateId: toState.id,
        status: nextStatus,
      })

      // 9. Record transition history
      await createTransitionHistory(tx, {
        instanceId: instance.id,
        organizationId: instance.organizationId,
        transitionId: transition.id,
        transitionKey: transition.key,
        fromStateId: currentState.id,
        fromStateKey: currentState.key,
        toStateId: toState.id,
        toStateKey: toState.key,
        actorId,
        comment: dto.comment ?? null,
        metadata: dto.metadata ?? {},
      })

      // 10. Record audit log
      await this.auditService.record(
        {
          actorId,
          organizationId,
          action: 'workflow.transition.executed',
          resourceType: 'workflow_instance',
          resourceId: instance.id,
          metadata: {
            workflowDefinitionId: instance.workflowDefinitionId,
            subjectType: instance.subjectType,
            subjectId: instance.subjectId,
            transitionKey: transition.key,
            fromStateKey: currentState.key,
            toStateKey: toState.key,
            comment: dto.comment ?? null,
          },
        },
        tx,
      )

      const availableTransitions =
        nextStatus === 'active' && !toState.isTerminal
          ? await findTransitionsFromState(tx, instance.workflowDefinitionId, toState.id)
          : []

      return {
        instance: updated,
        currentState,
        toState,
        transition,
        availableTransitions,
      }
    }

    const result = db
      ? await run(db)
      : await this.database.db.transaction(async (tx) => run(tx as unknown as Db))

    // 11. Dispatch in-process notification event
    await this.notificationHook.emitTransition({
      instanceId: result.instance.id,
      organizationId: result.instance.organizationId,
      workflowDefinitionId: result.instance.workflowDefinitionId,
      subjectType: result.instance.subjectType,
      subjectId: result.instance.subjectId,
      transitionKey: result.transition.key,
      fromStateKey: result.currentState.key,
      toStateKey: result.toState.key,
      actorId,
      comment: dto.comment ?? null,
      occurredAt: new Date(),
      metadata: dto.metadata,
    })

    return {
      id: result.instance.id,
      organizationId: result.instance.organizationId,
      workflowDefinitionId: result.instance.workflowDefinitionId,
      subjectType: result.instance.subjectType,
      subjectId: result.instance.subjectId,
      currentStateId: result.instance.currentStateId,
      currentStateKey: result.toState.key,
      currentStateName: result.toState.name,
      status: result.instance.status as any,
      availableTransitions: result.availableTransitions.map(this.formatTransitionSummary),
      createdBy: result.instance.createdBy,
      createdAt: result.instance.createdAt.toISOString(),
      updatedAt: result.instance.updatedAt.toISOString(),
    }
  }

  private formatDefinitionSummary(
    def: any,
    states?: any[],
    transitions?: any[],
  ): WorkflowDefinitionSummary {
    return {
      id: def.id,
      organizationId: def.organizationId ?? null,
      key: def.key,
      name: def.name,
      description: def.description ?? null,
      version: def.version,
      status: def.status,
      states: states?.map(this.formatStateSummary),
      transitions: transitions?.map(this.formatTransitionSummary),
      createdAt: def.createdAt.toISOString(),
      updatedAt: def.updatedAt.toISOString(),
    }
  }

  private formatStateSummary(state: any): WorkflowStateSummary {
    return {
      id: state.id,
      workflowDefinitionId: state.workflowDefinitionId,
      key: state.key,
      name: state.name,
      isInitial: state.isInitial,
      isTerminal: state.isTerminal,
      metadata: state.metadata,
      createdAt: state.createdAt.toISOString(),
      updatedAt: state.updatedAt.toISOString(),
    }
  }

  private formatTransitionSummary(trans: any): WorkflowTransitionSummary {
    return {
      id: trans.id,
      workflowDefinitionId: trans.workflowDefinitionId,
      key: trans.key,
      name: trans.name,
      fromStateId: trans.fromStateId,
      toStateId: trans.toStateId,
      requiredPermission: trans.requiredPermission ?? null,
      metadata: trans.metadata,
      createdAt: trans.createdAt.toISOString(),
      updatedAt: trans.updatedAt.toISOString(),
    }
  }
}
