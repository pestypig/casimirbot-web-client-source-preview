/** Same-window observation invalidation only. No identity, readiness or grant
 * travels on this signal; each consumer must discard or re-read its evidence. */
export const AGENT_CONNECTION_INVALIDATED_EVENT = "helix-agent-connection-invalidated";
