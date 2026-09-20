import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: ['./src/modules/**/*.schema.ts', '../../packages/jobs/src/**/*.schema.ts'],
  dialect: 'postgresql',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://reka:reka@localhost:5432/reka',
  },
})
