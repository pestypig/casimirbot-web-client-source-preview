// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { useWorkstationLayoutStore as store, type WorkstationLayoutSnapshot } from "./useWorkstationLayoutStore";
import { ENVIRONMENT_HOME_PANEL_ID as HOME } from "@shared/desktop-environment-home";
const snapshot = (): WorkstationLayoutSnapshot => ({
  chatDock: {side:"right",widthPx:450,collapsed:false}, activeGroupId:"group-primary", root:{type:"group",groupId:"group-primary"},
  groups:{"group-primary":{id:"group-primary",panelIds:["local-harness","code-admin"],activePanelId:"code-admin"}},
});
describe("private permanent Environment Home layout", () => {
  beforeEach(() => {
    localStorage.clear(); store.setState({ environmentHomeEnabled:false, environmentHomePolicyResolved:false, pendingEnvironmentHomeFocus:false, recentlyClosedPanels:[] });
    store.getState().applyLayoutSnapshot(snapshot());
  });
  it("pins first without replacing the existing active panel or layout", () => {
    store.getState().setEnvironmentHomeEnabled(true);
    expect(store.getState().groups["group-primary"]).toMatchObject({ panelIds:[HOME,"local-harness","code-admin"],activePanelId:"code-admin" });
    expect(store.getState().chatDock.widthPx).toBe(450);
  });
  it("makes Home active for a fresh empty workspace", () => {
    const empty = snapshot(); empty.groups["group-primary"].panelIds=[]; empty.groups["group-primary"].activePanelId=null;
    store.getState().applyLayoutSnapshot(empty); store.getState().setEnvironmentHomeEnabled(true);
    expect(store.getState().groups["group-primary"].activePanelId).toBe(HOME);
  });
  it("rejects close and keyboard close while retaining other close behavior", () => {
    store.getState().setEnvironmentHomeEnabled(true); store.getState().setActivePanel("group-primary",HOME);
    expect(store.getState().closeActivePanel()).toBeNull(); store.getState().closePanelFromGroup("group-primary",HOME);
    expect(store.getState().groups["group-primary"].panelIds[0]).toBe(HOME);
    store.getState().closePanelFromGroup("group-primary","local-harness");
    expect(store.getState().reopenLastClosedPanel()?.panelId).toBe("local-harness");
    expect(store.getState().groups["group-primary"].panelIds[0]).toBe(HOME);
  });
  it("normalizes duplicate and moved Home in restored snapshots without losing other panels", () => {
    store.getState().setEnvironmentHomeEnabled(true);
    const changed = snapshot(); changed.groups["group-primary"].panelIds.push(HOME,HOME);
    changed.groups.other={id:"other",panelIds:[HOME,"account-session"],activePanelId:HOME};
    store.getState().applyLayoutSnapshot(changed);
    expect(store.getState().groups["group-primary"].panelIds).toEqual([HOME,"local-harness","code-admin"]);
    expect(store.getState().groups.other).toMatchObject({panelIds:["account-session"],activePanelId:"account-session"});
  });
  it("opens Home in the root group instead of duplicating it in another group", () => {
    store.getState().setEnvironmentHomeEnabled(true); store.getState().openPanelInGroup("other",HOME);
    expect(store.getState().activeGroupId).toBe("group-primary");
    expect(store.getState().groups.other).toBeUndefined();
  });
  it("removes private Home on account downgrade and preserves the remaining workspace", () => {
    store.getState().setEnvironmentHomeEnabled(true); store.getState().setActivePanel("group-primary",HOME);
    store.getState().setEnvironmentHomeEnabled(false);
    expect(store.getState().groups["group-primary"]).toMatchObject({panelIds:["local-harness","code-admin"],activePanelId:"local-harness"});
  });
  it("does not trust persisted developer presentation permission on restart", async () => {
    const previous = snapshot(); previous.groups["group-primary"].panelIds.unshift(HOME);
    localStorage.setItem("workstation-layout-v1",JSON.stringify({version:1,state:{...previous,environmentHomeEnabled:true}}));
    await store.persist.rehydrate();
    expect(store.getState().environmentHomeEnabled).toBe(false);
    expect(store.getState().groups["group-primary"].panelIds).toEqual(["local-harness","code-admin"]);
    store.getState().setEnvironmentHomeEnabled(true);
    expect(store.getState().groups["group-primary"].panelIds[0]).toBe(HOME);
  });
  it("restores active Home only after current developer admission", async () => {
    const previous=snapshot(); previous.groups["group-primary"].panelIds.unshift(HOME);
    previous.groups["group-primary"].activePanelId=HOME;
    localStorage.setItem("workstation-layout-v1",JSON.stringify({version:1,state:{...previous,environmentHomeEnabled:true,environmentHomePolicyResolved:true}}));
    await store.persist.rehydrate();
    expect(store.getState().environmentHomePolicyResolved).toBe(false);
    expect(store.getState().groups["group-primary"].panelIds).not.toContain(HOME);
    expect(store.getState().pendingEnvironmentHomeFocus).toBe(true);
    store.getState().setEnvironmentHomeEnabled(true);
    expect(store.getState().groups["group-primary"].activePanelId).toBe(HOME);
  });
  it.each(["denied","new-selection"])("discards pending Home focus after %s", kind => {
    const previous=snapshot(); previous.groups["group-primary"].panelIds.unshift(HOME);
    previous.groups["group-primary"].activePanelId=HOME;
    store.getState().applyLayoutSnapshot(previous);
    if(kind==="denied")store.getState().setEnvironmentHomeEnabled(false);
    else store.getState().setActivePanel("group-primary","code-admin");
    expect(store.getState().pendingEnvironmentHomeFocus).toBe(false);
    store.getState().setEnvironmentHomeEnabled(true);
    expect(store.getState().groups["group-primary"].activePanelId).not.toBe(HOME);
  });
});
