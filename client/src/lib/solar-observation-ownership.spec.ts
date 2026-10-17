import {it,expect} from 'vitest';
import {createSolarObservationOwnership} from './solar-observation-ownership';

it('a newer selection invalidates older import, fetch, event and receipt revisions',()=>{
  const ownership=createSolarObservationOwnership();
  const live=ownership.begin();expect(ownership.isCurrent(live)).toBe(true);
  const firstReplay=ownership.begin();const newerReplay=ownership.begin();
  expect(ownership.isCurrent(live)).toBe(false);expect(ownership.isCurrent(firstReplay)).toBe(false);
  expect(ownership.isCurrent(newerReplay)).toBe(true);
  const saveRevision=ownership.current();expect(saveRevision).toBe(newerReplay);
  ownership.begin();expect(ownership.isCurrent(saveRevision)).toBe(false);
});
it('out-of-order completion cannot revive old displayed evidence',async()=>{
  const ownership=createSolarObservationOwnership();let displayed='previous';
  let finish!:(value:string)=>void;
  const earlier=ownership.begin();
  const pending=new Promise<string>(resolve=>{finish=resolve;}).then(value=>{
    if(ownership.isCurrent(earlier))displayed=value;
  });
  const latest=ownership.begin();
  if(ownership.isCurrent(latest))displayed='newer archive';
  finish('older archive');await pending;expect(displayed).toBe('newer archive');
});
it('a rejected current import can retain prior evidence while excluding stale results',()=>{
  const ownership=createSolarObservationOwnership();const displayed='previous verified archive';
  const older=ownership.begin();const invalidImport=ownership.begin();
  expect(ownership.isCurrent(invalidImport)).toBe(true);
  expect(ownership.isCurrent(older)).toBe(false);expect(displayed).toBe('previous verified archive');
});
