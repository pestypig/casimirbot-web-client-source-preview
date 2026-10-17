import { Button } from "@/components/ui/button";
import type { HardwareFeedsController } from "@/hooks/useHardwareFeeds";
import { HardwareConnectModal } from "./HardwareConnectModal";

type Props = {
  controller: HardwareFeedsController;
  buttonClassName?: string;
};

export function HardwareConnectButton({ controller, buttonClassName }: Props) {
  const indicator =
    controller.isLive && controller.status.level === "ok" ? (
      <span className="ml-2 inline-flex h-2 w-2 items-center justify-center">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
      </span>
    ) : null;

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => controller.setOpen(true)}
        className={buttonClassName}
      >
        Hardware&nbsp;Connect
        {indicator}
      </Button>
      {controller.open ? <HardwareConnectModal controller={controller} /> : null}
    </>
  );
}

export default HardwareConnectButton;

