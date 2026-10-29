import {AppSidebar} from "@/components/layout/sidebar";
import {SidebarInset, SidebarProvider, SidebarTrigger} from "@/components/ui/sidebar";
import React from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
      <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
              <SidebarTrigger className="m-2 md:hidden" />
              {children}
          </SidebarInset>
      </SidebarProvider>
  );
}