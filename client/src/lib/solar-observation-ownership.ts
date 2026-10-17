/** UI selection ordering only; not a solver, source or execution authority. */
export function createSolarObservationOwnership() {
  let revision=0;
  return {begin:()=>++revision,current:()=>revision,isCurrent:(selected:number)=>selected===revision};
}
