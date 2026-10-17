import { useMemo, useRef, useState, type MouseEvent } from "react";
import type { TermDef } from "@/lib/first-read-terms";
import { FIRST_READ_TERM_MAP } from "@/lib/first-read-terms";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type DefinitionChipProps = {
  term: TermDef;
  showDefinition: boolean;
  className?: string;
};

const baseChipClasses =
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-none";

export function DefinitionChip({ term, showDefinition, className }: DefinitionChipProps) {
  const chipText = showDefinition ? term.label : term.symbol ?? term.label;

  const [manualOpen, setManualOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const open = manualOpen || autoOpen;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setManualOpen((prev) => !prev);
  };

  const handleOpenChange = (next: boolean) => {
    setAutoOpen(next);
    if (!next) {
      setManualOpen(false);
    }
  };

  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={250}>
      <Tooltip open={open} onOpenChange={handleOpenChange} disableHoverableContent>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            className={`${baseChipClasses} ${showDefinition ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200" : "border-slate-600 bg-slate-800/80 text-slate-200"} ${className ?? ""}`}
            aria-label={`Definition for ${term.label}`}
          >
            {term.symbol ? <span className="font-mono text-[10px]">{term.symbol}</span> : null}
            <span className={showDefinition ? "text-[11px]" : "text-[10px] uppercase tracking-wide"}>
              {chipText}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-left text-xs leading-relaxed text-slate-200">
          <p className="font-semibold text-slate-50">
            {term.label}
            {term.unit ? ` (${term.unit})` : ""}
          </p>
          {term.define ? <p className="mt-1">{term.define}</p> : null}
          {term.why ? <p className="mt-1 text-[11px] text-slate-300">{term.why}</p> : null}
          {term.sourceField ? (
            <p className="mt-1 text-[11px] text-slate-400">Source: {term.sourceField}</p>
          ) : null}
          {term.cite ? (
            <p className="mt-1 text-[11px] text-slate-400">See: {term.cite}</p>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function useTermRegistry() {
  const seenRef = useRef(new Set<string>());
  const lookup = useMemo(() => FIRST_READ_TERM_MAP, []);
  return (termId: string) => {
    const term = lookup[termId];
    if (!term) return { term: undefined, showDefinition: false };
    const firstTime = !seenRef.current.has(termId);
    if (firstTime) {
      seenRef.current.add(termId);
    }
    return { term, showDefinition: firstTime };
  };
}
