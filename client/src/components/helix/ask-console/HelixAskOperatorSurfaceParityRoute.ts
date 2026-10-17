export const HELIX_ASK_OPERATOR_SURFACE_PARITY_ROUTE_PARAM = "helixAskParity";
export const HELIX_ASK_OPERATOR_SURFACE_PARITY_ROUTE_VALUE = "operator_surface";

export function buildHelixAskOperatorSurfaceParityRouteHint(): string {
  return `?${HELIX_ASK_OPERATOR_SURFACE_PARITY_ROUTE_PARAM}=${HELIX_ASK_OPERATOR_SURFACE_PARITY_ROUTE_VALUE}`;
}

export function shouldRenderHelixAskOperatorSurfaceParityHarness(search: string | null | undefined): boolean {
  if (!search) return false;
  const normalizedSearch = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(normalizedSearch);
  const value = params.get(HELIX_ASK_OPERATOR_SURFACE_PARITY_ROUTE_PARAM);
  return value === HELIX_ASK_OPERATOR_SURFACE_PARITY_ROUTE_VALUE;
}
