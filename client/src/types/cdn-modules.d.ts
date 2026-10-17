declare module "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.umd.min.js" {
  const value: any;
  export = value;
}

declare module "https://cdn.jsdelivr.net/npm/music-metadata-browser@2.5.10/dist/music-metadata-browser.min.js" {
  const value: any;
  export = value;
}

declare module "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.esm.js" {
  export function toPng(
    node: HTMLElement,
    options?: { pixelRatio?: number }
  ): Promise<string>;
}
