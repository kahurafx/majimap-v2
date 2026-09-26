"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
    LayoutDashboard,
    Map,
    Boxes,
    FileBarChart,
    Bell,
    Settings,
    Moon,
    Sun,
    Droplet,
    LogOut,
    ChevronsUpDown,
} from "lucide-react";

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuBadge,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
} from "@/components/ui/sidebar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { mockUsers } from "@/lib/mock-data";

const NAV_ITEMS = [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { title: "Map", href: "/map", icon: Map },
    { title: "Assets", href: "/assets", icon: Boxes },
    { title: "Reports", href: "/reports", icon: FileBarChart },
    { title: "Alerts", href: "/alerts", icon: Bell, badge: "3" },
];

// Stand-in for the session user until auth is wired up.
const currentUser = mockUsers.find((u) => u.role === "admin") ?? mockUsers[0];

function initials(name: string) {
    return name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

export function AppSidebar() {
    const pathname = usePathname();
    const { resolvedTheme, setTheme } = useTheme();

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader>
                <div className="flex items-center gap-2 px-2 py-1.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Droplet className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-semibold group-data-[collapsible=icon]:hidden">Conduit</span>
                </div>
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {NAV_ITEMS.map((item) => (
                                <SidebarMenuItem key={item.href}>
                                    <SidebarMenuButton asChild isActive={pathname?.startsWith(item.href)} tooltip={item.title}>
                                        <Link href={item.href}>
                                            <item.icon />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                    {item.badge && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} tooltip="Toggle theme">
                            {resolvedTheme === "dark" ? <Sun /> : <Moon />}
                            <span>{resolvedTheme === "dark" ? "Light mode" : "Dark mode"}</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <SidebarMenuButton size="lg">
                                    <Avatar className="h-6 w-6">
                                        <AvatarFallback className="text-[10px]">{initials(currentUser.name)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex flex-col text-left leading-tight group-data-[collapsible=icon]:hidden">
                                        <span className="text-xs font-medium">{currentUser.name}</span>
                                        <span className="text-[11px] capitalize text-muted-foreground">{currentUser.role.replace("_", " ")}</span>
                                    </div>
                                    <ChevronsUpDown className="ml-auto h-3.5 w-3.5 text-muted-foreground group-data-[collapsible=icon]:hidden" />
                                </SidebarMenuButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side="top" align="start" className="w-56">
                                <DropdownMenuLabel className="font-normal">
                                    <p className="text-xs font-medium">{currentUser.name}</p>
                                    <p className="text-xs text-muted-foreground">{currentUser.email ?? currentUser.username}</p>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                    <Link href="/settings">
                                        <Settings className="mr-2 h-4 w-4" />
                                        Settings
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Sign out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>

            <SidebarRail />
        </Sidebar>
    );
}