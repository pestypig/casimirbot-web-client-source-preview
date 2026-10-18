// Loaded only by the isolated test bundler's exact account-resolver replacement.
export const fixtureTrustSessions = new Map<string, {
  session_id: string; status: "active";
  profile: { profile_id: string }; account_policy: { account_type: "developer" };
}>();
export const getAccountSessionById = async (id: string | null | undefined) =>
  id ? fixtureTrustSessions.get(id) ?? null : null;
