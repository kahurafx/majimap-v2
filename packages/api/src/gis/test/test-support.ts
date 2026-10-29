import assert from "node:assert/strict";
import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
    gisUserRoles,
    organization,
    organizationModules,
    schema,
    seedStructureAttachmentRules,
    user,
    type Database,
} from "@majimap/db";
import type { Session } from "../../context";
import { createCaller } from "../../router";

/** Assert a call fails with a specific tRPC error code — and say what it did instead if it doesn't. */
export async function expectCode(promise: Promise<unknown>, code: TRPCError["code"]) {
    try {
        await promise;
    } catch (err) {
        assert.ok(err instanceof TRPCError, `expected a TRPCError but got: ${String(err)}`);
        assert.equal(err.code, code, `${err.code}: ${err.message}`);
        return;
    }
    assert.fail(`expected ${code} but the call succeeded`);
}

/**
 * Two organizations with the GIS module on, and in the first: an admin, a
 * field technician and a viewer; in the second: an admin ("outsider"). Every
 * name carries a per-run suffix so concurrent or repeated runs never collide —
 * and nothing is cleaned up afterwards, so point TEST_DATABASE_URL at a
 * throwaway database.
 */
export async function setupTestEnv() {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error("TEST_DATABASE_URL is not set");

    const run = createId().slice(0, 8);
    const id = (name: string) => `${name}_${run}`;
    const orgA = id("orgA");
    const orgB = id("orgB");
    const users = { admin: id("uadmin"), tech: id("utech"), viewer: id("uviewer"), outsider: id("uoutsider") };

    const pool = new Pool({ connectionString: url });
    const db: Database = drizzle(pool, { schema });

    await db.insert(organization).values([
        { id: orgA, name: "Org A", slug: orgA },
        { id: orgB, name: "Org B", slug: orgB },
    ]);
    await db
        .insert(user)
        .values(Object.entries(users).map(([key, userId]) => ({ id: userId, name: key, email: `${userId}@test.local` })));
    await db.insert(organizationModules).values([
        { organizationId: orgA, moduleKey: "gis", enabled: true },
        { organizationId: orgB, moduleKey: "gis", enabled: true },
    ]);
    await db.insert(gisUserRoles).values([
        { organizationId: orgA, userId: users.admin, role: "admin" },
        { organizationId: orgA, userId: users.tech, role: "field_technician" },
        { organizationId: orgA, userId: users.viewer, role: "viewer" },
        { organizationId: orgB, userId: users.outsider, role: "admin" },
    ]);
    await seedStructureAttachmentRules(db);

    const as = (userId: string, organizationId: string | null = orgA) => {
        const session: Session = { userId, organizationId };
        return createCaller({ db, session });
    };

    return {
        db,
        pool,
        run,
        id,
        orgA,
        orgB,
        users,
        as,
        anonymous: () => createCaller({ db, session: null }),
        admin: () => as(users.admin),
        tech: () => as(users.tech),
        viewer: () => as(users.viewer),
        outsider: () => as(users.outsider, orgB),
        close: () => pool.end(),
    };
}

export type TestEnv = Awaited<ReturnType<typeof setupTestEnv>>;