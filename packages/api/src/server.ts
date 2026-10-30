import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Database } from "@majimap/db";
import { createContext, type Session } from "./context";
import { appRouter } from "./router";
import type { Storage } from "./storage";

/** Supplied by whoever owns authentication (packages/auth): headers in, caller out. */
export type SessionResolver = (headers: Headers) => Promise<Session | null>;

export function handleTrpcRequest(
    req: Request,
    deps: { db: Database; getSession: SessionResolver; storage: Storage; endpoint?: string },
): Promise<Response> {
    return fetchRequestHandler({
        endpoint: deps.endpoint ?? "/api/trpc",
        req,
        router: appRouter,
        createContext: async () => createContext({ db: deps.db, session: await deps.getSession(req.headers), storage: deps.storage }),
        onError({ error, path }) {
            // Expected failures (auth, validation, conflicts) are the caller's business; only log the unexpected.
            if (error.code === "INTERNAL_SERVER_ERROR") console.error(`tRPC ${path ?? "<unknown>"} failed:`, error);
        },
    });
}