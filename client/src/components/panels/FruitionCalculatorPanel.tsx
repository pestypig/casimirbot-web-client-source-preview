import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildMoralGraphLaunchReflectionArtifacts } from "@/lib/moral-graph/fruitionLaunchArtifact";
import { useFruitionCalculatorStore } from "@/store/useFruitionCalculatorStore";
import type {
  FruitionProcedureExpressionV1,
  FruitionProcedureOperatorV1,
  FruitionProcedureTermV1,
} from "@shared/fruition-procedure-expression";

function labelize(value: string): string {
  return value.replace(/[_-]/g, " ");
}

function termTone(term: FruitionProcedureTermV1): string {
  if (term.polarity === "blocks") return "border-rose-800/70 bg-rose-950/30 text-rose-100";
  if (term.polarity === "requires") return "border-amber-800/70 bg-amber-950/30 text-amber-100";
  if (term.kind === "lens" || term.kind === "trait") return "border-cyan-800/70 bg-cyan-950/30 text-cyan-100";
  return "border-slate-800 bg-slate-950/70 text-slate-200";
}

function operatorTone(operator: FruitionProcedureOperatorV1): string {
  if (operator.kind === "blocks") return "border-rose-800/70 bg-rose-950/20";
  if (operator.kind === "requires" || operator.kind === "asks_for") return "border-amber-800/70 bg-amber-950/20";
  if (operator.kind === "supports") return "border-emerald-800/70 bg-emerald-950/20";
  return "border-slate-800 bg-slate-950/60";
}

function TermRow({ term }: { term: FruitionProcedureTermV1 }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${termTone(term)}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[160px] flex-1 truncate text-sm font-semibold">{term.label}</span>
        <Badge variant="outline" className="border-current/30 text-[10px] text-current">
          {term.proceduralRole ? labelize(term.proceduralRole) : labelize(term.kind)}
        </Badge>
        <Badge variant="outline" className="border-current/30 text-[10px] text-current">
          {term.procedureOperator ? labelize(term.procedureOperator) : labelize(term.polarity)}
        </Badge>
        <span className="font-mono text-[10px] opacity-70">{term.confidence.toFixed(2)}</span>
      </div>
      {term.actionEffect ? <p className="mt-2 text-xs opacity-85">{term.actionEffect}</p> : null}
    </div>
  );
}

function OperatorRow({ operator }: { operator: FruitionProcedureOperatorV1 }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${operatorTone(operator)}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[160px] flex-1 truncate text-sm font-semibold text-slate-100">{operator.label}</span>
        <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-300">
          {labelize(operator.kind)}
        </Badge>
      </div>
      <p className="mt-2 text-xs text-slate-400">{operator.rationale}</p>
    </div>
  );
}

function ExpressionView({ expression }: { expression: FruitionProcedureExpressionV1 }) {
  const [solvedAt, setSolvedAt] = useState(() => new Date().toISOString());

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-3">
        <section className="rounded-md border border-violet-900/70 bg-violet-950/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-300">Procedural expression</div>
            <Button
              type="button"
              size="sm"
              className="bg-violet-700 text-white hover:bg-violet-600"
              onClick={() => setSolvedAt(new Date().toISOString())}
            >
              Solve
            </Button>
          </div>
          <div className="mt-3 min-h-[104px] rounded border border-violet-800/70 bg-black/35 p-3 font-mono text-sm leading-relaxed text-violet-100">
            {expression.expression}
          </div>
        </section>

        <section className="rounded-md border border-cyan-800 bg-cyan-950/25 p-4" data-testid="fruition-answer-box">
          <div className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Answer</div>
          <div className="mt-2 text-xl font-semibold text-slate-50">{expression.result.label}</div>
          <div className="mt-1 font-mono text-sm text-cyan-100">{labelize(expression.result.posture)}</div>
          <div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
            <div>Recommended actions: {expression.result.recommendedActionIds.length}</div>
            <div>Missing checks: {expression.result.missingEvidence.length ? expression.result.missingEvidence.map(labelize).join(", ") : "none"}</div>
            <div>Admission: {expression.result.admission.summary.autoCount} auto / {expression.result.admission.summary.askUserCount} ask user / {expression.result.admission.summary.blockedCount} blocked</div>
            <div>Executable: {expression.result.agentExecutable ? "true" : "false"}</div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
            <Badge variant="outline" className="border-slate-700">calculator: {expression.calculator.name}</Badge>
            <Badge variant="outline" className="border-slate-700">model calls: {expression.calculator.modelCalls}</Badge>
            <Badge variant="outline" className="border-slate-700">schema: {expression.schemaVersion}</Badge>
            <Badge variant="outline" className="border-cyan-700 text-cyan-100">solved: {new Date(solvedAt).toLocaleTimeString()}</Badge>
          </div>
          <div className="mt-3 rounded border border-cyan-900/70 bg-cyan-950/20 p-3 text-xs text-cyan-100">
            Evidence only / diagnostic authority / terminal ineligible.
          </div>
        </section>

        <section className="rounded-md border border-slate-800 bg-slate-950/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Trace</div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-300">
              <Badge variant="outline" className="border-slate-700">{expression.terms.length} terms</Badge>
              <Badge variant="outline" className="border-slate-700">{expression.operators.length} operators</Badge>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {expression.operators.map((operator) => (
              <OperatorRow key={operator.id} operator={operator} />
            ))}
            {expression.terms.slice(0, 10).map((term) => (
              <TermRow key={term.id} term={term} />
            ))}
          </div>
          <div className="mt-3 grid gap-1 text-xs text-slate-500">
            <div>Kind: {labelize(expression.inputs.inputKind)}</div>
            <div>Refs: {(expression.inputs.refs ?? []).join(", ") || "none"}</div>
            <div>Reflection: {expression.sourceReflectionId}</div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function FruitionCalculatorPanel() {
  const { currentExpression, history, loadExpression, clear } = useFruitionCalculatorStore();
  const demoExpression = useMemo(() => buildMoralGraphLaunchReflectionArtifacts().fruition, []);
  const expression = currentExpression ?? demoExpression;

  return (
    <div className="flex h-full min-h-[520px] flex-col bg-slate-950 text-slate-100" data-testid="fruition-calculator-panel">
      <header className="border-b border-slate-800 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Fruition Calculator</h2>
            <p className="mt-1 text-sm text-slate-400">
              Deterministic procedure expression from Moral Badge Graph reflection.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!currentExpression ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-violet-700 text-violet-100"
                onClick={() => loadExpression(demoExpression, { source: "launch_demo" })}
              >
                Load Demo Expression
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" className="border-slate-700 text-slate-200" onClick={clear}>
              Clear
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
          <Badge variant="outline" className="border-slate-700">{expression.terms.length} terms</Badge>
          <Badge variant="outline" className="border-slate-700">{expression.operators.length} operators</Badge>
          <Badge variant="outline" className="border-slate-700">{history.length} history entries</Badge>
        </div>
      </header>
      <ExpressionView expression={expression} />
    </div>
  );
}
