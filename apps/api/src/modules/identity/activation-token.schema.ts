import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { usersTable } from './user.schema.js'

export const activationTokens = pgTable(
  'activation_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('activation_tokens_user_idx').on(table.userId)],
)
