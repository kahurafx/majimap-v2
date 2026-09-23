import { z } from "zod";

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
