export const HELIX_ASK_CONTEXT_ID = {
  desktop: "helix-ask-desktop",
  mobile: "helix-ask-mobile",
} as const;

export type HelixAskSurface = keyof typeof HELIX_ASK_CONTEXT_ID;
