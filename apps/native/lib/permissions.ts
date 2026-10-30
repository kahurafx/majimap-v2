import type { Role } from "@majimap/shared-types";

/** Mirrors the server: GIS_WRITE_ROLES / GIS_DELETE_ROLES / reconcile POST_ROLES. */
export const can = {
    write: (r: Role) => r === "admin" || r === "gis_engineer" || r === "field_technician",
    delete: (r: Role) => r === "admin" || r === "gis_engineer",
    review: (r: Role) => r === "admin" || r === "gis_engineer",
};

export const ROLE_LABEL: Record<Role, string> = {
    admin: "Admin",
    gis_engineer: "GIS engineer",
    field_technician: "Field technician",
    viewer: "Viewer",
};

export const ROLE_ABILITIES: Record<Role, string[]> = {
    admin: ["View the whole network", "Record inspections and operate valves", "Add, edit and delete assets", "Review and post field changes"],
    gis_engineer: ["View the whole network", "Record inspections and operate valves", "Add, edit and delete assets", "Review and post field changes"],
    field_technician: ["View the whole network", "Record inspections and operate valves", "Add and edit assets", "Your changes are reviewed before they go live"],
    viewer: ["View the network and its history"],
};
