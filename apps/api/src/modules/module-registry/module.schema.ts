import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const platformModules = pgTable('platform_modules', {
  id: text('id').primaryKey(),
  version: text('version').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type PlatformModuleRow = typeof platformModules.$inferSelect
export type PlatformModuleInsert = typeof platformModules.$inferInsert
