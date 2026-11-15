import {describe,expect,it,vi} from "vitest";
import {HELIX_DEVELOPER_ACCOUNT_POLICY,HELIX_SIGNED_OUT_ACCOUNT_POLICY,HELIX_USER_ACCOUNT_POLICY} from "@shared/helix-account-session";
vi.mock("../HelixAskLiveRuntimeControls",()=>({buildHelixAskLiveRuntimeControlsModel:()=>({visible:false})}));
import {buildHelixAskComposerActionToolbarState,type HelixAskComposerActionToolbarStateOptions} from "../HelixAskComposerActionToolbarState";
describe("Ask private connection presentation admission",()=>{
  it.each([undefined,null,HELIX_SIGNED_OUT_ACCOUNT_POLICY,HELIX_USER_ACCOUNT_POLICY,HELIX_DEVELOPER_ACCOUNT_POLICY])("uses account policy and preserves action callbacks",accountPolicy=>{
    const onRuntimeSelect=vi.fn(),onSubmitIntent=vi.fn(),onStop=vi.fn();
    const state=buildHelixAskComposerActionToolbarState({accountPolicy,privateConnectionInspectorEnabled:true,
      runtimePickerModel:{selectedRuntime:"codex"},onRuntimeSelect,onSubmitIntent,onStop} as unknown as HelixAskComposerActionToolbarStateOptions);
    expect(state.privateConnectionInspectorEnabled).toBe(accountPolicy?.account_type==="developer");
    expect(state.personalConnectionMenuEnabled).toBe(Boolean(accountPolicy?.feature_flags.includes("profile_connections") &&
      !accountPolicy.locked_features.includes("profile_connections")));
    expect(state.onRuntimeSelect).toBe(onRuntimeSelect);expect(state.onSubmitIntent).toBe(onSubmitIntent);expect(state.onStop).toBe(onStop);
    expect(onRuntimeSelect).not.toHaveBeenCalled();expect(onSubmitIntent).not.toHaveBeenCalled();expect(onStop).not.toHaveBeenCalled();
  });
  it("keeps an explicitly locked ordinary profile out of personal connection setup",()=>{
    const accountPolicy={...HELIX_USER_ACCOUNT_POLICY,
      locked_features:[...HELIX_USER_ACCOUNT_POLICY.locked_features,"profile_connections"]};
    const state=buildHelixAskComposerActionToolbarState({accountPolicy,
      runtimePickerModel:{selectedRuntime:"codex"}} as unknown as HelixAskComposerActionToolbarStateOptions);
    expect(state.personalConnectionMenuEnabled).toBe(false);
    expect(state.privateConnectionInspectorEnabled).toBe(false);
  });
});
