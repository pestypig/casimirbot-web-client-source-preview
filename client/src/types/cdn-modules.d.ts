declare module "https://cdn.jsdelivr.net/npm/exifr@7.1.3/+esm" {
  const value: any;
  export = value;
}

declare module "https://cdn.jsdelivr.net/npm/music-metadata-browser@2.5.10/+esm" {
  const value: any;
  export = value;
}

declare module "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm" {
  export function toPng(
    node: HTMLElement,
    options?: { pixelRatio?: number }
  ): Promise<string>;
}
