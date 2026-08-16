import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'

import { relations } from './relations'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required')
}

const databaseGlobal = globalThis as typeof globalThis & {
  bitigFlowDatabasePool?: Pool
}

export const pool =
  databaseGlobal.bitigFlowDatabasePool ??
  new Pool({
    connectionString: databaseUrl,
  })

databaseGlobal.bitigFlowDatabasePool = pool

export const db = drizzle({ client: pool, relations })
