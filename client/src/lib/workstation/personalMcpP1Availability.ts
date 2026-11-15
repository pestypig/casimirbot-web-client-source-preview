export function personalMcpP1UnavailableMessage(phase: unknown): string | null {
  switch (phase) {
    case "build_unavailable":
      return "This desktop build does not include approved personal Codex setup.";
    case "codex_unavailable":
      return "Codex Desktop was not found on this computer. Install it before connecting Full Harness.";
    case "website_unavailable":
      return "CasimirBot website approval is not ready or does not match this build. Local Codex setup remains off.";
    default:
      return null;
  }
}
