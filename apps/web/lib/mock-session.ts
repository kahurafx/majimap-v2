import { mockUsers } from "@/lib/mock-data";

/**
 * Stand-in for the Better-Auth session until auth is wired up. Swap this
 * for a real `useSession()` / server-side session read later — nothing
 * else in the UI should need to change since it consumes the same
 * `User` shape from @majimap/shared-types.
 */
export const currentUser = mockUsers.find((u) => u.id === "u-admin-1")!;
