import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, username } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { eq } from "drizzle-orm";
import { getDb, provisionOrganization, schema, type Database } from "@majimap/db";

/** Native deep-link scheme. Must match `scheme` in the Expo app config. */
export const APP_SCHEME = "majimap";

export function createAuth(db: Database) {
    return betterAuth({
        database: drizzleAdapter(db, { provider: "pg", schema }),
        secret: process.env.BETTER_AUTH_SECRET,
        baseURL: process.env.BETTER_AUTH_URL,
        trustedOrigins: [
            `${APP_SCHEME}://`,
            ...(process.env.NODE_ENV === "production" ? [] : ["exp://"]),
            ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",").filter(Boolean) ?? []),
        ],

        // Accounts are created by admins (see provision-user.ts), never self-serve.
        emailAndPassword: { enabled: true, disableSignUp: true },

        plugins: [
            // Stored usernames are namespaced per org ("jdoe.kwsc"); the plain
            // name lives in displayUsername. Allow "-" because org slugs may contain it.
            username({ usernameValidator: (value) => /^[a-z0-9_.-]+$/.test(value) }),
            organization({
                allowUserToCreateOrganization: false,
                organizationHooks: {
                    // Registers the module rows and makes the creator a GIS admin.
                    afterCreateOrganization: async ({ organization, user }) => {
                        await provisionOrganization(db, {
                            organizationId: organization.id,
                            ownerUserId: user.id,
                        });
                    },
                },
            }),
            expo(),
        ],

        databaseHooks: {
            session: {
                create: {
                    // Sessions start without an active org. Assume one org per user
                    // for now and activate it; revisit if users can belong to several.
                    before: async (session) => {
                        const [m] = await db
                            .select({ organizationId: schema.member.organizationId })
                            .from(schema.member)
                            .where(eq(schema.member.userId, session.userId))
                            .limit(1);
                        return { data: { ...session, activeOrganizationId: m?.organizationId ?? null } };
                    },
                },
            },
        },
    });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __majimapAuth?: Auth };

/** Lazy singleton: getDb() throws without DATABASE_URL, which must not happen at import/build time. */
export function getAuth(): Auth {
    if (!globalForAuth.__majimapAuth) globalForAuth.__majimapAuth = createAuth(getDb());
    return globalForAuth.__majimapAuth;
}