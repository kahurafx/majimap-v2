// Only for `pnpm auth:generate`: the CLI reads plugin config, it never queries,
// so a stub db is enough. Diff generated-schema.ts against packages/db/src/schema/auth.ts.
import type { Database } from "@majimap/db";
import { createAuth } from "./auth";

export const auth = createAuth({} as Database);