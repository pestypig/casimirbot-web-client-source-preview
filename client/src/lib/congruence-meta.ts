export type CongruenceMetaLike = {
  source?: string;
  congruence?: string;
  proxy?: boolean;
};

const hasMeta = (meta: CongruenceMetaLike | null | undefined) =>
  Boolean(meta && (meta.source || meta.congruence || meta.proxy != null));

export const resolveCongruenceMeta = (
  ...candidates: Array<CongruenceMetaLike | null | undefined>
): CongruenceMetaLike => {
  const selected = candidates.find(hasMeta);
  const source = selected?.source ?? "unknown";
  const congruence = selected?.congruence ?? "unknown";
  const proxy =
    selected?.proxy === true || congruence === "proxy-only" || !selected;
  return { source, congruence, proxy };
};

export const buildCongruenceBadge = (meta: CongruenceMetaLike) => {
  const proxy = meta.proxy === true || meta.congruence === "proxy-only";
  const label = proxy
    ? meta.congruence === "conditional"
      ? "CONDITIONAL"
      : "PROXY"
    : "METRIC";
  const toneClass = proxy
    ? "border-amber-400/60 text-amber-200"
    : "border-emerald-400/60 text-emerald-200";
  return { label, toneClass, proxy };
};
