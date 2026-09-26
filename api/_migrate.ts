// Migration runner for Vercel serverless: executes the embedded schema
// (idempotent CREATE TABLE IF NOT EXISTS) once per function instance, on the
// first request that needs the database.
import postgres from "postgres";
import { SCHEMA_SQL } from "./_schemaSql";

let migratePromise: Promise<void> | null = null;

async function run(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const client = postgres(connectionString, { max: 1, ssl: "require", prepare: false });
  try {
    await client.unsafe(SCHEMA_SQL);
    console.log("[migrate] schema listo");
  } finally {
    await client.end();
  }
}

export function ensureMigrated(): Promise<void> {
  if (!migratePromise) {
    migratePromise = run().catch((err) => {
      migratePromise = null;
      throw err;
    });
  }
  return migratePromise;
}
