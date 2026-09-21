import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { randomBytes } from 'node:crypto'
import * as argon2 from '@node-rs/argon2'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/reka'

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  const db = drizzle(pool)

  // Clear existing demo data (optional)
  await db.execute('DELETE FROM organization_members WHERE true')
  await db.execute('DELETE FROM organizations WHERE true')
  await db.execute('DELETE FROM users WHERE true')

  // Create admin user
  const adminPassword = 'demo123'
  const adminPasswordHash = await argon2.hash(adminPassword)
  const [admin] = await db
    .insert({ email: 'admin@reka.demo', passwordHash: adminPasswordHash, displayName: 'Admin Demo', status: 'active' })
    .into('users')
    .returning()

  // Create demo organization
  const [org] = await db
    .insert({ name: 'Acme Indonesia', slug: 'acme-indonesia', status: 'active' })
    .into('organizations')
    .returning()

  // Get owner role
  const [ownerRole] = await db
    .select()
    .from('roles')
    .where({ organizationId: org.id, key: 'owner' })

  // Add admin as owner
  await db.insert({ organizationId: org.id, userId: admin.id, roleId: ownerRole.id, status: 'active' }).into('organization_members')

  // Enable business modules
  await db.update({ enabled: true }).from('platform_modules').where({ id: 'procurement' })
  await db.update({ enabled: true }).from('platform_modules').where({ id: 'inventory' })
  await db.update({ enabled: true }).from('platform_modules').where({ id: 'assets' })

  console.log(`
✅ Demo seed complete
Organization: ${org.name} (${org.slug})
Admin user: admin@reka.demo / ${adminPassword}
`)
  await pool.end()
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
