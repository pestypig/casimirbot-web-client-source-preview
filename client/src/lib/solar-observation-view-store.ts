import {useSyncExternalStore} from 'react';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from './workstation/accountCapabilityPolicy';

/** One renderer-memory observation, not archive storage, source validation or authority. */
export function createSolarObservationViewStore<T>(maxBytes=8_000_000,
  target:Pick<EventTarget,'addEventListener'|'removeEventListener'>|null=typeof window==='undefined'?null:window) {
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error('Invalid observation view bound');
  let value:T|null=null;
  const listeners=new Set<()=>void>();
  const notify=()=>listeners.forEach(listener=>listener());
  const clear=()=>{value=null;notify();};
  // The listener outlives a panel mount so an account switch while hidden clears
  // the retained view before any later navigation can recover it.
  target?.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,clear);
  return {
    getSnapshot:()=>value,
    subscribe:(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};},
    set:(next:T|null|((previous:T|null)=>T|null))=>{
      const selected=typeof next==='function'?(next as (previous:T|null)=>T|null)(value):next;
      if(selected===null){clear();return;}
      const json=JSON.stringify(selected);
      if(typeof json!=='string'||new TextEncoder().encode(json).length>maxBytes)
        throw new Error('Observation exceeds the 8 MB retained-view limit; previous observation retained.');
      // Copy to prevent a caller mutating an already selected evidence identity.
      value=JSON.parse(json) as T;notify();
    },
    clear,
    dispose:()=>{target?.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,clear);clear();listeners.clear();},
  };
}
export function useSolarObservationView<T>(store:ReturnType<typeof createSolarObservationViewStore<T>>) {
  const value=useSyncExternalStore(store.subscribe,store.getSnapshot,()=>null);
  return [value,store.set] as const;
}
