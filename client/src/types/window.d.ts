/* global window augmentation for Helix/Warp */
export {};
declare global {
  interface Window {
    // runtime flags / paths
    __warpPreludeInstalled?: boolean;
    __ASSET_BASE__?: string;
    __APP_WARP_BUILD?: string;
    __WARP_ENGINE_SRC__?: string;
    __webpack_public_path__?: string;
    __NEXT_DATA__?: { assetPrefix?: string };
    // strobing mux
    __strobingListeners?: Set<(p:{sectorCount:number;currentSector:number;split?:number})=>void>;
    __strobeListeners?: Set<(p:{sectorCount:number;currentSector:number;split?:number})=>void>;
    __addStrobingListener?: (fn:(p:{sectorCount:number;currentSector:number;split?:number})=>void)=>()=>void;
    setStrobingState?: (p:{sectorCount:number;currentSector:number;split?:number})=>void;
    helix?: {
      timing?: {
        dwell_ms?: number;
        burst_ms?: number;
        tauLC_ms?: number;
        sectorsTotal?: number;
        sectorsConcurrent?: number;
      };
      shiftVector?: {
        betaTiltVec?: [number, number, number];
      };
    };
    // engine + scene
    WarpEngine?: new (canvas: HTMLCanvasElement) => any;
    sceneScale?: number;
    // debug echo
    __warpEcho?: any;
  }
}
