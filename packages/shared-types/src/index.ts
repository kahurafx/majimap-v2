import {z} from "zod";

// ORGANIZATION SCHEMA
export const OrganizationSchema = z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
});
export type Organization = z.infer<typeof OrganizationSchema>;

/**
 * Roles enforced in tRPC middleware (primary) and mirrored into
 * Postgres RLS via `app.current_role` (defense-in-depth).
 */
export const RoleSchema = z.enum([
    "admin",
    "gis_engineer",
    "field_technician",
    "viewer",
]);
export type Role = z.infer<typeof RoleSchema>;

export const NodeTypeSchema = z.enum([
    "reservoir",
    "pumping_station",
    "valve",
    "junction",
    "meter",
    "hydrant",
]);
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const ConditionSchema = z.enum([
    "good",
    "fair",
    "poor",
    "critical",
    "unknown",
]);
export type Condition = z.infer<typeof ConditionSchema>;

/**
 * Canonical condition → color mapping, shared by web (map layers, badges)
 * and native (map layers, popup badges) so the two don't drift again.
 */
export const CONDITION_HEX: Record<Condition, string> = {
    good: "#3f7a53",
    fair: "#c99a3a",
    poor: "#bb6a35",
    critical: "#a3453b",
    unknown: "#8b93a1",
};

export const PointSchema = z.object({
    lat: z.number(),
    lng: z.number(),
});
export type Point = z.infer<typeof PointSchema>;

export const NodeSchema = z.object({
    id: z.string(),
    type: NodeTypeSchema,
    name: z.string(),
    location: PointSchema,
    condition: ConditionSchema,
    // Only meaningful for valves; other node types leave this null.
    isOpen: z.boolean().nullable(),
    installedAt: z.string().datetime().nullable(),
    lastInspectedAt: z.string().datetime().nullable(),
    structureId: z.string().nullable(),
});
export type NetworkNode = z.infer<typeof NodeSchema>;

export const PipeSchema = z.object({
    id: z.string(),
    fromNodeId: z.string(),
    toNodeId: z.string(),
    path: z.array(PointSchema).min(2),
    material: z.enum(["pvc", "ductile_iron", "hdpe", "steel", "concrete", "unknown"]),
    diameterMm: z.number().positive(),
    condition: ConditionSchema,
    lengthM: z.number().positive(),
});
export type Pipe = z.infer<typeof PipeSchema>;

export const ValveStateLogSchema = z.object({
    id: z.string(),
    nodeId: z.string(),
    isOpen: z.boolean(),
    changedAt: z.string().datetime(),
    changedByUserId: z.string(),
    syncedAt: z.string().datetime().nullable(),
});
export type ValveStateLog = z.infer<typeof ValveStateLogSchema>;

export const ConditionLogSchema = z.object({
    id: z.string(),
    nodeId: z.string().nullable(),
    pipeId: z.string().nullable(),
    condition: ConditionSchema,
    note: z.string().nullable(),
    recordedAt: z.string().datetime(),
    recordedByUserId: z.string(),
    syncedAt: z.string().datetime().nullable(),
}).refine((v) => (v.nodeId === null) !== (v.pipeId === null), {
    message: "Exactly one of nodeId/pipeId must be set",
});
export type ConditionLog = z.infer<typeof ConditionLogSchema>;

export const UserSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email().nullable(),
    username: z.string().nullable(),
    role: RoleSchema,
    isActive: z.boolean(),
    lastSyncedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const AssetPhotoSchema = z.object({
    id: z.string(),
    nodeId: z.string().nullable(),
    pipeId: z.string().nullable(),
    storagePath: z.string(),
    takenAt: z.string().datetime(),
    uploadedByUserId: z.string(),
});
export type AssetPhoto = z.infer<typeof AssetPhotoSchema>;

export const StructureTypeSchema = z.enum([
    "vault",
    "chamber",
    "manhole",
    "kiosk",
    "trench",
]);
export type StructureType = z.infer<typeof StructureTypeSchema>;

export const StructureSchema = z.object({
    id: z.string(),
    type: StructureTypeSchema,
    name: z.string(),
    location: PointSchema,
    condition: ConditionSchema,
    installedAt: z.string().datetime().nullable(),
    lastInspectedAt: z.string().datetime().nullable(),
});
export type Structure = z.infer<typeof StructureSchema>;

/**
 * Which node types may be housed in which structure types — the
 * "structural attachment rules" requirement, made concrete. This is the
 * single source both the add-asset form and (later) the DB-level
 * constraint check against, so they can't drift apart.
 */
export const STRUCTURE_ATTACHMENT_RULES: Record<NodeType, StructureType[]> = {
    reservoir: [],
    pumping_station: [],
    valve: ["vault", "chamber", "manhole"],
    junction: ["manhole"],
    meter: ["chamber", "kiosk", "manhole"],
    hydrant: [],
};

export const TierSchema = z.object({
    id: z.string(),
    name: z.string(),
    order: z.number().int(),
});
export type Tier = z.infer<typeof TierSchema>;

export const SubnetworkSchema = z.object({
    id: z.string(),
    name: z.string(),
    tierId: z.string(),
    controllerNodeId: z.string(),
    lastValidatedAt: z.string().datetime().nullable(),
});
export type Subnetwork = z.infer<typeof SubnetworkSchema>;

export const DmaSchema = z.object({
    id: z.string(),
    name: z.string(),
    color: z.string(),
    tierId: z.string(),
    /** The primary supply meter — also the trace controller for computing membership. */
    inletMeterId: z.string(),
    /** Valves that should be closed to seal this DMA off from the rest of the network. */
    boundaryValveIds: z.array(z.string()),
    ring: z.array(PointSchema),
});
export type Dma = z.infer<typeof DmaSchema>;