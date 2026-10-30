import { pgSchema } from "drizzle-orm/pg-core";

/**
 * A real Postgres schema, not just a naming convention — "gis" tables
 * live in their own namespace, matching the module-boundary rule that
 * module tables may reference core but never another module directly.
 */
export const gisSchema = pgSchema("gis");

export const nodeTypeEnum = gisSchema.enum("node_type", [
    "reservoir", "pumping_station", "valve", "junction", "meter", "hydrant",
]);

export const conditionEnum = gisSchema.enum("condition", [
    "good", "fair", "poor", "critical", "unknown",
]);

export const structureTypeEnum = gisSchema.enum("structure_type", [
    "vault", "chamber", "manhole", "kiosk", "trench",
]);

export const pipeMaterialEnum = gisSchema.enum("pipe_material", [
    "pvc", "ductile_iron", "hdpe", "steel", "concrete", "unknown",
]);

/** Distinct from Better Auth's org-membership role (owner/admin/member) — see gis/roles.ts for why. */
export const gisRoleEnum = gisSchema.enum("gis_role", [
    "admin", "gis_engineer", "field_technician", "viewer",
]);

export const junctionTypeEnum = gisSchema.enum("junction_type", [
    "tee", "cross", "elbow", "wye", "reducer"
]);