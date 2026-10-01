"use client";

import {useState} from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useTheme} from "next-themes";
import {toast} from "sonner";
import {
    Moon,
    Sun,
    Droplet,
    LogOut,
    Settings,
    ChevronsUpDown,
    Building2,
    Check,
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
import {Avatar, AvatarFallback} from "@/components/ui/avatar";
import {currentUser, currentOrganization, mockOrganizations} from "@/lib/mock-session";
import {NAV_ITEMS} from "./nav-items";
import type {Organization} from "@majimap/shared-types";

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
    const {resolvedTheme, setTheme} = useTheme();
    const [activeOrg, setActiveOrg] = useState<Organization>(currentOrganization);

    const visibleNavItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(currentUser.role));

    function handleSwitchOrg(org: Organization) {
        setActiveOrg(org);
        toast.info(`Switched to ${org.name}`, {
            description: "Display only for now — organization-scoped data isn't wired up yet.",
        });
    }

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <DropdownMenu>
                            <DropdownMenuTrigger render={<SidebarMenuButton size="lg"/>}>
                                <div
                                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                                    <Droplet className="h-4 w-4"/>
                                </div>
                                <div
                                    className="flex flex-col text-left leading-tight group-data-[collapsible=icon]:hidden">
                                    <span className="text-sm font-semibold">Conduit</span>
                                    <span className="truncate text-[11px] text-muted-foreground">{activeOrg.name}</span>
                                </div>
                                <ChevronsUpDown
                                    className="ml-auto h-3.5 w-3.5 text-muted-foreground group-data-[collapsible=icon]:hidden"/>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-64">
                                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                                    Organization
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator/>
                                {mockOrganizations.map((org) => (
                                    <DropdownMenuItem key={org.id} onClick={() => handleSwitchOrg(org)}>
                                        <Building2 className="h-4 w-4"/>
                                        <span className="flex-1 truncate">{org.name}</span>
                                        {org.id === activeOrg.id && <Check className="h-4 w-4 text-primary"/>}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {visibleNavItems.map((item) => (
                                <SidebarMenuItem key={item.href}>
                                    <SidebarMenuButton
                                        render={<Link href={item.href}/>}
                                        isActive={pathname?.startsWith(item.href)}
                                        tooltip={item.label}
                                    >
                                        <item.icon/>
                                        <span>{item.label}</span>
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
                        <SidebarMenuButton
                            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                            tooltip="Toggle theme"
                            render={
                                <>
                                    {resolvedTheme === "dark" ? <Sun/> : <Moon/>}
                                    <span>{resolvedTheme === "dark" ? "Light mode" : "Dark mode"}</span>
                                </>
                            }/>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                        <DropdownMenu>
                            <DropdownMenuTrigger render={<SidebarMenuButton size="lg"/>}>
                                <Avatar className="h-6 w-6">
                                    <AvatarFallback
                                        className="text-[10px]">{initials(currentUser.name)}</AvatarFallback>
                                </Avatar>
                                <div
                                    className="flex flex-col text-left leading-tight group-data-[collapsible=icon]:hidden">
                                    <span className="text-xs font-medium">{currentUser.name}</span>
                                    <span
                                        className="text-[11px] capitalize text-muted-foreground">{currentUser.role.replace("_", " ")}</span>
                                </div>
                                <ChevronsUpDown
                                    className="ml-auto h-3.5 w-3.5 text-muted-foreground group-data-[collapsible=icon]:hidden"/>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side="top" align="start" className="w-56">
                                <DropdownMenuLabel className="font-normal">
                                    <p className="text-xs font-medium">{currentUser.name}</p>
                                    <p className="text-xs text-muted-foreground">{currentUser.email ?? currentUser.username}</p>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator/>
                                <DropdownMenuItem render={<Link href="/settings"/>}>
                                    <Settings className="h-4 w-4"/>
                                    Settings
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                    <LogOut className="h-4 w-4"/>
                                    Sign out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>

            <SidebarRail/>
        </Sidebar>
    );
}