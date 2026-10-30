import { and, eq } from "drizzle-orm";
import { organizationModules } from "@majimap/db";
import { orgProcedure, router } from "./trpc";

export const modulesRouter = router({
    /** Which modules are on for this organization, so a client can hide what isn't (e.g. Work orders). */
    enabled: orgProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select({ key: organizationModules.moduleKey })
            .from(organizationModules)
            .where(and(eq(organizationModules.organizationId, ctx.organizationId), eq(organizationModules.enabled, true)));
        return rows.map((r) => r.key);
    }),
});