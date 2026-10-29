import assert from "node:assert/strict";
import {after, before, describe, it} from "node:test";
import {createId} from "@paralleldrive/cuid2";
import {eq} from "drizzle-orm";
import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import type {Database} from "./client";
import {provisionOrganization} from "./provisioning";
import * as schema from "./schema";

const url = process.env.TEST_DATABASE_URL;

describe("provisionOrganization", {skip: !url}, () => {
    const run = createId().slice(0, 8);
    const owner = `owner_${run}`;
    let pool: Pool;
    let db: Database;

    before(async () => {
        pool = new Pool({connectionString: url});
        db = drizzle(pool, {schema});
        await db.insert(schema.user).values({id: owner, name: "Owner", email: `${owner}@test.local`});
    });

    after(async () => {
        await pool.end();
    });

    async function newOrg(label: string) {
        const id = `org_${label}_${run}`;
        await db.insert(schema.organization).values({id, name: label, slug: id, createdAt: new Date()});
        return id;
    }

    const modulesOf = (orgId: string) =>
        db.select().from(schema.organizationModules).where(eq(schema.organizationModules.organizationId, orgId));
    const rolesOf = (orgId: string) =>
        db.select().from(schema.gisUserRoles).where(eq(schema.gisUserRoles.organizationId, orgId));

    it("registers every module and turns on only GIS", async () => {
        const orgId = await newOrg("defaults");
        await provisionOrganization(db, {organizationId: orgId, ownerUserId: owner});

        const rows = await modulesOf(orgId);
        assert.equal(rows.length, schema.MODULE_KEYS.length);
        const gis = rows.find((r) => r.moduleKey === "gis");
        assert.equal(gis?.enabled, true);
        assert.ok(gis?.enabledAt, "enabling records when");
        for (const row of rows.filter((r) => r.moduleKey !== "gis")) {
            assert.equal(row.enabled, false, `${row.moduleKey} should start off`);
            assert.equal(row.enabledAt, null);
        }
    });

    it("makes the creator a GIS admin", async () => {
        const orgId = await newOrg("owner");
        await provisionOrganization(db, {organizationId: orgId, ownerUserId: owner});
        const roles = await rolesOf(orgId);
        assert.equal(roles.length, 1);
        assert.deepEqual([roles[0]?.userId, roles[0]?.role], [owner, "admin"]);
    });

    it("is safe to run twice without duplicating anything", async () => {
        const orgId = await newOrg("twice");
        await provisionOrganization(db, {organizationId: orgId, ownerUserId: owner});
        await provisionOrganization(db, {organizationId: orgId, ownerUserId: owner});
        assert.equal((await modulesOf(orgId)).length, schema.MODULE_KEYS.length);
        assert.equal((await rolesOf(orgId)).length, 1);
    });

    it("leaves a role or flag that changed since alone when re-run", async () => {
        const orgId = await newOrg("preserve");
        await provisionOrganization(db, {organizationId: orgId, ownerUserId: owner});
        await db.update(schema.gisUserRoles).set({role: "gis_engineer"}).where(eq(schema.gisUserRoles.organizationId, orgId));
        await db.update(schema.organizationModules).set({enabled: false}).where(eq(schema.organizationModules.organizationId, orgId));

        await provisionOrganization(db, {organizationId: orgId, ownerUserId: owner});

        assert.equal((await rolesOf(orgId))[0]?.role, "gis_engineer");
        assert.ok((await modulesOf(orgId)).every((r) => r.enabled === false));
    });

    it("grants no GIS role when GIS isn't enabled", async () => {
        const orgId = await newOrg("nogis");
        await provisionOrganization(db, {organizationId: orgId, ownerUserId: owner, enabledModules: []});
        assert.equal((await rolesOf(orgId)).length, 0);
        assert.equal((await modulesOf(orgId)).find((r) => r.moduleKey === "gis")?.enabled, false);
    });
});