import type { Role } from "@majimap/shared-types";
import { LayoutDashboard, Map, Database, Users } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Roles allowed to see this item. Omit to allow everyone. */
  roles?: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Reports", icon: LayoutDashboard },
  { href: "/map", label: "Network map", icon: Map },
  { href: "/assets", label: "Assets", icon: Database },
  { href: "/admin/users", label: "Users", icon: Users, roles: ["admin"] },
];
