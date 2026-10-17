import type { LumaMood } from "@/lib/luma-moods";

export type LumaMoodPalette = {
  ring: string;
  aura: string;
  surfaceBorder: string;
  surfaceTint: string;
  surfaceHalo: string;
  liveBorder: string;
  replyBorder: string;
  replyTint: string;
};

export const LUMA_MOOD_PALETTE: Record<LumaMood, LumaMoodPalette> = {
  mad: {
    ring: "ring-rose-400/60",
    aura:
      "border-rose-300/45 bg-rose-500/[0.08] shadow-[0_0_40px_rgba(244,63,94,0.45)]",
    surfaceBorder: "border-rose-300/35",
    surfaceTint:
      "bg-[radial-gradient(120%_170%_at_6%_12%,rgba(244,63,94,0.22)_0%,rgba(15,23,42,0)_68%)]",
    surfaceHalo:
      "bg-[radial-gradient(120%_140%_at_94%_16%,rgba(244,63,94,0.12)_0%,rgba(15,23,42,0)_72%)]",
    liveBorder: "border-rose-300/25",
    replyBorder: "border-rose-300/30",
    replyTint:
      "bg-[radial-gradient(120%_160%_at_12%_16%,rgba(244,63,94,0.12)_0%,rgba(15,23,42,0.68)_72%)]",
  },
  upset: {
    ring: "ring-amber-300/55",
    aura:
      "border-amber-200/45 bg-amber-400/[0.08] shadow-[0_0_40px_rgba(251,191,36,0.42)]",
    surfaceBorder: "border-amber-200/35",
    surfaceTint:
      "bg-[radial-gradient(120%_170%_at_6%_12%,rgba(251,191,36,0.2)_0%,rgba(15,23,42,0)_68%)]",
    surfaceHalo:
      "bg-[radial-gradient(120%_140%_at_94%_16%,rgba(251,191,36,0.1)_0%,rgba(15,23,42,0)_72%)]",
    liveBorder: "border-amber-200/25",
    replyBorder: "border-amber-200/30",
    replyTint:
      "bg-[radial-gradient(120%_160%_at_12%_16%,rgba(251,191,36,0.12)_0%,rgba(15,23,42,0.68)_72%)]",
  },
  shock: {
    ring: "ring-yellow-300/60",
    aura:
      "border-yellow-200/50 bg-yellow-300/[0.09] shadow-[0_0_42px_rgba(253,224,71,0.45)]",
    surfaceBorder: "border-yellow-200/35",
    surfaceTint:
      "bg-[radial-gradient(120%_170%_at_6%_12%,rgba(253,224,71,0.22)_0%,rgba(15,23,42,0)_68%)]",
    surfaceHalo:
      "bg-[radial-gradient(120%_140%_at_94%_16%,rgba(253,224,71,0.12)_0%,rgba(15,23,42,0)_72%)]",
    liveBorder: "border-yellow-200/25",
    replyBorder: "border-yellow-200/30",
    replyTint:
      "bg-[radial-gradient(120%_160%_at_12%_16%,rgba(253,224,71,0.12)_0%,rgba(15,23,42,0.7)_72%)]",
  },
  question: {
    ring: "ring-sky-300/55",
    aura:
      "border-sky-300/40 bg-sky-400/[0.07] shadow-[0_0_40px_rgba(125,211,252,0.45)]",
    surfaceBorder: "border-sky-300/30",
    surfaceTint:
      "bg-[radial-gradient(120%_170%_at_6%_12%,rgba(125,211,252,0.22)_0%,rgba(15,23,42,0)_68%)]",
    surfaceHalo:
      "bg-[radial-gradient(120%_140%_at_94%_16%,rgba(125,211,252,0.1)_0%,rgba(15,23,42,0)_72%)]",
    liveBorder: "border-sky-300/25",
    replyBorder: "border-sky-300/28",
    replyTint:
      "bg-[radial-gradient(120%_160%_at_12%_16%,rgba(125,211,252,0.12)_0%,rgba(15,23,42,0.7)_72%)]",
  },
  happy: {
    ring: "ring-emerald-300/60",
    aura:
      "border-emerald-200/45 bg-emerald-400/[0.08] shadow-[0_0_40px_rgba(110,231,183,0.42)]",
    surfaceBorder: "border-emerald-200/35",
    surfaceTint:
      "bg-[radial-gradient(120%_170%_at_6%_12%,rgba(110,231,183,0.2)_0%,rgba(15,23,42,0)_68%)]",
    surfaceHalo:
      "bg-[radial-gradient(120%_140%_at_94%_16%,rgba(110,231,183,0.1)_0%,rgba(15,23,42,0)_72%)]",
    liveBorder: "border-emerald-200/25",
    replyBorder: "border-emerald-200/30",
    replyTint:
      "bg-[radial-gradient(120%_160%_at_12%_16%,rgba(110,231,183,0.12)_0%,rgba(15,23,42,0.68)_72%)]",
  },
  friend: {
    ring: "ring-teal-300/60",
    aura:
      "border-teal-200/45 bg-teal-400/[0.08] shadow-[0_0_40px_rgba(94,234,212,0.44)]",
    surfaceBorder: "border-teal-200/35",
    surfaceTint:
      "bg-[radial-gradient(120%_170%_at_6%_12%,rgba(94,234,212,0.2)_0%,rgba(15,23,42,0)_68%)]",
    surfaceHalo:
      "bg-[radial-gradient(120%_140%_at_94%_16%,rgba(94,234,212,0.1)_0%,rgba(15,23,42,0)_72%)]",
    liveBorder: "border-teal-200/25",
    replyBorder: "border-teal-200/30",
    replyTint:
      "bg-[radial-gradient(120%_160%_at_12%_16%,rgba(94,234,212,0.12)_0%,rgba(15,23,42,0.68)_72%)]",
  },
  love: {
    ring: "ring-pink-300/60",
    aura:
      "border-pink-200/45 bg-pink-400/[0.08] shadow-[0_0_42px_rgba(249,168,212,0.45)]",
    surfaceBorder: "border-pink-200/35",
    surfaceTint:
      "bg-[radial-gradient(120%_170%_at_6%_12%,rgba(249,168,212,0.22)_0%,rgba(15,23,42,0)_68%)]",
    surfaceHalo:
      "bg-[radial-gradient(120%_140%_at_94%_16%,rgba(249,168,212,0.12)_0%,rgba(15,23,42,0)_72%)]",
    liveBorder: "border-pink-200/25",
    replyBorder: "border-pink-200/30",
    replyTint:
      "bg-[radial-gradient(120%_160%_at_12%_16%,rgba(249,168,212,0.12)_0%,rgba(15,23,42,0.68)_72%)]",
  },
};
