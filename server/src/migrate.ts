// Runs server/schema.sql (idempotent CREATE TABLE IF NOT EXISTS) so a fresh
// Supabase database is ready on first boot. Safe to run on every deploy.
import postgres from "postgres";

export async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const sql = await Bun.file(new URL("../schema.sql", import.meta.url)).text();
  const client = postgres(connectionString, { max: 1, ssl: "require" });
  try {
    await client.unsafe(sql);
    console.log("[migrate] schema listo");
  } finally {
    await client.end();
  }
}
