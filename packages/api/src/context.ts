import type { Database } from "@majimap/db";

/**
 * What the API needs to know about the caller. Deliberately NOT Better
 * Auth's own session type: this package shouldn't care how authentication
 * is configured. The host (the Next.js route handler) maps whatever its
 * auth library returns into this shape.
 */

export type Session = {
    userId: string;
    organizationId: string | null;
};

export type Context = {
    db: Database;
    session: Session | null;
};

export function createContext(input: Context): Context {
    return input;
}