import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq, and, sql } from 'drizzle-orm'
import { Pool } from 'pg'
import * as argon2 from '@node-rs/argon2'
import { usersTable } from '../apps/api/src/modules/identity/user.schema.js'
import { organizations } from '../apps/api/src/modules/organization/organization.schema.js'
import { organizationMembers } from '../apps/api/src/modules/organization/organization-member.schema.js'
import { roles } from '../apps/api/src/modules/access/role.schema.js'
import { platformModules } from '../apps/api/src/modules/module-registry/module.schema.js'

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/reka'

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  const db = drizzle(pool)

  console.log('🌱 Seeding demo data...')

  // Clean existing demo data
  await db.delete(organizationMembers).where(sql`true`)
  await db.delete(organizations).where(sql`true`)
  await db.delete(usersTable).where(sql`true`)

  // Create admin user
  const adminPassword = 'demo123'
  const adminPasswordHash = await argon2.hash(adminPassword)
  const [admin] = await db
    .insert(usersTable)
    .values({
      email: 'admin@reka.demo',
      passwordHash: adminPasswordHash,
      displayName: 'Admin Demo',
      status: 'active',
    })
    .returning()

  // Create demo organization
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'Acme Indonesia',
      slug: 'acme-indonesia',
      status: 'active',
    })
    .returning()

  // Get owner role
  const [ownerRole] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.organizationId, org.id), eq(roles.key, 'owner')))
    .limit(1)

  if (!ownerRole) {
    throw new Error('Owner role not found - ensure migrations have run')
  }

  // Add admin as owner
  await db.insert(organizationMembers).values({
    organizationId: org.id,
    userId: admin.id,
    roleId: ownerRole.id,
    status: 'active',
  })

  // Enable business modules
  await db
    .update(platformModules)
    .set({ enabled: true })
    .where(eq(platformModules.id, 'procurement'))
  await db.update(platformModules).set({ enabled: true }).where(eq(platformModules.id, 'inventory'))
  await db.update(platformModules).set({ enabled: true }).where(eq(platformModules.id, 'assets'))

  console.log(`
✅ Demo seed complete

Organization: ${org.name} (${org.slug})
Admin user:   admin@reka.demo
Password:     ${adminPassword}

Login at http://localhost:3000/login
`)
  await pool.end()
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
