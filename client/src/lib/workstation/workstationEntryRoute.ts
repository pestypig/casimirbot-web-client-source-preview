export type WorkstationShellPath = "/desktop" | "/mobile";

export function isWorkstationShellPathname(
  pathname: string | null | undefined,
): boolean {
  const normalizedPathname = pathname?.replace(/\/+$/, "") || "/";
  return normalizedPathname === "/desktop" || normalizedPathname === "/mobile";
}

export function buildWorkstationShellHandoff(
  targetPath: WorkstationShellPath,
  locationState: {
    search?: string | null;
    hash?: string | null;
  },
): string {
  return `${targetPath}${locationState.search ?? ""}${locationState.hash ?? ""}`;
}
