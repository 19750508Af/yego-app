// Lazy drizzle client for Vercel serverless functions (Node runtime).
// Uses the Supabase transaction pooler (port 6543): prepared statements are
// disabled because pgbouncer in transaction mode doesn't support them.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../server/src/schema";

let _db: ReturnType<typeof getDrizzle> | null = null;

function getDrizzle(client: postgres.Sql) {
  return drizzle(client, { schema });
}

export function getDb() {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    const client = postgres(connectionString, { max: 1, ssl: "require", prepare: false });
    _db = getDrizzle(client);
  }
  return _db;
}
