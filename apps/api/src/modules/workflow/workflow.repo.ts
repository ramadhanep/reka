import { and, desc, eq, isNull, or } from 'drizzle-orm'
import type { Db } from '@reka/database'
import {
  workflowDefinitions,
  workflowInstances,
  workflowStates,
  workflowTransitionHistory,
  workflowTransitions,
  type WorkflowDefinitionInsert,
  type WorkflowDefinitionRow,
  type WorkflowInstanceInsert,
  type WorkflowInstanceRow,
  type WorkflowStateInsert,
  type WorkflowStateRow,
  type WorkflowTransitionHistoryInsert,
  type WorkflowTransitionHistoryRow,
  type WorkflowTransitionInsert,
  type WorkflowTransitionRow,
} from './workflow.schema.js'

export async function createWorkflowDefinition(
  db: Db,
  input: WorkflowDefinitionInsert,
): Promise<WorkflowDefinitionRow> {
  const [row] = await db.insert(workflowDefinitions).values(input).returning()
  return row
}

export async function findWorkflowDefinitionById(
  db: Db,
  id: string,
): Promise<WorkflowDefinitionRow | null> {
  const [row] = await db.select().from(workflowDefinitions).where(eq(workflowDefinitions.id, id))
  return row ?? null
}

export async function findWorkflowDefinitions(
  db: Db,
  organizationId?: string | null,
): Promise<WorkflowDefinitionRow[]> {
  const condition = organizationId
    ? or(
        eq(workflowDefinitions.organizationId, organizationId),
        isNull(workflowDefinitions.organizationId),
      )
    : isNull(workflowDefinitions.organizationId)

  return db
    .select()
    .from(workflowDefinitions)
    .where(condition)
    .orderBy(desc(workflowDefinitions.updatedAt))
}

export async function findLatestActiveDefinitionByKey(
  db: Db,
  key: string,
  organizationId?: string | null,
): Promise<WorkflowDefinitionRow | null> {
  const orgCondition = organizationId
    ? or(
        eq(workflowDefinitions.organizationId, organizationId),
        isNull(workflowDefinitions.organizationId),
      )
    : isNull(workflowDefinitions.organizationId)

  const rows = await db
    .select()
    .from(workflowDefinitions)
    .where(
      and(eq(workflowDefinitions.key, key), eq(workflowDefinitions.status, 'active'), orgCondition),
    )
    .orderBy(desc(workflowDefinitions.version))

  // If there's an organization-specific definition, prefer it over system-wide (null org)
  if (organizationId && rows.length > 1) {
    const orgSpecific = rows.find((r) => r.organizationId === organizationId)
    if (orgSpecific) return orgSpecific
  }

  return rows[0] ?? null
}

export async function getDefinitionMaxVersion(
  db: Db,
  key: string,
  organizationId?: string | null,
): Promise<number> {
  const orgCondition = organizationId
    ? eq(workflowDefinitions.organizationId, organizationId)
    : isNull(workflowDefinitions.organizationId)

  const rows = await db
    .select({ version: workflowDefinitions.version })
    .from(workflowDefinitions)
    .where(and(eq(workflowDefinitions.key, key), orgCondition))
    .orderBy(desc(workflowDefinitions.version))
    .limit(1)

  return rows[0]?.version ?? 0
}

export async function updateWorkflowDefinition(
  db: Db,
  id: string,
  updates: Partial<WorkflowDefinitionInsert>,
): Promise<WorkflowDefinitionRow> {
  const [row] = await db
    .update(workflowDefinitions)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(workflowDefinitions.id, id))
    .returning()
  return row
}

export async function createWorkflowStates(
  db: Db,
  states: WorkflowStateInsert[],
): Promise<WorkflowStateRow[]> {
  if (states.length === 0) return []
  return db.insert(workflowStates).values(states).returning()
}

export async function findStatesByDefinitionId(
  db: Db,
  definitionId: string,
): Promise<WorkflowStateRow[]> {
  return db
    .select()
    .from(workflowStates)
    .where(eq(workflowStates.workflowDefinitionId, definitionId))
}

export async function findStateById(db: Db, stateId: string): Promise<WorkflowStateRow | null> {
  const [row] = await db.select().from(workflowStates).where(eq(workflowStates.id, stateId))
  return row ?? null
}

export async function createWorkflowTransitions(
  db: Db,
  transitions: WorkflowTransitionInsert[],
): Promise<WorkflowTransitionRow[]> {
  if (transitions.length === 0) return []
  return db.insert(workflowTransitions).values(transitions).returning()
}

export async function findTransitionsByDefinitionId(
  db: Db,
  definitionId: string,
): Promise<WorkflowTransitionRow[]> {
  return db
    .select()
    .from(workflowTransitions)
    .where(eq(workflowTransitions.workflowDefinitionId, definitionId))
}

export async function findTransitionByKeyAndFromState(
  db: Db,
  definitionId: string,
  key: string,
  fromStateId: string,
): Promise<WorkflowTransitionRow | null> {
  const [row] = await db
    .select()
    .from(workflowTransitions)
    .where(
      and(
        eq(workflowTransitions.workflowDefinitionId, definitionId),
        eq(workflowTransitions.key, key),
        eq(workflowTransitions.fromStateId, fromStateId),
      ),
    )
  return row ?? null
}

export async function findTransitionsFromState(
  db: Db,
  definitionId: string,
  fromStateId: string,
): Promise<WorkflowTransitionRow[]> {
  return db
    .select()
    .from(workflowTransitions)
    .where(
      and(
        eq(workflowTransitions.workflowDefinitionId, definitionId),
        eq(workflowTransitions.fromStateId, fromStateId),
      ),
    )
}

export async function createWorkflowInstance(
  db: Db,
  input: WorkflowInstanceInsert,
): Promise<WorkflowInstanceRow> {
  const [row] = await db.insert(workflowInstances).values(input).returning()
  return row
}

export async function findWorkflowInstanceById(
  db: Db,
  id: string,
): Promise<WorkflowInstanceRow | null> {
  const [row] = await db.select().from(workflowInstances).where(eq(workflowInstances.id, id))
  return row ?? null
}

export async function findWorkflowInstanceForUpdate(
  db: Db,
  id: string,
): Promise<WorkflowInstanceRow | null> {
  const [row] = await db
    .select()
    .from(workflowInstances)
    .where(eq(workflowInstances.id, id))
    .for('update')
  return row ?? null
}

export async function updateWorkflowInstance(
  db: Db,
  id: string,
  updates: Partial<WorkflowInstanceInsert>,
): Promise<WorkflowInstanceRow> {
  const [row] = await db
    .update(workflowInstances)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(workflowInstances.id, id))
    .returning()
  return row
}

export async function createTransitionHistory(
  db: Db,
  input: WorkflowTransitionHistoryInsert,
): Promise<WorkflowTransitionHistoryRow> {
  const [row] = await db.insert(workflowTransitionHistory).values(input).returning()
  return row
}

export async function findTransitionHistoryByInstanceId(
  db: Db,
  instanceId: string,
): Promise<WorkflowTransitionHistoryRow[]> {
  return db
    .select()
    .from(workflowTransitionHistory)
    .where(eq(workflowTransitionHistory.instanceId, instanceId))
    .orderBy(desc(workflowTransitionHistory.createdAt))
}

export async function hasInstancesForDefinition(db: Db, definitionId: string): Promise<boolean> {
  const rows = await db
    .select({ id: workflowInstances.id })
    .from(workflowInstances)
    .where(eq(workflowInstances.workflowDefinitionId, definitionId))
    .limit(1)
  return rows.length > 0
}
