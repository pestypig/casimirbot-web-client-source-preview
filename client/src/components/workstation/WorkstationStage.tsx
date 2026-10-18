import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import { WorkstationPanelGroupBox } from "@/components/workstation/WorkstationPanelGroupBox";

export function WorkstationStage({
  layoutVariant = "desktop",
}: {
  layoutVariant?: "desktop" | "mobile";
}) {
  const root = useWorkstationLayoutStore((state) => state.root);
  const stagePadding = layoutVariant === "mobile" ? "p-2 pb-0" : "p-3";

  return (
    <main className={`h-full min-h-0 min-w-0 overflow-hidden ${stagePadding}`}>
      <WorkstationPanelGroupBox groupId={root.groupId} />
    </main>
  );
}
