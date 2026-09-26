import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Supabase direct connection (port 5432). Small pool: Render free + Supabase
// free tier don't need more than a handful of connections.
const client = postgres(connectionString, { max: 5, ssl: "require", prepare: true });

export const db = drizzle(client, { schema });
export type Db = typeof db;
