import {AppSidebar} from "@/components/layout/sidebar";
import {Toaster} from "sonner";
import {SidebarInset, SidebarProvider, SidebarTrigger} from "@/components/ui/sidebar";
import React from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
      <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
              <Toaster/>
              <SidebarTrigger className="m-2 md:hidden" />
              {children}
          </SidebarInset>
      </SidebarProvider>
  );
}