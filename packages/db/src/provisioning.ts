import type { Database } from "./client";
import { MODULE_KEYS, organizationModules, type ModuleKey, gisUserRoles } from "./schema";

/**
 * Give a new organization its module registry and make its creator a GIS
 * admin. Safe to call twice: existing rows are left exactly as they are, so a
 * retried hook can't undo a role or flag someone has since changed.
 *
 * Only GIS is on by default — the other modules are registered but off.
 * Other members get NO GIS role from this: someone has to grant it.
 */
export async function provisionOrganization(
    db: Database,
    args: { organizationId: string; ownerUserId: string; enabledModules?: readonly ModuleKey[] },
) {
    const enabled = new Set<ModuleKey>(args.enabledModules ?? ["gis"]);
    await db.transaction(async (tx) => {
        await tx
            .insert(organizationModules)
            .values(
                MODULE_KEYS.map((moduleKey) => ({
                    organizationId: args.organizationId,
                    moduleKey,
                    enabled: enabled.has(moduleKey),
                    enabledAt: enabled.has(moduleKey) ? new Date() : null,
                })),
            )
            .onConflictDoNothing();

        if (enabled.has("gis")) {
            await tx
                .insert(gisUserRoles)
                .values({ organizationId: args.organizationId, userId: args.ownerUserId, role: "admin" })
                .onConflictDoNothing();
        }
    });
}