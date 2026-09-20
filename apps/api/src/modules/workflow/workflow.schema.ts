import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { usersTable } from '../identity/user.schema.js'
import { organizations } from '../organization/organization.schema.js'

export const workflowDefinitions = pgTable(
  'workflow_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    version: integer('version').notNull().default(1),
    status: text('status').notNull().default('draft'), // 'draft' | 'active' | 'archived'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('workflow_definitions_key_idx').on(table.key),
    index('workflow_definitions_org_key_ver_idx').on(
      table.organizationId,
      table.key,
      table.version,
    ),
  ],
)

export const workflowStates = pgTable(
  'workflow_states',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowDefinitionId: uuid('workflow_definition_id')
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    isInitial: boolean('is_initial').notNull().default(false),
    isTerminal: boolean('is_terminal').notNull().default(false),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('workflow_states_def_key_unique').on(table.workflowDefinitionId, table.key),
  ],
)

export const workflowTransitions = pgTable(
  'workflow_transitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowDefinitionId: uuid('workflow_definition_id')
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    fromStateId: uuid('from_state_id')
      .notNull()
      .references(() => workflowStates.id, { onDelete: 'cascade' }),
    toStateId: uuid('to_state_id')
      .notNull()
      .references(() => workflowStates.id, { onDelete: 'cascade' }),
    requiredPermission: text('required_permission'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('workflow_transitions_def_key_from_unique').on(
      table.workflowDefinitionId,
      table.key,
      table.fromStateId,
    ),
  ],
)

export const workflowInstances = pgTable(
  'workflow_instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workflowDefinitionId: uuid('workflow_definition_id')
      .notNull()
      .references(() => workflowDefinitions.id, { onDelete: 'restrict' }),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    currentStateId: uuid('current_state_id')
      .notNull()
      .references(() => workflowStates.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('active'), // 'active' | 'completed' | 'canceled'
    createdBy: uuid('created_by')
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('workflow_instances_org_idx').on(table.organizationId),
    index('workflow_instances_subject_idx').on(
      table.organizationId,
      table.subjectType,
      table.subjectId,
    ),
  ],
)

export const workflowTransitionHistory = pgTable(
  'workflow_transition_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => workflowInstances.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    transitionId: uuid('transition_id').references(() => workflowTransitions.id, {
      onDelete: 'set null',
    }),
    transitionKey: text('transition_key').notNull(),
    fromStateId: uuid('from_state_id').references(() => workflowStates.id, {
      onDelete: 'set null',
    }),
    fromStateKey: text('from_state_key').notNull(),
    toStateId: uuid('to_state_id').references(() => workflowStates.id, {
      onDelete: 'set null',
    }),
    toStateKey: text('to_state_key').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => usersTable.id),
    comment: text('comment'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('workflow_history_instance_idx').on(table.instanceId),
    index('workflow_history_org_idx').on(table.organizationId),
  ],
)

export type WorkflowDefinitionRow = typeof workflowDefinitions.$inferSelect
export type WorkflowDefinitionInsert = typeof workflowDefinitions.$inferInsert

export type WorkflowStateRow = typeof workflowStates.$inferSelect
export type WorkflowStateInsert = typeof workflowStates.$inferInsert

export type WorkflowTransitionRow = typeof workflowTransitions.$inferSelect
export type WorkflowTransitionInsert = typeof workflowTransitions.$inferInsert

export type WorkflowInstanceRow = typeof workflowInstances.$inferSelect
export type WorkflowInstanceInsert = typeof workflowInstances.$inferInsert

export type WorkflowTransitionHistoryRow = typeof workflowTransitionHistory.$inferSelect
export type WorkflowTransitionHistoryInsert = typeof workflowTransitionHistory.$inferInsert
