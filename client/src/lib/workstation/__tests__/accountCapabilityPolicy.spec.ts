/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { HELIX_USER_ACCOUNT_POLICY, HELIX_DEVELOPER_ACCOUNT_POLICY } from "@shared/helix-account-session";
import {
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
  HELIX_ACCOUNT_PROFILE_CHANGE_STORAGE_KEY,
  cacheAccountCapabilityPolicy,
  clearCachedAccountCapabilityPolicy,
  fetchAccountCapabilityPolicy,
  readCachedAccountProfileIdentity,
  readCachedAccountCapabilityPolicy,
} from "@/lib/workstation/accountCapabilityPolicy";

describe("account capability policy identity events", () => {
  afterEach(() => {
    clearCachedAccountCapabilityPolicy();
    vi.unstubAllGlobals();
  });

  it("publishes Docs Viewer PDF export through the default public policy", () => {
    expect(HELIX_USER_ACCOUNT_POLICY.feature_flags).toContain(
      "docs_viewer_print_pdf_export",
    );
    expect(HELIX_USER_ACCOUNT_POLICY.locked_features).not.toContain(
      "docs_viewer_print_pdf_export",
    );
  });

  it("shares one in-flight account policy request across concurrent consumers", async () => {
    let releaseResponse: ((value: Response) => void) | null = null;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      releaseResponse = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);

    const first = fetchAccountCapabilityPolicy();
    const second = fetchAccountCapabilityPolicy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    releaseResponse?.({
      ok: true,
      json: async () => ({
        account_policy: HELIX_USER_ACCOUNT_POLICY,
        session: null,
      }),
    } as Response);

    await expect(first).resolves.toEqual(HELIX_USER_ACCOUNT_POLICY);
    await expect(second).resolves.toEqual(HELIX_USER_ACCOUNT_POLICY);
  });

  it("marks an account profile switch even when the capability policy is unchanged", () => {
    const details: Array<Record<string, unknown>> = [];
    const listener = ((event: CustomEvent<Record<string, unknown>>) => {
      details.push(event.detail);
    }) as EventListener;
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, listener);
    try {
      cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:a");
      const eventCountAfterInitialProfile = details.length;
      cacheAccountCapabilityPolicy({
        ...HELIX_USER_ACCOUNT_POLICY,
        allowed_panels: [...HELIX_USER_ACCOUNT_POLICY.allowed_panels],
        locked_panels: [...HELIX_USER_ACCOUNT_POLICY.locked_panels],
        locked_features: [...HELIX_USER_ACCOUNT_POLICY.locked_features],
        allowed_runtime_agents: [...HELIX_USER_ACCOUNT_POLICY.allowed_runtime_agents],
        allowed_workstation_capabilities: [
          ...HELIX_USER_ACCOUNT_POLICY.allowed_workstation_capabilities,
        ],
        locked_workstation_capabilities: [
          ...HELIX_USER_ACCOUNT_POLICY.locked_workstation_capabilities,
        ],
        feature_flags: [...HELIX_USER_ACCOUNT_POLICY.feature_flags],
        quotas: { ...HELIX_USER_ACCOUNT_POLICY.quotas },
      }, "profile:a");
      expect(details).toHaveLength(eventCountAfterInitialProfile);
      cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:b");
      expect(details.at(-1)).toMatchObject({
        account_profile_id: "profile:b",
        account_profile_changed: true,
      });
      expect(window.localStorage.getItem(HELIX_ACCOUNT_PROFILE_CHANGE_STORAGE_KEY)).toEqual(expect.any(String));
      expect(readCachedAccountProfileIdentity()).toMatchObject({
        profileId: "profile:b",
        revision: expect.any(Number),
      });

      window.dispatchEvent(new StorageEvent("storage", {
        key: HELIX_ACCOUNT_PROFILE_CHANGE_STORAGE_KEY,
        newValue: "cross-tab-account-change",
      }));
      expect(details.at(-1)).toMatchObject({
        account_profile_changed: true,
        account_profile_cross_tab: true,
        account_profile_identity_known: false,
      });
    } finally {
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, listener);
    }
  });

  it.each(["sign-out", "profile-switch", "role-downgrade", "cross-tab"])(
    "does not restore an old developer response after %s", async boundary => {
      cacheAccountCapabilityPolicy(HELIX_DEVELOPER_ACCOUNT_POLICY, "profile:old");
      let finish!: (value: unknown) => void;
      const pendingBody = new Promise(resolve => { finish = resolve; });
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: () => pendingBody })));
      const pending = fetchAccountCapabilityPolicy();
      await Promise.resolve(); // Response arrived; its body is still pending.
      if (boundary === "sign-out") clearCachedAccountCapabilityPolicy();
      if (boundary === "profile-switch") cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:new");
      if (boundary === "role-downgrade") cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:old");
      if (boundary === "cross-tab") window.dispatchEvent(new StorageEvent("storage", {
        key: HELIX_ACCOUNT_PROFILE_CHANGE_STORAGE_KEY, newValue: "changed",
      }));
      finish({ account_policy: HELIX_DEVELOPER_ACCOUNT_POLICY,
        session: { profile: { profile_id: "profile:old" } } });
      await expect(pending).resolves.toEqual(HELIX_USER_ACCOUNT_POLICY);
      expect(readCachedAccountCapabilityPolicy()?.account_type).not.toBe("developer");
      expect(readCachedAccountProfileIdentity().profileId).toBe(
        boundary === "role-downgrade" ? "profile:old" : boundary === "profile-switch" ? "profile:new" : boundary === "cross-tab" ? undefined : null,
      );
    },
  );

  it("starts a fresh request after invalidation and does not let the old completion clear it", async () => {
    let finishOld!: (value: unknown) => void, finishNew!: (value: unknown) => void;
    const oldResponse = new Promise(resolve => { finishOld = resolve; });
    const newResponse = new Promise(resolve => { finishNew = resolve; });
    const fetcher = vi.fn().mockReturnValueOnce(oldResponse).mockReturnValueOnce(newResponse);
    vi.stubGlobal("fetch", fetcher);
    const old = fetchAccountCapabilityPolicy();
    clearCachedAccountCapabilityPolicy();
    const fresh = fetchAccountCapabilityPolicy();
    expect(fetcher).toHaveBeenCalledTimes(2);
    finishOld({ok:true,json:async()=>({account_policy:HELIX_DEVELOPER_ACCOUNT_POLICY,session:{profile:{profile_id:"profile:old"}}})});
    await expect(old).resolves.toEqual(HELIX_USER_ACCOUNT_POLICY);
    const joined = fetchAccountCapabilityPolicy();
    expect(fetcher).toHaveBeenCalledTimes(2);
    finishNew({ok:true,json:async()=>({account_policy:HELIX_USER_ACCOUNT_POLICY,session:{profile:{profile_id:"profile:new"}}})});
    await expect(fresh).resolves.toEqual(HELIX_USER_ACCOUNT_POLICY);
    await expect(joined).resolves.toEqual(HELIX_USER_ACCOUNT_POLICY);
    expect(readCachedAccountProfileIdentity().profileId).toBe("profile:new");
  });
});
