import { initTRPC, TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { gisUserRoles, organizationModules, type ModuleKey } from "@majimap/db";
import type { Role } from "@majimap/shared-types";
import type { Context } from "./context";

// We create a context which will have context = {db , session} where session = {userId, orgId}
const t = initTRPC.context<Context>().create();

export const router = t.router;

// To be able to test without an actual Db
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/** Must be signed in. */
const requireSession = t.middleware(({ ctx, next }) => {
    if (!ctx.session) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not signed in" });
    }
    return next({ ctx: { session: ctx.session } });
});

/** Signed in AND acting within an organization — every tenant-scoped query builds on this. */
export const orgProcedure = publicProcedure.use(requireSession).use(({ ctx, next }) => {
    if (!ctx.session.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No active organization" });
    }
    return next({ ctx: { organizationId: ctx.session.organizationId } });
});

/**
 * Gate a whole router on a module being enabled for the caller's
 * organization. This is the mechanism behind "modules are optional":
 * every module's router is always registered (so types stay static), but
 * calling into a disabled one fails cleanly instead of touching its tables.
 */
export function moduleProcedure(moduleKey: ModuleKey) {
    return orgProcedure.use(async ({ ctx, next }) => {
        const [row] = await ctx.db
            .select({ enabled: organizationModules.enabled })
            .from(organizationModules)
            .where(
                and(
                    eq(organizationModules.organizationId, ctx.organizationId),
                    eq(organizationModules.moduleKey, moduleKey),
                ),
            )
            .limit(1);
        if (!row?.enabled) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: `The ${moduleKey} module is not enabled for this organization`,
            });
        }
        return next();
    });
}

/**
 * GIS module access plus the caller's GIS role. Not Better Auth's
 * org-membership role — that decides who can invite people and manage
 * billing; this decides what someone can do to the network.
 */3
export const gisProcedure = moduleProcedure("gis").use(async ({ ctx, next }) => {
    const [row] = await ctx.db
        .select({ role: gisUserRoles.role })
        .from(gisUserRoles)
        .where(and(eq(gisUserRoles.organizationId, ctx.organizationId), eq(gisUserRoles.userId, ctx.session.userId)))
        .limit(1);
    if (!row) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You have no role in the GIS module" });
    }
    return next({ ctx: { gisRole: row.role } });
});

export function gisRoleProcedure(...allowed: Role[]) {
    return gisProcedure.use(({ ctx, next }) => {
        if (!allowed.includes(ctx.gisRole)) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: `This action requires one of: ${allowed.join(", ")}`,
            });
        }
        return next();
    });
}