import { LUMA_MOOD_ORDER, type LumaMood, publishLumaMood } from "./luma-moods";

type MoodBin = {
  mood: LumaMood;
  keywords: string[];
  tags?: string[];
  reason: string;
};

// Heuristic bins along the mood spectrum. Keywords and tags can be tuned per product domain.
export const LUMA_MOOD_BINS: MoodBin[] = [
  {
    mood: "mad",
    keywords: ["angry", "mad", "furious", "rage", "irate", "annoyed", "frustrat"],
    tags: ["mad", "angry", "rage", "furious"],
    reason: "High agitation or anger",
  },
  {
    mood: "upset",
    keywords: ["upset", "sad", "worried", "concern", "uneasy", "disappoint", "anxious"],
    tags: ["upset", "sad", "down", "worried"],
    reason: "Low-moderate negative affect without anger",
  },
  {
    mood: "shock",
    keywords: ["shock", "surprise", "stunned", "whoa", "wow!", "what?!", "unexpected"],
    tags: ["shock", "surprise"],
    reason: "Surprise or stunned reaction",
  },
  {
    mood: "question",
    keywords: ["?", "how", "why", "what", "unclear", "?", "confus"],
    tags: ["question", "confusion"],
    reason: "Inquiry or confusion",
  },
  {
    mood: "happy",
    keywords: ["happy", "glad", "great", "good", "nice", "yay", "😊", "😁"],
    tags: ["happy", "joy"],
    reason: "General positive affect",
  },
  {
    mood: "friend",
    keywords: ["friend", "buddy", "team", "thanks", "appreciate", "grateful", "support"],
    tags: ["ally", "friend", "support", "panel"],
    reason: "Friendly or collaborative tone",
  },
  {
    mood: "love",
    keywords: ["love", "❤️", "<3", "adore", "favorite", "beautiful", "wonderful"],
    tags: ["love"],
    reason: "Affection or high warmth",
  },
];

export type MoodClassification = {
  mood: LumaMood | null;
  reason: string | null;
  score: number;
};

function scoreBin(text: string, tags: string[] | undefined, bin: MoodBin): number {
  const normalized = text.toLowerCase();
  let score = 0;
  for (const keyword of bin.keywords) {
    if (!keyword) continue;
    if (normalized.includes(keyword.toLowerCase())) {
      score += 2;
    }
  }

  if (Array.isArray(tags)) {
    const lowerTags = tags.map((t) => t.toLowerCase());
    for (const tag of bin.tags ?? []) {
      if (lowerTags.includes(tag.toLowerCase())) {
        score += 3;
      }
    }
  }

  return score;
}

export function classifyMoodFromWhisper(
  text: string,
  opts?: { tags?: string[]; explicitMood?: LumaMood | null },
): MoodClassification {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return { mood: null, reason: null, score: 0 };

  if (opts?.explicitMood && LUMA_MOOD_ORDER.includes(opts.explicitMood)) {
    return { mood: opts.explicitMood, reason: "Explicit mood hint on whisper", score: 99 };
  }

  let best: MoodClassification = { mood: null, reason: null, score: 0 };
  for (const bin of LUMA_MOOD_BINS) {
    const score = scoreBin(trimmed, opts?.tags, bin);
    if (score > best.score) {
      best = { mood: bin.mood, reason: bin.reason, score };
    }
  }

  // Require minimal evidence so we do not flap moods on weak signals.
  if (best.score < 2) {
    return { mood: null, reason: null, score: best.score };
  }

  return best;
}

export function publishMoodForWhisper(
  text: string,
  opts?: { tags?: string[]; explicitMood?: LumaMood | null },
): LumaMood | null {
  const { mood } = classifyMoodFromWhisper(text, opts);
  if (mood) {
    publishLumaMood(mood);
  }
  return mood ?? null;
}
