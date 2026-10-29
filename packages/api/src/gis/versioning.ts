import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const MAIN_BRANCH = "main";
export const BranchSchema = z.string().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/, "Branch names may only contain letters, numbers, dots, dashes and underscores");

/**
 * Entity ids may be supplied by the client (an offline device has to name
 * what it creates before it ever reaches the server — which is also what
 * makes retries idempotent), so they're validated rather than trusted.
 */
export const EntityIdSchema = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const GeoPointInput = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
});

export function toIso(value: Date | null): string | null {
    return value ? value.toISOString() : null;
}

export function fromIso(value: string | null): Date | null {
    return value ? new Date(value) : null;
}

/** Drop undefined keys so a partial patch can be spread over a full row without erasing fields. */
export function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function pgErrorChain(err: unknown): Array<{ code?: string; message?: string }> {
    const chain: Array<{ code?: string; message?: string }> = [];
    let current: unknown = err;
    // Drizzle wraps driver errors, so the real Postgres error can sit a couple of `cause`s down.
    for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
        chain.push(current as { code?: string; message?: string });
        current = (current as { cause?: unknown }).cause;
    }
    return chain;
}

/**
 * Translate the database errors that are really "someone else got there
 * first" or "that violates a rule" into the right API error, instead of
 * letting them surface as an opaque 500. Anything unrecognised rethrows.
 */
export function rethrowDbError(err: unknown): never {

    if (err instanceof TRPCError) throw err;

    const chain = pgErrorChain(err);

    if (chain.some((e) => e.code === "23505")) {
        throw new TRPCError({
            code: "CONFLICT",
            message: "This was created or changed concurrently — refetch and try again",
            cause: err,
        });
    }

    if (chain.some((e) => e.code === "23503")) {
        throw new TRPCError({
            code: "CONFLICT",
            message: "Something still refers to this, or what it refers to no longer exists",
            cause: err,
        });
    }

    const rule = chain.find((e) =>
        /may not be housed|does not reference an existing structure/.test(e.message ?? ""),
    );

    if (rule) {
        throw new TRPCError({ code: "BAD_REQUEST", message: rule.message ?? "Invalid structure attachment", cause: err });
    }

    throw err;
}