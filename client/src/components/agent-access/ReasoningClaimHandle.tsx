import React, { useEffect, useRef, useState } from "react";

export default function ReasoningClaimHandle({ value, id = "reasoning-claim-handle", label = "Show-once claim handle" }:
  { value: string; id?: string; label?: string }) {
  const field = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const [state, setState] = useState<"idle" | "copying" | "copied" | "manual">("idle");
  useEffect(() => {
    generation.current++;
    setState("idle");
    return () => { generation.current++; };
  }, [value]);

  const copy = async () => {
    const current = generation.current;
    setState("copying");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await Promise.race([
        navigator.clipboard.writeText(value),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("clipboard_timeout")), 4000); }),
      ]);
      if (current === generation.current) setState("copied");
    } catch {
      if (current === generation.current) {
        setState("manual");
        field.current?.focus();
        field.current?.select();
      }
    } finally { if (timer) clearTimeout(timer); }
  };

  return <>
    <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-cyan-200"
      htmlFor={id}>{label}</label>
    <input ref={field} id={id} readOnly value={value}
      data-helix-control-id="workstation.panel.agent-access.agent-connection-setup.reasoning-claim-handle"
      data-helix-interaction-kind="observe" data-helix-authority-state="client_local"
      className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 font-mono text-xs text-cyan-100" />
    <button type="button" onClick={() => void copy()} disabled={state === "copying"}
      className="mt-2 rounded border border-white/20 px-3 py-2"
      aria-describedby={`${id}-copy-status`}>
      {state === "copying" ? "Copying invitation…" : "Copy invitation"}
    </button>
    <p id={`${id}-copy-status`} role="status" className="mt-1 text-xs">
      {state === "copied" ? "Invitation copied. Paste it into the exact AI task shown above. Copying does not accept the binding."
        : state === "manual" ? "Automatic copy could not be confirmed. The invitation is selected; press Ctrl+C to copy it."
        : "Copy this invitation to the exact AI task. Its expiry does not change when copied."}
    </p>
  </>;
}
