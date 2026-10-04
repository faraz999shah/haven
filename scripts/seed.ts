import 'dotenv/config'
import { createDb } from '@/lib/db/client'
import { seedDemo } from '@/lib/db/seed'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const { db, pool } = createDb(url)
  await seedDemo(db)
  await pool.end()
  console.log('Demo data seeded (all previous data was reset)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
