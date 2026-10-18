// @vitest-environment jsdom

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useInterfaceText } from "@/lib/i18n/interfaceText";

function InterfaceTextProbe({ language }: { language: string }) {
  const { t } = useInterfaceText(language);
  return <div data-testid="interface-message">{t("account.language.interfaceLabel")}</div>;
}

describe("runtime interface catalogs", () => {
  it("loads only the selected catalog and never renders the previous language after a switch", async () => {
    const view = render(<InterfaceTextProbe language="haw" />);
    await waitFor(() => {
      expect(screen.getByTestId("interface-message").textContent).toBe("ʻŌlelo no ke alo");
    });

    view.rerender(<InterfaceTextProbe language="es" />);
    expect(screen.getByTestId("interface-message").textContent).not.toBe("ʻŌlelo no ke alo");
    await waitFor(() => {
      expect(screen.getByTestId("interface-message").textContent).toBe("Idioma de la interfaz");
    });
  });
});
