/* eslint-disable no-console */
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { inArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as argon2 from '@node-rs/argon2'
import { usersTable } from '../src/modules/identity/user.schema.js'
import { organizations } from '../src/modules/organization/organization.schema.js'
import { organizationMembers } from '../src/modules/organization/organization-member.schema.js'
import { roles } from '../src/modules/access/role.schema.js'
import { permissions } from '../src/modules/access/permission.schema.js'
import { rolePermissions } from '../src/modules/access/role-permission.schema.js'
import {
  MEMBER_ROLE_KEY,
  OWNER_ROLE_KEY,
  permissionCatalog,
} from '../src/modules/access/permission-catalog.js'
import { platformModules } from '../src/modules/module-registry/module.schema.js'

// Load the repository-root .env when present, matching the documented setup.
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') })

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://reka:reka@localhost:5432/reka'

const DEMO_EMAIL = 'admin@reka.demo'
const DEMO_PASSWORD = 'demo123'
const DEMO_ORGANIZATION = { name: 'Acme Indonesia', slug: 'acme-indonesia' }
const DEMO_MODULES = ['procurement', 'inventory', 'assets'] as const

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  const db = drizzle(pool)

  console.log('Seeding demo data...')

  try {
    await db.transaction(async (tx) => {
      // Reset demo data. Roles and role_permissions cascade from organizations;
      // activation tokens cascade from users.
      await tx.delete(organizationMembers).where(sql`true`)
      await tx.delete(organizations).where(sql`true`)
      await tx.delete(usersTable).where(sql`true`)

      const [admin] = await tx
        .insert(usersTable)
        .values({
          email: DEMO_EMAIL,
          passwordHash: await argon2.hash(DEMO_PASSWORD),
          displayName: 'Admin Demo',
          status: 'active',
        })
        .returning()

      const [org] = await tx
        .insert(organizations)
        .values({ name: DEMO_ORGANIZATION.name, slug: DEMO_ORGANIZATION.slug, status: 'active' })
        .returning()

      const [ownerRole] = await tx
        .insert(roles)
        .values({ organizationId: org.id, key: OWNER_ROLE_KEY, name: 'Owner', system: true })
        .returning()
      await tx
        .insert(roles)
        .values({ organizationId: org.id, key: MEMBER_ROLE_KEY, name: 'Member', system: true })

      // Ensure the full permission catalog exists, then grant it to owner.
      const permissionKeys = Object.keys(permissionCatalog)
      await tx
        .insert(permissions)
        .values(permissionKeys.map((key) => ({ key, description: permissionCatalog[key] ?? key })))
        .onConflictDoNothing()
      const permissionRows = await tx
        .select({ id: permissions.id })
        .from(permissions)
        .where(inArray(permissions.key, permissionKeys))
      if (permissionRows.length > 0) {
        await tx
          .insert(rolePermissions)
          .values(permissionRows.map((row) => ({ roleId: ownerRole.id, permissionId: row.id })))
          .onConflictDoNothing()
      }

      await tx.insert(organizationMembers).values({
        organizationId: org.id,
        userId: admin.id,
        roleId: ownerRole.id,
        status: 'active',
      })

      // The module registry inserts rows at API boot; seed them here so a fresh
      // database has the demo modules enabled before the first API start.
      for (const id of DEMO_MODULES) {
        await tx
          .insert(platformModules)
          .values({ id, version: '0.0.0', enabled: true })
          .onConflictDoUpdate({
            target: platformModules.id,
            set: { enabled: true, updatedAt: new Date() },
          })
      }

      console.log(`
Demo seed complete

Organization: ${org.name} (${org.slug})
Admin user:   ${DEMO_EMAIL}
Password:     ${DEMO_PASSWORD}
Modules:      ${DEMO_MODULES.join(', ')}

Login at http://localhost:3000/login
`)
    })
  } finally {
    await pool.end()
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
