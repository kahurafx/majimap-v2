"use client";

import { useMemo, useState } from "react";
import { MoreHorizontal, UserPlus } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTableShell } from "@/components/tables/data-table-shell";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { columnHelperFor } from "@/lib/table/features";
import { useAppTable } from "@/lib/table/use-app-table";
import { mockUsers } from "@/lib/mock-data";
import { timeSince } from "@/lib/utils";
import type { Role, User } from "@majimap/shared-types";

const ROLE_LABEL: Record<Role, string> = {
    admin: "Admin",
    gis_engineer: "GIS engineer",
    field_technician: "Field technician",
    viewer: "Viewer",
};

const userColumnHelper = columnHelperFor<User>();

export default function AdminUsersPage() {
    const [users, setUsers] = useState<User[]>(mockUsers);
    const [inviteOpen, setInviteOpen] = useState(false);

    function setRole(id: string, role: Role) {
        setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    }

    function toggleActive(id: string) {
        setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, isActive: !u.isActive } : u)));
    }

    // Columns close over setRole/toggleActive, so they're built once via
    // useMemo rather than as a module-level constant like the read-only
    // tables above.
    const columns = useMemo(
        () =>
            userColumnHelper.columns([
                userColumnHelper.accessor("name", {
                    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
                    cell: ({ row }) => (
                        <div>
                            <p className="font-medium text-foreground">{row.original.name}</p>
                            <p className="font-data text-xs text-muted-foreground">{row.original.email ?? row.original.username}</p>
                        </div>
                    ),
                }),
                userColumnHelper.accessor("role", {
                    header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
                    cell: ({ row }) => (
                        <Select value={row.original.role} onValueChange={(v) => setRole(row.original.id, v as Role)}>
                            <SelectTrigger className="h-8 w-40 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                                    <SelectItem key={r} value={r}>
                                        {ROLE_LABEL[r]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ),
                }),
                userColumnHelper.accessor("isActive", {
                    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
                    cell: ({ getValue }) => (
                        <Badge variant={getValue() ? "good" : "unknown"}>{getValue() ? "Active" : "Deactivated"}</Badge>
                    ),
                }),
                userColumnHelper.accessor("lastSyncedAt", {
                    header: ({ column }) => <DataTableColumnHeader column={column} title="Last active" />,
                    cell: ({ getValue }) => <span className="font-data text-xs text-muted-foreground">{timeSince(getValue())}</span>,
                }),
                userColumnHelper.display({
                    id: "actions",
                    cell: ({ row }) => (
                        <DropdownMenu>
                            <DropdownMenuTrigger>
                                <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Manage account</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => toggleActive(row.original.id)}>
                                    {row.original.isActive ? "Deactivate account" : "Reactivate account"}
                                </DropdownMenuItem>
                                <DropdownMenuItem>Reset password</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ),
                }),
            ]),
        [],
    );

    const table = useAppTable({ key: "admin-users", columns, data: users });

    return (
        <>
            <Topbar title="Users" />
            <main className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto flex max-w-5xl flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            The organization admin account signs in by email. Technicians and other internal staff sign in with a
                            username and password created here.
                        </p>
                        <Button onClick={() => setInviteOpen(true)}>
                            <UserPlus className="h-4 w-4" /> Create login
                        </Button>
                    </div>
                    <Card>
                        <CardContent className="pt-4">
                            <DataTableShell table={table} filterPlaceholder="Search users..." />
                        </CardContent>
                    </Card>
                </div>
            </main>

            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create a staff login</DialogTitle>
                        <DialogDescription>
                            Creates a username/password account for a technician or internal staff member. Admin accounts use
                            email instead — manage those from your own account settings.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(e) => {
                            e.preventDefault();
                            setInviteOpen(false);
                        }}
                    >
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="new-name">Full name</Label>
                            <Input id="new-name" placeholder="e.g. Faith Wambui" required />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="new-username">Username</Label>
                            <Input id="new-username" placeholder="f.wambui" required />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label>Role</Label>
                            <Select defaultValue="field_technician">
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="field_technician">Field technician</SelectItem>
                                    <SelectItem value="gis_engineer">GIS engineer</SelectItem>
                                    <SelectItem value="viewer">Viewer</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="new-password">Temporary password</Label>
                            <Input id="new-password" type="password" required />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit">Create login</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}