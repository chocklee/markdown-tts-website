import { Pool } from 'pg'

const globalForPg = globalThis as unknown as { mttsPool?: Pool }

export const pool =
  globalForPg.mttsPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })

if (process.env.NODE_ENV !== 'production') globalForPg.mttsPool = pool
