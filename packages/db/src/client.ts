// packages/db/src/client.ts

import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Driver-agnostic type for consumers (api, scripts, tests). Production and
 * tests both use node-postgres, which supports interactive transactions
 * for the versioned write path.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(connectionString: string): Database & { $client: Pool } {
    const pool = new Pool({ connectionString });
    return drizzle(pool, { schema });
}

const globalForDb = globalThis as unknown as { __majimapDb?: Database };

/** One shared database per process; reads DATABASE_URL on first use. */
export function getDb(): Database {
    if (!globalForDb.__majimapDb) {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error("DATABASE_URL is not set");
        globalForDb.__majimapDb = createDb(url);
    }
    return globalForDb.__majimapDb;
}

//If you move to a serverless or edge deployment, the change is confined to createDb: import Pool from @neondatabase/serverless and drizzle from drizzle-orm/neon-serverless.
// The Database type and every consumer stay the same, which is what the driver-agnostic type is for.
// Tests would keep using pg through their own setup.
//
// I removed the top-level DATABASE_URL throw and the commented-out code, same as in my previous version.