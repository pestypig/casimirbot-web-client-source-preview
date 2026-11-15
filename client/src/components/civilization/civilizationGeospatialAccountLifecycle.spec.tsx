// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {HELIX_DEVELOPER_ACCOUNT_POLICY} from '@shared/helix-account-session';
import {cacheAccountCapabilityPolicy} from '@/lib/workstation/accountCapabilityPolicy';
import {CivilizationGeospatialSettings} from './CivilizationGeospatialSettings';
import {CIVILIZATION_MAPS_BROWSER_KEY_STORAGE_KEY as storage,CIVILIZATION_GEOSPATIAL_CONFIG_CHANGED_EVENT as changed,
 loadCivilizationMapsBrowserKey,saveCivilizationMapsBrowserKey,clearCivilizationMapsBrowserKey} from './civilizationGeospatialClientConfig';
const key='AIza012345678901234567890123';
const account=(id:string)=>cacheAccountCapabilityPolicy(HELIX_DEVELOPER_ACCOUNT_POLICY,id);
const slot=(id:string)=>`${storage}:profile:${encodeURIComponent(id)}`;
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>resolve=done);return{promise,resolve};}
const native=(values:Record<string,unknown>)=>Object.assign(window,{casimirDesktop:values});
const status={mapsTiles:{browserKeyConfigured:false},routes:{serverKeyConfigured:false},earthEngine:{projectConfigured:false,credentialsConfigured:false}};
beforeEach(()=>{vi.stubEnv('VITE_GOOGLE_MAPS_BROWSER_API_KEY','');window.localStorage.clear();account('profile-a');
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>status})));});
afterEach(()=>{cleanup();delete (window as any).casimirDesktop;cacheAccountCapabilityPolicy(null,null);window.localStorage.clear();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();});
it('does not save a browser key after its initiating account changes',async()=>{
 const pending=saveCivilizationMapsBrowserKey(key);account('profile-b');
 await expect(pending).rejects.toThrow('maps_account_changed');expect(window.localStorage.getItem(slot('profile-a'))).toBeNull();expect(window.localStorage.getItem(slot('profile-b'))).toBeNull();
});
it('does not clear a browser key after its initiating account changes',async()=>{
 window.localStorage.setItem(slot('profile-a'),key);const pending=clearCivilizationMapsBrowserKey();account('profile-b');
 await expect(pending).rejects.toThrow('maps_account_changed');expect(window.localStorage.getItem(slot('profile-a'))).toBe(key);
});
it('rejects a late native key read after an account round trip',async()=>{
 const result=deferred<any>();native({readCivilizationMapsBrowserKey:()=>result.promise});
 const pending=loadCivilizationMapsBrowserKey();account('profile-b');account('profile-a');result.resolve({ok:true,key,hasRecord:true});
 await expect(pending).rejects.toThrow('maps_account_changed');
});
it.each(['save','clear'] as const)('rejects a late native %s receipt without removing legacy storage',async operation=>{
 const result=deferred<any>();window.localStorage.setItem(storage,'unclaimed-fixture');
 native({saveCivilizationMapsBrowserKey:()=>result.promise,clearCivilizationMapsBrowserKey:()=>result.promise});
 const pending=operation==='save'?saveCivilizationMapsBrowserKey(key):clearCivilizationMapsBrowserKey();account('profile-b');result.resolve({ok:true});
 await expect(pending).rejects.toThrow('maps_account_changed');expect(window.localStorage.getItem(storage)).toBe('unclaimed-fixture');
});
function open(){render(<CivilizationGeospatialSettings/>);fireEvent.click(screen.getByRole('button',{name:'Civilization map data settings'}));}
it('clears the Maps password input when save starts',async()=>{
 native({readCivilizationMapsBrowserKey:async()=>({ok:true,key:null,hasRecord:false}),saveCivilizationMapsBrowserKey:()=>new Promise(()=>{})});open();
 const input=await screen.findByPlaceholderText('Paste the restricted Maps browser key') as HTMLInputElement;
 fireEvent.change(input,{target:{value:key}});fireEvent.click(screen.getByRole('button',{name:'Save key'}));expect(input.value).toBe('');
});
it('does not notify a new account about a delayed Maps save',async()=>{
 const result=deferred<any>(),event=vi.fn();window.addEventListener(changed,event);
 try{native({readCivilizationMapsBrowserKey:async()=>({ok:true,key:null,hasRecord:false}),saveCivilizationMapsBrowserKey:()=>result.promise});open();
 const input=await screen.findByPlaceholderText('Paste the restricted Maps browser key');fireEvent.change(input,{target:{value:key}});fireEvent.click(screen.getByRole('button',{name:'Save key'}));
 await act(async()=>{account('profile-b');result.resolve({ok:true});await result.promise;});
 expect(event).not.toHaveBeenCalled();expect(screen.queryByText(/could not be saved|key saved in this desktop profile/)).toBeNull();
 }finally{window.removeEventListener(changed,event);}
});
it('does not clear the new account draft when an old Routes save finishes',async()=>{
 const result=deferred<any>();native({readCivilizationMapsBrowserKey:async()=>({ok:true,key:null,hasRecord:false}),
 getCivilizationRoutesKeyState:async()=>({ok:true,state:{configured:false}}),saveCivilizationRoutesKey:()=>result.promise});open();
 const input=await screen.findByPlaceholderText('Paste the dedicated Routes-only key') as HTMLInputElement;
 fireEvent.change(input,{target:{value:key}});fireEvent.click(screen.getByRole('button',{name:'Save Routes key'}));
 await act(async()=>account('profile-b'));fireEvent.change(input,{target:{value:'new-profile-draft'}});
 await act(async()=>{result.resolve({ok:true,active:true,state:{configured:true}});await result.promise;});
 expect(input.value).toBe('new-profile-draft');expect(screen.queryByText(/Routes key saved in protected storage/)).toBeNull();
});
it('re-inspects Routes state for a second account with the same capability',async()=>{
 const old=deferred<any>();let calls=0;native({readCivilizationMapsBrowserKey:async()=>({ok:true,key:null,hasRecord:false}),
 getCivilizationRoutesKeyState:()=>++calls===1?old.promise:Promise.resolve({ok:true,state:{configured:false}}),saveCivilizationRoutesKey:vi.fn(),clearCivilizationRoutesKey:vi.fn()});open();
 await waitFor(()=>expect(calls).toBe(1));await act(async()=>account('profile-b'));
 await act(async()=>{old.resolve({ok:true,state:{configured:true}});await old.promise;});
 expect(calls).toBe(2);expect((screen.getByRole('button',{name:'Clear saved key'}) as HTMLButtonElement).disabled).toBe(true);
});
it('still saves and clears Maps and Routes keys for the current account',async()=>{
 const saveMap=vi.fn(async()=>({ok:true})),clearMap=vi.fn(async()=>({ok:true}));
 const saveRoute=vi.fn(async()=>({ok:true,active:true,state:{configured:true}})),clearRoute=vi.fn(async()=>({ok:true,active:true,state:{configured:false}}));
 native({readCivilizationMapsBrowserKey:async()=>({ok:true,key:null,hasRecord:false}),saveCivilizationMapsBrowserKey:saveMap,clearCivilizationMapsBrowserKey:clearMap,
 getCivilizationRoutesKeyState:async()=>({ok:true,state:{configured:false}}),saveCivilizationRoutesKey:saveRoute,clearCivilizationRoutesKey:clearRoute});open();
 fireEvent.change(await screen.findByPlaceholderText('Paste the restricted Maps browser key'),{target:{value:key}});fireEvent.click(screen.getByRole('button',{name:'Save key'}));
 await screen.findByText(/Browser key saved in this desktop profile/);fireEvent.click(screen.getByRole('button',{name:'Forget saved key'}));await screen.findByText('Browser key removed from this device.');
 fireEvent.change(screen.getByPlaceholderText('Paste the dedicated Routes-only key'),{target:{value:key}});fireEvent.click(screen.getByRole('button',{name:'Save Routes key'}));
 await screen.findByText(/Routes key saved in protected storage and activated/);fireEvent.click(screen.getByRole('button',{name:'Clear saved key'}));await screen.findByText('Routes key cleared from protected storage and the local service.');
 expect(saveMap).toHaveBeenCalledExactlyOnceWith(key);expect(clearMap).toHaveBeenCalledOnce();expect(saveRoute).toHaveBeenCalledExactlyOnceWith(key);expect(clearRoute).toHaveBeenCalledOnce();
});
it('clears only the current browser account key',async()=>{
 await saveCivilizationMapsBrowserKey(key);window.localStorage.setItem(slot('profile-b'),'second-fixture');
 await clearCivilizationMapsBrowserKey();expect(window.localStorage.getItem(slot('profile-a'))).toBeNull();expect(window.localStorage.getItem(slot('profile-b'))).toBe('second-fixture');
});
