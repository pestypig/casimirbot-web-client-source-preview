import type { HelixAskSlashCommandMenuItem } from "./HelixAskSlashCommandCatalog";

export type HelixAskSlashCommandMenuState = {
  open: boolean;
  query: string;
  items: HelixAskSlashCommandMenuItem[];
  selectedIndex: number;
  selectedItem: HelixAskSlashCommandMenuItem | null;
};

export function filterHelixAskSlashCommandMenuItems(args: {
  items: HelixAskSlashCommandMenuItem[];
  query?: string | null;
}): HelixAskSlashCommandMenuItem[] {
  const query = args.query?.trim().toLowerCase() ?? "";
  if (!query) return args.items;
  return args.items.filter((item) => {
    const haystack = [
      item.command,
      item.label,
      item.capabilityId,
      item.description,
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

export function buildHelixAskSlashCommandMenuState(args: {
  open: boolean;
  query?: string | null;
  items: HelixAskSlashCommandMenuItem[];
  selectedIndex?: number | null;
}): HelixAskSlashCommandMenuState {
  const items = args.open
    ? filterHelixAskSlashCommandMenuItems({
        items: args.items,
        query: args.query,
      })
    : [];
  const selectedIndex = items.length > 0
    ? Math.max(0, Math.min(args.selectedIndex ?? 0, items.length - 1))
    : -1;
  return {
    open: args.open,
    query: args.query?.trim() ?? "",
    items,
    selectedIndex,
    selectedItem: selectedIndex >= 0 ? items[selectedIndex] ?? null : null,
  };
}

export function resolveHelixAskSlashCommandMenuKey(args: {
  key: string;
  open: boolean;
  selectedIndex: number;
  itemCount: number;
}): { handled: boolean; action: "none" | "close" | "insert" | "select"; selectedIndex: number } {
  if (!args.open) return { handled: false, action: "none", selectedIndex: args.selectedIndex };
  if (args.key === "Escape") return { handled: true, action: "close", selectedIndex: args.selectedIndex };
  if (args.key === "Enter" || args.key === "Tab") {
    return { handled: true, action: args.itemCount > 0 ? "insert" : "none", selectedIndex: args.selectedIndex };
  }
  if (args.key !== "ArrowUp" && args.key !== "ArrowDown") {
    return { handled: false, action: "none", selectedIndex: args.selectedIndex };
  }
  if (args.itemCount <= 0) {
    return { handled: true, action: "select", selectedIndex: -1 };
  }
  const delta = args.key === "ArrowUp" ? -1 : 1;
  const selectedIndex = (args.selectedIndex + delta + args.itemCount) % args.itemCount;
  return { handled: true, action: "select", selectedIndex };
}
