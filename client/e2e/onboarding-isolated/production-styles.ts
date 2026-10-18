import fs from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

// Exercise production preflight and utility styles in the isolated browser.
// An unstyled HTML button can pass pointer tests while being invisible as an
// action in the packaged Tailwind renderer.
export async function buildOnboardingStyles() {
  const from = path.resolve("client/src/index.css");
  return (await postcss([
    tailwindcss({ config: path.resolve("tailwind.config.ts") }), autoprefixer(),
  ]).process(await fs.readFile(from, "utf8"), { from })).css;
}
