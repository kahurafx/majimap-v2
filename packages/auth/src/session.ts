import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@majimap/db";
import { getAuth } from "./auth";

/** Structurally identical to `Session` in @majimap/api, so api never depends on this package. */
export type ApiSession = { userId: string; organizationId: string | null };

/**
 * Maps a Better Auth session onto the API's Session shape. Works for web
 * (cookie) and Expo (cookie sent as a header). The active org is only
 * trusted if the user is still a member of it.
 */
export async function getApiSession(input: Request | Headers): Promise<ApiSession | null> {
    const headers = input instanceof Headers ? input : input.headers;
    const s = await getAuth().api.getSession({ headers });
    if (!s) return null;

    const orgId = s.session.activeOrganizationId ?? null;
    if (!orgId) return { userId: s.user.id, organizationId: null };

    const [m] = await getDb()
        .select({ id: schema.member.id })
        .from(schema.member)
        .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.userId, s.user.id)))
        .limit(1);

    return { userId: s.user.id, organizationId: m ? orgId : null };
}