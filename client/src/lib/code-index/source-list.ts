type RawSourceLoader = () => Promise<string>;

export const SOURCE_PATTERNS = [
  "/src/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
  "/../server/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
  "/../shared/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
  "/../modules/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
] as const;

export const SOURCE_LOADERS: Record<string, RawSourceLoader> = import.meta.glob<string>(
  [
    "/src/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
    "/../server/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
    "/../shared/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
    "/../modules/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
  ],
  { query: "?raw", import: "default" },
);

export type SourceLoaderRecord = typeof SOURCE_LOADERS;
