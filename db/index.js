import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema.js'

// Built lazily (not at module load) so a bad/missing DATABASE_URL or a
// connection-setup error surfaces as a normal caught exception inside a
// request handler's try/catch — not an uncaught crash before the function
// even starts, which Vercel reports as an opaque platform error page
// instead of the real message.
let _db = null
export function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
    _db = drizzle(neon(process.env.DATABASE_URL), { schema })
  }
  return _db
}
