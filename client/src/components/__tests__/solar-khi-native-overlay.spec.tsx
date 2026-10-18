// @vitest-environment jsdom
import React from "react";
import { render, screen,fireEvent,act,cleanup } from "@testing-library/react";
import { describe, expect, it,afterEach,vi } from "vitest";
import { SolarKhiNativeOverlay } from "../SolarKhiNativeOverlay";
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from '../../lib/workstation/accountCapabilityPolicy';
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});

describe("SolarKhiNativeOverlay", () => {
  it("exposes native-frame ingest, reconstruction choice, and the cross-scale hierarchy", () => {
    render(<SolarKhiNativeOverlay />);

    expect(screen.getByText("DKIST FastCam Native KHI Overlay")).toBeTruthy();
    expect(screen.getByLabelText("Observation manifest")).toBeTruthy();
    expect(screen.getByLabelText("Native reconstruction frame")).toBeTruthy();
    expect(screen.getByLabelText("Solar spatial scale")).toBeTruthy();
    expect(screen.getByText(/without the 224-pixel coherence-grid cap/i)).toBeTruthy();
    expect(screen.getByRole("option", { name: "MFBD" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Speckle" })).toBeTruthy();
    expect(screen.getByText(/Full solar disk/)).toBeTruthy();
    expect(screen.getByText('Derived diagnostic · Missing')).toBeTruthy();
    expect(screen.getByText(/selected image identity is not bound to a manifest frame/)).toBeTruthy();
    expect(screen.getByText(/does not establish file identity or measurement registration/)).toBeTruthy();
  });
  it('invalidates pending manifest reads on account changes',async()=>{
    render(<SolarKhiNativeOverlay />);
    let finish!:(text:string)=>void;
    fireEvent.change(screen.getByLabelText('Observation manifest'),{target:{files:[{size:100,text:()=>new Promise<string>(resolve=>{finish=resolve;})}]}});
    act(()=>window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
    await act(async()=>{finish('invalid manifest from previous account');});
    expect(screen.getByText('Account changed; imported KHI inputs cleared.')).toBeTruthy();
    expect(screen.getByText('Derived diagnostic · Missing')).toBeTruthy();
  });
  it('rejects oversized manifests before reading',()=>{
    render(<SolarKhiNativeOverlay />);const text=vi.fn();
    fireEvent.change(screen.getByLabelText('Observation manifest'),{target:{files:[{size:1_000_001,text}]}});
    expect(text).not.toHaveBeenCalled();
    expect(screen.getByText('Manifest exceeds 1 MB.')).toBeTruthy();
  });
  it('ignores old image callbacks and revokes owned URLs on replacement, account change and unmount',()=>{
    const decoded:any[]=[];
    vi.stubGlobal('Image',class {onload:any;onerror:any;src='';constructor(){decoded.push(this);}});
    const revoke=vi.fn();let next=0;
    vi.stubGlobal('URL',{createObjectURL:()=>`blob:test-${++next}`,revokeObjectURL:revoke});
    const view=render(<SolarKhiNativeOverlay />);
    const picker=screen.getByLabelText('Native reconstruction frame');
    fireEvent.change(picker,{target:{files:[new File(['a'],'first.png')]}});
    fireEvent.change(picker,{target:{files:[new File(['b'],'second.png')]}});
    expect(revoke).toHaveBeenCalledWith('blob:test-1');
    act(()=>{decoded[0].onload();decoded[0].onerror();});
    expect(screen.queryByText(/Could not decode/)).toBeNull();
    act(()=>window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
    act(()=>{decoded[1].onload();decoded[1].onerror();});
    expect(screen.getByText('Account changed; imported KHI inputs cleared.')).toBeTruthy();
    expect(revoke).toHaveBeenCalledWith('blob:test-2');
    expect((picker as HTMLInputElement).value).toBe('');
    fireEvent.change(picker,{target:{files:[new File(['c'],'third.png')]}});
    view.unmount();
    expect(revoke).toHaveBeenCalledWith('blob:test-3');
    act(()=>{decoded[2].onload();decoded[2].onerror();});
    expect(revoke).toHaveBeenCalledTimes(3);
  });
});
