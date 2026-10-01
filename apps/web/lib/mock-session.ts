import { mockUsers } from "@/lib/mock-data";
import type { Organization } from "@majimap/shared-types";

/**
 * Stand-ins for the Better-Auth session and active organization until auth
 * and multi-tenancy are wired up. Swap these for a real `useSession()` /
 * server-side session read later — nothing else in the UI should need to
 * change since it consumes the same `User`/`Organization` shapes from
 * @majimap/shared-types.
 */
export const currentUser = mockUsers.find((u) => u.id === "u-admin-1")!;

export const mockOrganizations: Organization[] = [
    { id: "org-1", name: "Nairobi Water & Sewerage Co.", slug: "nairobi-water" },
    { id: "org-2", name: "Kisumu Water Company", slug: "kisumu-water" },
];

export const currentOrganization = mockOrganizations[0];