import { Topbar } from "@/components/layout/topbar";
import { NetworkMap } from "@/components/map/network-map";

export default function MapPage() {
  return (
    <>
      <Topbar title="Network map" />
      <main className="relative flex-1 overflow-hidden">
        <NetworkMap />
      </main>
    </>
  );
}
