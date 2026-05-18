/**
 * @deprecated LEGACY — This file is no longer used by any routes.
 * ================================================================
 * The project has fully migrated to Firebase Admin SDK for server-side
 * data access (see server/firebase-admin.ts) and Supabase for client-side
 * data access (see client/src/services/supabaseDataService.ts).
 *
 * This Drizzle ORM + Neon PostgreSQL setup is dead code and kept
 * as reference only. No routes import from this file.
 *
 * To reinstate in the future:
 *   1. Set DATABASE_URL env var
 *   2. Uncomment the import in routes.ts
 *   3. Re-enable the Drizzle schema
 * ================================================================
 */
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });
