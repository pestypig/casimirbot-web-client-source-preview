import { describe, expect, it } from "vitest";
import { createInterfaceTextResolver } from "@/lib/i18n/interfaceText";
import { arMessages } from "@/lib/i18n/messages/ar";
import { deMessages } from "@/lib/i18n/messages/de";
import { interfaceSourceMessages, type InterfaceMessageId } from "@/lib/i18n/messages/source";

describe("Casimir Guide localization", () => {
  it("covers every Guide source message in both public target catalogs", () => {
    const guideIds = Object.keys(interfaceSourceMessages)
      .filter((id) => id.startsWith("casimirGuide.")) as InterfaceMessageId[];

    expect(guideIds.length).toBeGreaterThan(0);
    for (const id of guideIds) {
      expect(deMessages[id], `missing German Guide message: ${id}`).toBeTruthy();
      expect(arMessages[id], `missing Arabic Guide message: ${id}`).toBeTruthy();
    }
  });

  it("resolves localized navigation labels and interpolated active context", () => {
    const german = createInterfaceTextResolver("de", deMessages);
    const arabic = createInterfaceTextResolver("ar", arMessages);

    expect(german.t("casimirGuide.row.searchPanels")).toBe("Panels durchsuchen");
    expect(german.t("casimirGuide.row.resume", { title: "Notizen" })).toBe("Notizen fortsetzen");
    expect(arabic.t("casimirGuide.blade.workspace")).toBe("مساحة العمل");
    expect(arabic.t("casimirGuide.row.resume", { title: "الملاحظات" })).toBe("متابعة الملاحظات");
  });
});
