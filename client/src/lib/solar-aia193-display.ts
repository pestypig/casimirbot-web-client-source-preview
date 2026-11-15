/** Display-only choices. Source intensity and its archive hash remain unchanged. */
export type SolarImagePalette='grayscale/1'|'aia_193_bronze/1'|'sdo_aia193_lct_sqrt/1';

const LEGACY_BRONZE_STOPS:[number,number,number,number][]=[
  [0,0,0,0],[0.18,59,21,0],[0.42,151,64,3],
  [0.7,231,145,16],[0.9,255,219,79],[1,255,249,196],
];

function legacyBronze(value:number):[number,number,number]{
  const upper=LEGACY_BRONZE_STOPS.findIndex(stop=>value<=stop[0]);
  if(upper<=0)return [0,0,0];
  const low=LEGACY_BRONZE_STOPS[upper-1],high=LEGACY_BRONZE_STOPS[upper];
  const fraction=(value-low[0])/(high[0]-low[0]);
  return [1,2,3].map(channel=>Math.round(low[channel]+fraction*(high[channel]-low[channel]))) as [number,number,number];
}

/** SunPy's SDO/AIA 193 lookup: (sqrt(c*255), c, c²/255), with c in [0,255].
 * The preceding square-root stretch is explicit and only affects display.
 */
export function solarDisplayRgb(value:number,palette:SolarImagePalette):[number,number,number]{
  const bounded=Math.max(0,Math.min(1,value));
  if(palette==='aia_193_bronze/1')return legacyBronze(bounded);
  const stretched=Math.sqrt(bounded);
  const c=255*stretched;
  if(palette==='sdo_aia193_lct_sqrt/1')
    return [Math.round(Math.sqrt(c*255)),Math.round(c),Math.round(c*c/255)];
  const gray=Math.round(c);
  return [gray,gray,gray];
}
