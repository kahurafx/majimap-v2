import { initTRPC, TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {gisUserRoles, organizationModules, type ModuleKey, Database} from "@majimap/db";
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

/** Throws unless the module is switched on for the organization. Also usable from inside a procedure. */
export async function assertModuleEnabled(db: Database, orgId: string, moduleKey: ModuleKey) {
    const [row] = await db
        .select({ enabled: organizationModules.enabled })
        .from(organizationModules)
        .where(and(eq(organizationModules.organizationId, orgId), eq(organizationModules.moduleKey, moduleKey)))
        .limit(1);
    if (!row?.enabled) {
        throw new TRPCError({ code: "FORBIDDEN", message: `The ${moduleKey} module is not enabled for this organization` });
    }
}

/**
 * The caller's role in GIS. Not Better Auth's org-membership role — that
 * decides who can invite people and manage billing; this decides what
 * someone can do to the network.
 */
export async function loadGisRole(db: Database, orgId: string, userId: string): Promise<Role> {
    const [row] = await db
        .select({ role: gisUserRoles.role })
        .from(gisUserRoles)
        .where(and(eq(gisUserRoles.organizationId, orgId), eq(gisUserRoles.userId, userId)))
        .limit(1);
    if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "You have no role in the GIS module" });
    return row.role;
}

/**
 * Gate a whole router on a module being enabled for the caller's
 * organization. This is the mechanism behind "modules are optional":
 * every module's router is always registered (so types stay static), but
 * calling into a disabled one fails cleanly instead of touching its tables.
 */
export function moduleProcedure(moduleKey: ModuleKey) {
    return orgProcedure.use(async ({ ctx, next }) => {
        await assertModuleEnabled(ctx.db, ctx.organizationId, moduleKey);
        return next();
    });
}

/**
 * GIS module access plus the caller's GIS role. Not Better Auth's
 * org-membership role — that decides who can invite people and manage
 * billing; this decides what someone can do to the network.
 */
export const gisProcedure = moduleProcedure("gis").use(async ({ ctx, next }) => {
    const gisRole = await loadGisRole(ctx.db, ctx.organizationId, ctx.session.userId);
    return next({ ctx: { gisRole } });
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

/**
 * Work orders module access plus the caller's role.
 *
 * INTERIM: work orders borrow the GIS role until the module has roles of its
 * own (dispatcher, supervisor…). This is the only place that decides it, so
 * the swap is one line.
 */
export const workOrderProcedure = moduleProcedure("work_orders").use(async ({ ctx, next }) => {
    const woRole = await loadGisRole(ctx.db, ctx.organizationId, ctx.session.userId);
    return next({ ctx: { woRole } });
});

export function workOrderRoleProcedure(...allowed: Role[]) {
    return workOrderProcedure.use(({ ctx, next }) => {
        if (!allowed.includes(ctx.woRole)) {
            throw new TRPCError({ code: "FORBIDDEN", message: `This action requires one of: ${allowed.join(", ")}` });
        }
        return next();
    });
}