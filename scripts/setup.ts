// Runs on every start (Render's free tier has no shell or pre-deploy step):
// applies migrations, then seeds the demo data only if the database is empty.

import 'dotenv/config'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDb } from '@/lib/db/client'
import { caregivers } from '@/lib/db/schema'
import { seedDemo } from '@/lib/db/seed'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const { db, pool } = createDb(url)
  await migrate(db, { migrationsFolder: './drizzle' })
  const existing = await db.select({ id: caregivers.id }).from(caregivers).limit(1)
  if (existing.length === 0) {
    await seedDemo(db)
    console.log('Database migrated and demo data seeded')
  } else {
    console.log('Database migrated (existing data kept)')
  }
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
