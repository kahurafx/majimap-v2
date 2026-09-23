"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Droplets } from "lucide-react";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { currentUser } from "@/lib/mock-session";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(currentUser.role));

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Droplets className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold tracking-tight">Majimap</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <p className="text-xs text-muted-foreground">Nairobi Water &amp; Sewerage Co.</p>
        <p className="text-xs text-muted-foreground">Service zone: Kileleshwa</p>
      </div>
    </aside>
  );
}
