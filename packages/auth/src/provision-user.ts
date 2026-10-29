import { getDb, schema } from "@majimap/db";
import type { Role } from "@majimap/shared-types";
import { getAuth } from "./auth";

export const namespacedUsername = (username: string, orgSlug: string) =>
    `${username.trim().toLowerCase()}.${orgSlug}`;

/**
 * Server-side only. Creates a username-only login (synthetic email), adds
 * them to the org, and optionally grants a GIS role, all in one transaction.
 * Writes the Better Auth tables directly so it doesn't depend on
 * internalAdapter's signatures, which change between versions.
 */
export async function createFieldUser(args: {
    organizationId: string;
    orgSlug: string;
    username: string;
    name: string;
    password: string;
    orgRole?: "member" | "admin";
    gisRole?: Role;
}) {

    const ctx = await getAuth().$context;
    const stored = namespacedUsername(args.username, args.orgSlug);
    const passwordHash = await ctx.password.hash(args.password);
    const now = new Date();
    const userId = crypto.randomUUID();

    await getDb().transaction(async (tx) => {
        await tx.insert(schema.user).values({
            id: userId,
            name: args.name,
            email: `${stored}@users.invalid`,
            emailVerified: true,
            username: stored,
            displayUsername: args.username.trim(),
            createdAt: now,
            updatedAt: now,
        });

        // Credential account: this is where Better Auth looks up the password.
        await tx.insert(schema.account).values({
            id: crypto.randomUUID(),
            userId,
            accountId: userId,
            providerId: "credential",
            password: passwordHash,
            createdAt: now,
            updatedAt: now,
        });

        await tx.insert(schema.member).values({
            id: crypto.randomUUID(),
            organizationId: args.organizationId,
            userId,
            role: args.orgRole ?? "member",
            createdAt: now,
        });

        if (args.gisRole) {
            await tx
                .insert(schema.gisUserRoles)
                .values({ organizationId: args.organizationId, userId, role: args.gisRole })
                .onConflictDoUpdate({
                    target: [schema.gisUserRoles.organizationId, schema.gisUserRoles.userId],
                    set: { role: args.gisRole },
                });
        }
    });

    return { id: userId, username: stored };
}