const MORAL_GRAPH_CUE_RE = /\b(?:moral\s*badge\s*graph|moral\s*graph|moralgraph)\b/i;

const MORAL_GRAPH_REFLECTION_CUE_RE =
  /\b(?:activate|badge|badges|character\s+perspective|compare|direct\s+observation|fruition|lens|lenses|missing\s+evidence|plot|reflect|reflection|right\s+speech|two[-\s]?key|wise|wisdom)\b/i;

const NEGATED_MORAL_GRAPH_RE =
  /\b(?:avoid|do\s+not|don't|skip|without)\s+(?:using\s+|use\s+)?(?:the\s+)?(?:moral\s*badge\s*graph|moral\s*graph|moralgraph)\b/i;

const SCREEN_VISIBLE_MORAL_GRAPH_RE =
  /\b(?:button|label|panel|screen|tab|text|title|visible)\b.{0,48}\b(?:moral\s*badge\s*graph|moral\s*graph|moralgraph)\b/i;

const CURRENT_INTENT_RE =
  /\b(?:activate|compare|plot|reflect|use)\b.{0,64}\b(?:moral\s*badge\s*graph|moral\s*graph|moralgraph)\b|\b(?:moral\s*badge\s*graph|moral\s*graph|moralgraph)\b.{0,64}\b(?:activate|compare|plot|reflect|reflection|use)\b/i;

export function shouldUseIsolatedMoralGraphAskTurn(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (!MORAL_GRAPH_CUE_RE.test(trimmed)) return false;
  if (NEGATED_MORAL_GRAPH_RE.test(trimmed)) return false;
  if (!MORAL_GRAPH_REFLECTION_CUE_RE.test(trimmed)) return false;
  if (SCREEN_VISIBLE_MORAL_GRAPH_RE.test(trimmed) && !CURRENT_INTENT_RE.test(trimmed)) return false;
  return true;
}
