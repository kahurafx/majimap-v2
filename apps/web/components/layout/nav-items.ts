import type { Role } from "@majimap/shared-types";
import { LayoutDashboard, Map, Boxes, FileBarChart, Bell, Users, Network, MapPinned } from "lucide-react";
import { mockNodes, mockPipes } from "@/lib/mock-data";

export interface NavItem {
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    /** Roles allowed to see this item. Omit to allow everyone. */
    roles?: Role[];
    /** Computed from mock data for now — swap for a live count once a real alerts feed exists. */
    badge?: string;
}

const criticalAssetCount =
    mockNodes.filter((n) => n.condition === "critical").length +
    mockPipes.filter((p) => p.condition === "critical").length;

export const NAV_ITEMS: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/map", label: "Network map", icon: Map },
    { href: "/tiers", label: "Tiers", icon: Network, roles: ["admin", "gis_engineer"] },
    { href: "/dmas", label: "DMAs", icon: MapPinned },
    { href: "/assets", label: "Assets", icon: Boxes },
    { href: "/reports", label: "Reports", icon: FileBarChart },
    {
        href: "/alerts",
        label: "Alerts",
        icon: Bell,
        badge: criticalAssetCount > 0 ? String(criticalAssetCount) : undefined,
    },
    { href: "/admin/users", label: "Users", icon: Users, roles: ["admin"] },
];