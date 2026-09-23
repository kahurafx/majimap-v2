import { Topbar } from "@/components/layout/topbar";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { ConditionTrendChart } from "@/components/dashboard/condition-trend-chart";
import { AttentionTable } from "@/components/dashboard/attention-table";
import { TechnicianActivity } from "@/components/dashboard/technician-activity";

export default function DashboardPage() {
  return (
    <>
      <Topbar title="Reports" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <SummaryCards />
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <ConditionTrendChart />
            <TechnicianActivity />
          </div>
          <AttentionTable />
        </div>
      </main>
    </>
  );
}
