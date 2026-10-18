import type { Pool } from "pg";

// Test-process-only dependency replacement for the production eligibility
// reader. Its SQL/validation stay real; it can access only this isolated pool.
let fixturePool: Pool | null = null;
export function setEnvironmentFixturePool(pool: Pool | null) { fixturePool = pool; }
export async function ensureDatabase() {
  if (!fixturePool) throw new Error("onboarding_environment_fixture_pool_missing");
}
export function getPool(): Pool {
  if (!fixturePool) throw new Error("onboarding_environment_fixture_pool_missing");
  return fixturePool;
}
