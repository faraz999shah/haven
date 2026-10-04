import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

export type Db = NodePgDatabase<typeof schema>

export function createDb(connectionString: string): { db: Db; pool: Pool } {
  const pool = new Pool({
    connectionString,
    // Render's internal URL needs no SSL; its external URL (e.g. running locally against Render) does.
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: 5,
  })
  return { db: drizzle(pool, { schema }), pool }
}

// Reuse one pool across Next.js dev hot reloads.
const globalForDb = globalThis as unknown as { havenDb?: Db }

export function getDb(): Db {
  if (!globalForDb.havenDb) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    globalForDb.havenDb = createDb(url).db
  }
  return globalForDb.havenDb
}
