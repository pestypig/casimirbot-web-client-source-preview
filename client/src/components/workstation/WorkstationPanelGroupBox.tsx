import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import { WorkstationPanelHost } from "@/components/workstation/WorkstationPanelHost";
import { WorkstationPanelTabs } from "@/components/workstation/WorkstationPanelTabs";
import { WorkstationPathBar } from "@/components/workstation/WorkstationPathBar";

function WorkstationEmptyGroup() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center p-4 text-sm text-slate-400">
      Open a panel from Ask, Start, or the + picker.
    </div>
  );
}

export function WorkstationPanelGroupBox({ groupId }: { groupId: string }) {
  const group = useWorkstationLayoutStore((state) => state.groups[groupId]);
  const activePanelId = group?.activePanelId;

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col rounded-xl border border-white/10 bg-slate-950/60">
      <WorkstationPanelTabs groupId={groupId} />
      <WorkstationPathBar groupId={groupId} activePanelId={activePanelId} />
      <div className="min-h-0 flex-1 overflow-hidden">
        {activePanelId ? <WorkstationPanelHost panelId={activePanelId} /> : <WorkstationEmptyGroup />}
      </div>
    </section>
  );
}
