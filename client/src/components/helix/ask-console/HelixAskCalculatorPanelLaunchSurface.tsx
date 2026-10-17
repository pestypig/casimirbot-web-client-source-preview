export type HelixAskCalculatorPanelLaunchSurfaceProps = {
  visible: boolean;
  onOpen: () => void;
};

export function HelixAskCalculatorPanelLaunchSurface({
  visible,
  onOpen,
}: HelixAskCalculatorPanelLaunchSurfaceProps) {
  if (!visible) return null;
  return (
    <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-calculator-panel-launch-surface.open-calculator-panel"
      type="button"
      className="text-[10px] uppercase tracking-[0.2em] text-emerald-300 hover:text-emerald-200"
      onClick={onOpen}
    >
      Open Calculator Panel
    </button>
  );
}
