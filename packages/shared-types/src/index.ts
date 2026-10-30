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


// JUNCTIONS
export const JunctionTypeSchema = z.enum(["tee", "cross", "elbow", "wye", "reducer"]);
export type JunctionType = z.infer<typeof JunctionTypeSchema>;

const SizeMm = z.number().int().positive().max(5000);

/** `branchSizeMm: null` means equal: the same size all the way through. */
export const JunctionSchema = z
    .object({ type: JunctionTypeSchema, mainSizeMm: SizeMm, branchSizeMm: SizeMm.nullable() })
    .refine((j) => j.branchSizeMm === null || j.branchSizeMm < j.mainSizeMm, {
        message: "The smaller size must be less than the main size",
        path: ["branchSizeMm"],
    })
    .refine((j) => j.type !== "reducer" || j.branchSizeMm !== null, {
        message: "A reducer must step down to a smaller size",
        path: ["branchSizeMm"],
    });
export type JunctionSpec = z.infer<typeof JunctionSchema>;


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
    isOpen: z.boolean().nullable(),
    installedAt: z.iso.datetime({ offset: true }).nullable(),
    lastInspectedAt: z.iso.datetime({ offset: true }).nullable(),
    structureId: z.string().nullable(),
    junction: JunctionSchema.nullable().optional(),
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
    changedAt: z.iso.datetime({ offset: true }),
    changedByUserId: z.string(),
    syncedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type ValveStateLog = z.infer<typeof ValveStateLogSchema>;

export const ConditionLogSchema = z.object({
    id: z.string(),
    nodeId: z.string().nullable(),
    pipeId: z.string().nullable(),
    condition: ConditionSchema,
    note: z.string().nullable(),
    recordedAt: z.iso.datetime({ offset: true }),
    recordedByUserId: z.string(),
    syncedAt: z.iso.datetime({ offset: true }).nullable(),
}).refine((v) => (v.nodeId === null) !== (v.pipeId === null), {
    message: "Exactly one of nodeId/pipeId must be set",
});
export type ConditionLog = z.infer<typeof ConditionLogSchema>;

export const UserSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.email().nullable(),
    username: z.string().nullable(),
    role: RoleSchema,
    isActive: z.boolean(),
    lastSyncedAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
});
export type User = z.infer<typeof UserSchema>;

export const AssetPhotoSchema = z.object({
    id: z.string(),
    nodeId: z.string().nullable(),
    pipeId: z.string().nullable(),
    storagePath: z.string(),
    takenAt: z.iso.datetime({ offset: true }),
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
    installedAt: z.iso.datetime({ offset: true }).nullable(),
    lastInspectedAt: z.iso.datetime({ offset: true }).nullable(),
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
    lastValidatedAt: z.iso.datetime({ offset: true }).nullable(),
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

// PHOTOS AND ATTACHMENTS
export type PhotoRule = "required" | "optional";

/** Required where the asset is above ground and worth proving. The server enforces it when a branch is posted. */
export const NODE_PHOTO_RULE: Record<NodeType, PhotoRule> = {
    reservoir: "required",
    pumping_station: "required",
    meter: "required",
    valve: "optional",
    hydrant: "optional",
    junction: "optional",
};
export const STRUCTURE_PHOTO_RULE: PhotoRule = "optional";

export const ATTACHMENT_SUBJECTS = ["node", "pipe", "structure", "work_order"] as const;
export const AttachmentSubjectSchema = z.enum(ATTACHMENT_SUBJECTS);
export type AttachmentSubject = z.infer<typeof AttachmentSubjectSchema>;

export const ATTACHMENT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf", "text/plain", "text/csv"] as const;
export const ATTACHMENT_LIMITS = { photos: 5, files: 3, maxBytes: 10 * 1024 * 1024 } as const;

export const AttachmentSchema = z.object({
    id: z.string(),
    subjectType: AttachmentSubjectSchema,
    subjectId: z.string(),
    fileName: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int(),
    kind: z.enum(["photo", "document"]),
    status: z.enum(["pending", "uploaded"]),
    uploadedByUserId: z.string(),
    uploadedAt: z.iso.datetime({ offset: true }),
});
export type AttachmentDto = z.infer<typeof AttachmentSchema>;

// WORK ORDERS
export const WorkOrderKindSchema = z.enum(["leak", "inspection", "valve_replacement", "flushing"]);
export type WorkOrderKind = z.infer<typeof WorkOrderKindSchema>;

export const WorkOrderPrioritySchema = z.enum(["urgent", "high", "normal"]);
export type WorkOrderPriority = z.infer<typeof WorkOrderPrioritySchema>;

export const WorkOrderStatusSchema = z.enum(["pending", "in_progress", "blocked", "completed", "cancelled"]);
export type WorkOrderStatus = z.infer<typeof WorkOrderStatusSchema>;

export const WorkOrderOutcomeSchema = z.enum(["done", "partial", "no_fault"]);
export type WorkOrderOutcome = z.infer<typeof WorkOrderOutcomeSchema>;

/** A step with an action is done by recording an inspection or a valve operation against the job's asset. */
export const StepActionSchema = z.enum(["inspect", "valve"]);
export type StepAction = z.infer<typeof StepActionSchema>;

export const ChecklistStepSchema = z.object({
    id: z.string(),
    label: z.string(),
    done: z.boolean(),
    action: StepActionSchema.optional(),
});
export type ChecklistStep = z.infer<typeof ChecklistStepSchema>;

export const WorkOrderSchema = z.object({
    id: z.string(),
    code: z.string(),
    title: z.string(),
    kind: WorkOrderKindSchema,
    priority: WorkOrderPrioritySchema,
    status: WorkOrderStatusSchema,
    description: z.string(),
    source: z.string(),
    createdAt: z.iso.datetime({ offset: true }),
    dueAt: z.iso.datetime({ offset: true }),
    assetId: z.string().nullable(),
    /** Null for reports that arrived without a position (a leak called in). */
    location: PointSchema.nullable(),
    locationNote: z.string().nullable(),
    assignedToUserId: z.string().nullable(),
    checklist: z.array(ChecklistStepSchema),
    hold: z.object({ reason: z.string(), note: z.string(), at: z.iso.datetime({ offset: true }) }).optional(),
    completion: z
        .object({ at: z.iso.datetime({ offset: true }), outcome: WorkOrderOutcomeSchema, note: z.string(), photoCount: z.number().int() })
        .optional(),
});
export type WorkOrder = z.infer<typeof WorkOrderSchema>;