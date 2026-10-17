import nerdamer from "nerdamer";
import "nerdamer/Algebra";
import "nerdamer/Calculus";
import "nerdamer/Solve";
import {
  buildScientificCalculatorStepTraceArtifactV1,
  type ScientificCalculatorStepTraceArtifactV1,
  type ScientificFallbackReason,
  type ScientificResultKind,
  type ScientificResultSchemaV1,
  type ScientificStepSchemaV1,
} from "@shared/contracts/scientific-calculator-step-schema.v1";

const nerdamerLatex = nerdamer as typeof nerdamer & {
  convertFromLaTeX: (value: string) => { toString: () => string };
  convertToLaTeX: (value: string) => string;
};

export type ScientificSolveMode = "expression" | "equation";
export type ScientificCapabilityClass =
  | "arithmetic"
  | "symbolic_algebra"
  | "latex_parse"
  | "calculus"
  | "gr_warp_physics"
  | "unsupported";

export type ScientificSolveTrace = {
  traceId: string;
  runId: string;
  route: string;
  engine: "nerdamer" | "warp_full_solve" | "unsupported";
  sourceOfTruth: "scientific_calculator" | "einstein_backend" | "unsupported";
  capabilityClass: ScientificCapabilityClass;
  artifactPath: string | null;
  delegatedTo?: string | null;
  warnings: string[];
};

export type ScientificSolveStep = {
  id: string;
  label: string;
  value: string;
  latex?: string;
};

export type ScientificSolveResult = {
  ok: boolean;
  mode: ScientificSolveMode;
  input_latex: string;
  normalized_expression: string;
  variable: string | null;
  result_text: string;
  result_latex?: string;
  steps: ScientificSolveStep[];
  trace: ScientificSolveTrace;
  error?: string;
  artifact_v1?: ScientificCalculatorStepTraceArtifactV1;
};

function makeTraceId(prefix = "scicalc"): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}:${Date.now().toString(36)}:${random}`;
}

function classifyScientificCapability(input: string): ScientificCapabilityClass {
  const normalized = input.toLowerCase();
  if (
    /\b(?:einstein\s+tensor|nat[aá]rio|qi\s+guardrail|quantum\s+inequality|full[-\s]?solve|warp[-\s]?full|rho\s*source|stress[-\s]?energy)\b/i.test(input) ||
    /g_\{?\\?mu\\?nu\}?|t_\{?00\}?|g4_qi|warp\.metric/i.test(input)
  ) {
    return "gr_warp_physics";
  }
  if (/\\frac\s*\{\s*d\s*\}\s*\{\s*d|diff\s*\(|differentiat|derivative/.test(normalized)) return "calculus";
  if (/\\|[\{\}\^_]/.test(input)) return "latex_parse";
  if (/[a-z]/i.test(input)) return "symbolic_algebra";
  return "arithmetic";
}

function buildTrace(input: string, warnings: string[] = []): ScientificSolveTrace {
  const capabilityClass = classifyScientificCapability(input);
  const traceId = makeTraceId(capabilityClass === "gr_warp_physics" ? "scicalc-delegate" : "scicalc");
  if (capabilityClass === "gr_warp_physics") {
    return {
      traceId,
      runId: traceId,
      route: "scientific-calculator/capability-router",
      engine: "unsupported",
      sourceOfTruth: "einstein_backend",
      capabilityClass,
      delegatedTo: "/api/physics/warp/calculator",
      artifactPath: null,
      warnings: [
        "Input was classified as GR/warp physics; use the warp/full-solve backend for a traceable result.",
        ...warnings,
      ],
    };
  }
  return {
    traceId,
    runId: traceId,
    route: "scientific-calculator/nerdamer",
    engine: "nerdamer",
    sourceOfTruth: "scientific_calculator",
    capabilityClass,
    artifactPath: null,
    warnings,
  };
}

function asNonEmpty(value: string): string {
  return value.trim();
}

function sanitizeLatexInput(value: string): string {
  return value
    .replace(/([A-Za-z0-9}\]])\\(?=[A-Za-z])/g, "$1*\\\\")
    .replace(/\\[,;:!]/g, " ")
    .replace(/\\quad\b|\\qquad\b/g, " ")
    .replace(/\\left\b|\\right\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function expressionFromLatexOrText(value: string): string {
  const input = sanitizeLatexInput(asNonEmpty(value));
  if (!input) return "";
  const hasLatexSignal = /\\|\{|\}|_/.test(input);
  if (!hasLatexSignal) return input;
  try {
    const converted = nerdamerLatex.convertFromLaTeX(input).toString();
    const lookedLikeTuple = converted.startsWith("(") && converted.endsWith(")") && converted.includes(",");
    const inputHadCommas = input.includes(",");
    if (lookedLikeTuple && !inputHadCommas) {
      return input;
    }
    return converted;
  } catch {
    return input;
  }
}

function toLatexExpression(expression: string): string {
  const trimmed = expression.trim();
  if (!trimmed) return "";
  try {
    return nerdamerLatex.convertToLaTeX(trimmed);
  } catch {
    return trimmed;
  }
}

function toLatexEquation(equation: string): string {
  const trimmed = equation.trim();
  if (!trimmed) return "";
  const eqIndex = trimmed.indexOf("=");
  if (eqIndex === -1) return toLatexExpression(trimmed);
  const lhs = trimmed.slice(0, eqIndex).trim();
  const rhs = trimmed.slice(eqIndex + 1).trim();
  return `${toLatexExpression(lhs)} = ${toLatexExpression(rhs)}`;
}

function formatNumericResult(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value !== 0 && (Math.abs(value) >= 1e6 || Math.abs(value) < 1e-6)) {
    return value.toExponential(6).replace(/\.?0+e/, "e");
  }
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(12)));
}

const SAFE_MATH_IDENTIFIERS = new Set(["sqrt", "ln", "log", "exp", "sin", "cos", "tan", "abs", "pi", "e"]);

function evaluateSafeArithmeticExpression(expression: string): string | null {
  const normalized = expression.replace(/\s+/g, "");
  if (!normalized || !/^[\dA-Za-z_.+\-*/^(),]+$/.test(normalized)) return null;
  if (!/[+\-*/^]/.test(normalized)) return null;
  const identifiers = normalized.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  if (identifiers.some((identifier) => !SAFE_MATH_IDENTIFIERS.has(identifier.toLowerCase()))) return null;
  try {
    const jsExpression = normalized
      .replace(/\b(?:pi|e)\b/gi, (constant) => (constant.toLowerCase() === "pi" ? "Math.PI" : "Math.E"))
      .replace(/\^/g, "**")
      .replace(/\bsqrt\s*\(/gi, "Math.sqrt(")
      .replace(/\blog\s*\(/gi, "Math.log(")
      .replace(/\bln\s*\(/gi, "Math.log(")
      .replace(/\bexp\s*\(/gi, "Math.exp(")
      .replace(/\bsin\s*\(/gi, "Math.sin(")
      .replace(/\bcos\s*\(/gi, "Math.cos(")
      .replace(/\btan\s*\(/gi, "Math.tan(")
      .replace(/\babs\s*\(/gi, "Math.abs(");
    const value = Function(`"use strict"; return (${jsExpression});`)();
    return typeof value === "number" && Number.isFinite(value) ? formatNumericResult(value) : null;
  } catch {
    return null;
  }
}

function chooseSolveVariable(expressionText: string): string | null {
  try {
    const vars = nerdamer(expressionText)
      .variables()
      .filter((variable) => !SAFE_MATH_IDENTIFIERS.has(variable.toLowerCase()));
    if (!vars.length) return null;
    return vars.includes("x") ? "x" : vars[0] ?? null;
  } catch {
    return null;
  }
}

function inferPrimaryEquationVariable(lhsExpr: string, fallbackExpr: string): string | null {
  try {
    const lhsVars = nerdamer(lhsExpr).variables();
    if (lhsVars.length) return lhsVars[0] ?? null;
  } catch {
    // fall through to fallback expression variable inference
  }
  return chooseSolveVariable(fallbackExpr);
}

function asArtifactMode(mode: ScientificSolveMode): "evaluate_expression" | "solve_equation" {
  return mode === "equation" ? "solve_equation" : "evaluate_expression";
}

function buildArtifactSteps(args: {
  inputLatex: string;
  canonicalText: string;
  canonicalLatex: string | null;
  mode: ScientificSolveMode;
  methodText: string;
  solveText: string;
  solveLatex: string | null;
  verificationText: string;
  verificationStatus: "pass" | "fail" | "not_run";
  resultText: string;
  resultLatex: string | null;
  warnings?: string[];
}): ScientificStepSchemaV1[] {
  const modeLabel = args.mode === "equation" ? "equation" : "expression";
  return [
    {
      id: "input",
      index: 1,
      stage: "input",
      title: "Input",
      text: args.inputLatex.trim() || "No calculator input provided.",
      latex: args.inputLatex.trim() || null,
      operation: { kind: "note", rule: "capture_user_input" },
      warnings: [],
    },
    {
      id: "normalize",
      index: 2,
      stage: "normalize",
      title: "Canonical Form",
      text: args.canonicalText || "No canonical expression was produced.",
      latex: args.canonicalLatex,
      operation: { kind: "rewrite", rule: "latex_or_text_to_nerdamer_canonical_form" },
      warnings: args.canonicalText ? [] : ["normalization_empty"],
    },
    {
      id: "assumptions",
      index: 3,
      stage: "assumptions",
      title: "Assumptions",
      text: "Domain unspecified; angle mode radian.",
      latex: null,
      operation: { kind: "note", rule: "default_calculator_assumptions" },
      warnings: [],
    },
    {
      id: "transform",
      index: 4,
      stage: "transform",
      title: "Transform",
      text:
        args.mode === "equation"
          ? "Rewrite the relation into standard solve form."
          : "Expand and simplify the canonical expression.",
      latex: args.mode === "equation" ? args.canonicalLatex : args.solveLatex,
      operation: { kind: args.mode === "equation" ? "rewrite" : "expand", rule: `${modeLabel}_transform` },
      warnings: [],
    },
    {
      id: "method",
      index: 5,
      stage: "method",
      title: "Method",
      text: args.methodText,
      latex: null,
      operation: { kind: "note", rule: "select_symbolic_engine_route" },
      warnings: [],
    },
    {
      id: "solve",
      index: 6,
      stage: "solve",
      title: "Solve",
      text: args.solveText,
      latex: args.solveLatex,
      operation: { kind: "solve", rule: args.mode === "equation" ? "nerdamer_solve_for_variable" : "nerdamer_evaluate" },
      warnings: args.warnings ?? [],
    },
    {
      id: "verify",
      index: 7,
      stage: "verify",
      title: "Verification",
      text: args.verificationText,
      latex: null,
      operation: { kind: "verify", rule: "calculator_trace_verification_status" },
      warnings: args.verificationStatus === "pass" ? [] : ["verification_not_proven_by_calculator"],
    },
    {
      id: "result",
      index: 8,
      stage: "result",
      title: "Result",
      text: args.resultText,
      latex: args.resultLatex,
      operation: { kind: "note", rule: "emit_result" },
      warnings: [],
    },
  ];
}

function buildArtifactV1(args: {
  mode: ScientificSolveMode;
  inputLatex: string;
  canonicalText: string;
  canonicalLatex: string | null;
  targetVariable: string | null;
  steps: ScientificStepSchemaV1[];
  result: ScientificResultSchemaV1;
  confidence: number;
  fallbackReason: ScientificFallbackReason | null;
  engine: ScientificCalculatorStepTraceArtifactV1["quality"]["engine"];
  parseStatus?: ScientificCalculatorStepTraceArtifactV1["normalization"]["parseStatus"];
  issues?: string[];
}): ScientificCalculatorStepTraceArtifactV1 {
  return buildScientificCalculatorStepTraceArtifactV1({
    panelId: "scientific-calculator",
    generatedAt: new Date().toISOString(),
    request: {
      mode: asArtifactMode(args.mode),
      inputLatex: args.inputLatex,
      targetVariable: args.targetVariable,
      assumptions: {
        domain: "unspecified",
        angleMode: "radian",
      },
    },
    normalization: {
      parseStatus: args.parseStatus ?? "ok",
      canonicalText: args.canonicalText,
      canonicalLatex: args.canonicalLatex,
      issues: args.issues ?? [],
    },
    steps: args.steps,
    result: args.result,
    quality: {
      confidence: args.confidence,
      fallbackReason: args.fallbackReason,
      engine: args.engine,
    },
  });
}

function buildResultSchema(args: {
  kind: ScientificResultKind;
  text: string;
  latex: string | null;
  variable?: string | null;
  verificationStatus?: "pass" | "fail" | "not_run";
  verificationText?: string;
}): ScientificResultSchemaV1 {
  return {
    kind: args.kind,
    text: args.text,
    latex: args.latex,
    solutions: args.variable
      ? [
          {
            variable: args.variable,
            text: args.text,
            latex: args.latex,
          },
        ]
      : [],
    verification: {
      status: args.verificationStatus ?? "not_run",
      text: args.verificationText ?? "Verification was not run by this calculator route.",
    },
  };
}

function makeArtifactResult(args: {
  mode: ScientificSolveMode;
  inputLatex: string;
  canonicalText: string;
  canonicalLatex: string | null;
  targetVariable: string | null;
  resultText: string;
  resultLatex: string | null;
  resultKind: ScientificResultKind;
  methodText: string;
  solveText?: string;
  verificationStatus?: "pass" | "fail" | "not_run";
  verificationText?: string;
  confidence: number;
  fallbackReason: ScientificFallbackReason | null;
  engine?: ScientificCalculatorStepTraceArtifactV1["quality"]["engine"];
  parseStatus?: ScientificCalculatorStepTraceArtifactV1["normalization"]["parseStatus"];
  issues?: string[];
  warnings?: string[];
}): ScientificCalculatorStepTraceArtifactV1 {
  const verificationStatus = args.verificationStatus ?? "not_run";
  const verificationText =
    args.verificationText ?? "Verification was not run by this calculator route.";
  const result = buildResultSchema({
    kind: args.resultKind,
    text: args.resultText,
    latex: args.resultLatex,
    variable: args.targetVariable,
    verificationStatus,
    verificationText,
  });
  const steps = buildArtifactSteps({
    inputLatex: args.inputLatex,
    canonicalText: args.canonicalText,
    canonicalLatex: args.canonicalLatex,
    mode: args.mode,
    methodText: args.methodText,
    solveText: args.solveText ?? args.resultText,
    solveLatex: args.resultLatex,
    verificationStatus,
    verificationText,
    resultText: args.resultText,
    resultLatex: args.resultLatex,
    warnings: args.warnings,
  });
  return buildArtifactV1({
    mode: args.mode,
    inputLatex: args.inputLatex,
    canonicalText: args.canonicalText,
    canonicalLatex: args.canonicalLatex,
    targetVariable: args.targetVariable,
    steps,
    result,
    confidence: args.confidence,
    fallbackReason: args.fallbackReason,
    engine: args.engine ?? "nerdamer",
    parseStatus: args.parseStatus,
    issues: args.issues,
  });
}

function inferExpressionResultKind(value: string): ScientificResultKind {
  if (/[a-z]/i.test(value)) return "symbolic_relation";
  return value.includes(".") ? "approximate" : "exact";
}

export function runScientificSolve(inputLatex: string, withSteps: boolean): ScientificSolveResult {
  const input = asNonEmpty(inputLatex);
  const trace = buildTrace(input);
  if (!input) {
    const artifact_v1 = makeArtifactResult({
      mode: "expression",
      inputLatex,
      canonicalText: "",
      canonicalLatex: null,
      targetVariable: null,
      resultText: "No equation input provided.",
      resultLatex: null,
      resultKind: "unsolved",
      methodText: "No solver route was selected because the input was empty.",
      verificationText: "Verification was not run because there was no input.",
      confidence: 0,
      fallbackReason: "parser_normalization_limit",
      parseStatus: "error",
      issues: ["empty_input"],
      warnings: ["empty_input"],
    });
    return {
      ok: false,
      mode: "expression",
      input_latex: inputLatex,
      normalized_expression: "",
      variable: null,
      result_text: "",
      result_latex: "",
      steps: [],
      trace,
      error: "No equation input provided.",
      artifact_v1,
    };
  }

  try {
    if (trace.capabilityClass === "gr_warp_physics") {
      const mode = input.includes("=") ? "equation" : "expression";
      const artifact_v1 = makeArtifactResult({
        mode,
        inputLatex: input,
        canonicalText: input,
        canonicalLatex: input,
        targetVariable: null,
        resultText: "This calculation requires the warp/full-solve backend.",
        resultLatex: null,
        resultKind: "unsolved",
        methodText: "The calculator routed this GR/warp request to the backend-only solver family.",
        solveText: "Delegate to /api/physics/warp/calculator for a traceable GR/warp result.",
        verificationText: "Verification was not run by the scientific calculator.",
        confidence: 0.2,
        fallbackReason: "engine_not_implemented",
        warnings: trace.warnings,
      });
      return {
        ok: false,
        mode,
        input_latex: input,
        normalized_expression: input,
        variable: null,
        result_text: "This calculation requires the warp/full-solve backend.",
        result_latex: "",
        steps: withSteps
          ? [
              { id: "input", label: "Input", value: input, latex: input },
              {
                id: "capability_route",
                label: "Capability Route",
                value: "GR/warp physics is backend-only; delegate to /api/physics/warp/calculator.",
              },
            ]
          : [],
        trace,
        error: "backend_required",
        artifact_v1,
      };
    }

    const steps: ScientificSolveStep[] = [];
    const pushStep = (id: string, label: string, value: string, latex?: string) => {
      if (!withSteps) return;
      steps.push({ id, label, value, latex });
    };

    pushStep("input", "Input", input, input);

    if (input.includes("=")) {
      const [lhsRaw, ...rhsParts] = input.split("=");
      const rhsRaw = rhsParts.join("=");
      const lhsExpr = expressionFromLatexOrText(lhsRaw);
      const rhsExpr = expressionFromLatexOrText(rhsRaw);
      const normalized = `${lhsExpr} = ${rhsExpr}`;
      pushStep("normalized", "Canonical Equation", normalized, toLatexEquation(normalized));
      const rearranged = `(${lhsExpr})-(${rhsExpr})`;
      const standardForm = `${rearranged} = 0`;
      pushStep("rearranged", "Standard Form", standardForm, toLatexEquation(standardForm));
      const variable = inferPrimaryEquationVariable(lhsExpr, rearranged);
      pushStep("target_variable", "Target Variable", variable ?? "none");

      let resultText = "";
      let resultLatex = "";
      let solveError = "";

      if (variable) {
        const solver = nerdamer as unknown as {
          solveEquations?: (equations: string | string[], variable?: string) => unknown;
        };
        if (typeof solver.solveEquations === "function") {
          try {
            const solved = solver.solveEquations(normalized, variable);
            if (Array.isArray(solved) && solved.length > 0) {
              resultText = solved
                .map((entry) => {
                  if (Array.isArray(entry)) {
                    return entry.map((item) => String(item)).join(" = ");
                  }
                  return String(entry);
                })
                .join(", ");
              resultLatex = solved
                .map((entry) => {
                  if (Array.isArray(entry) && entry.length >= 2) {
                    return `${toLatexExpression(String(entry[0]))} = ${toLatexExpression(String(entry[1]))}`;
                  }
                  return `${toLatexExpression(variable)} = ${toLatexExpression(String(entry))}`;
                })
                .join(",\\ ");
            }
          } catch (error) {
            solveError = error instanceof Error ? error.message : String(error);
          }
        }
        if (!resultText) {
          try {
            const solved = nerdamer(rearranged).solveFor(variable);
            resultText = solved.toString();
            resultLatex = `${toLatexExpression(variable)} = ${toLatexExpression(resultText)}`;
          } catch (error) {
            solveError = error instanceof Error ? error.message : String(error);
          }
        }
      } else {
        solveError = "No symbolic variable detected for direct solve.";
      }

      if (!resultText) {
        resultText = `${normalized} (symbolic relation preserved; direct closed-form solve unavailable)`;
        resultLatex = toLatexEquation(normalized);
        pushStep("solver_notice", "Solver Notice", "Direct closed-form solve unavailable for this symbolic relation.");
      }
      pushStep("solved", variable ? `Solve for ${variable}` : "Symbolic Relation", resultText, resultLatex);
      const solvedAsRelation = resultText.includes("symbolic relation preserved");
      const artifact_v1 = makeArtifactResult({
        mode: "equation",
        inputLatex: input,
        canonicalText: normalized,
        canonicalLatex: toLatexEquation(normalized),
        targetVariable: variable,
        resultText,
        resultLatex,
        resultKind: solvedAsRelation ? "symbolic_relation" : "exact",
        methodText: variable
          ? `Use Nerdamer symbolic solving with target variable ${variable}.`
          : "Preserve the relation because no symbolic target variable was detected.",
        verificationText: solvedAsRelation
          ? "Closed-form verification was not run because the relation was preserved symbolically."
          : "Closed-form verification was not run by this calculator route.",
        confidence: solvedAsRelation ? 0.55 : 0.9,
        fallbackReason: solvedAsRelation
          ? variable
            ? "no_closed_form"
            : "multiple_symbols_ambiguous_target"
          : null,
        warnings: solvedAsRelation ? ["direct_closed_form_solve_unavailable"] : [],
      });
      return {
        ok: true,
        mode: "equation",
        input_latex: input,
        normalized_expression: normalized,
        variable,
        result_text: resultText,
        result_latex: resultLatex,
        steps,
        trace,
        artifact_v1,
      };
    }

    const normalizedExpression = expressionFromLatexOrText(input);
    pushStep("normalized", "Canonical Expression", normalizedExpression, toLatexExpression(normalizedExpression));
    const simplified = nerdamer(normalizedExpression).expand().toString();
    pushStep("simplified", "Expanded/Simplified", simplified, toLatexExpression(simplified));
    let evaluated = simplified;
    let evaluatedLatex = toLatexExpression(simplified);
    try {
      evaluated = nerdamer(simplified).evaluate().text("decimals");
      const safeArithmeticResult = evaluateSafeArithmeticExpression(normalizedExpression);
      if (
        safeArithmeticResult &&
        (/[A-Za-z]/.test(evaluated) || /[eE]/.test(normalizedExpression) || /^-?0(?:\.0+)?$/.test(evaluated.trim())) &&
        safeArithmeticResult !== "0"
      ) {
        evaluated = safeArithmeticResult;
      }
      evaluatedLatex = toLatexExpression(evaluated);
      pushStep("evaluated", "Evaluated", evaluated, evaluatedLatex);
    } catch (error) {
      pushStep("evaluation_notice", "Evaluation Notice", "Evaluation was unavailable; preserving the symbolic expression.");
      pushStep("evaluated", "Symbolic Result", evaluated, evaluatedLatex);
    }

    const expressionResultKind = inferExpressionResultKind(evaluated);
    const artifact_v1 = makeArtifactResult({
      mode: "expression",
      inputLatex: input,
      canonicalText: normalizedExpression,
      canonicalLatex: toLatexExpression(normalizedExpression),
      targetVariable: chooseSolveVariable(normalizedExpression),
      resultText: evaluated,
      resultLatex: evaluatedLatex,
      resultKind: expressionResultKind,
      methodText: "Use Nerdamer expand/simplify, then evaluate when possible.",
      verificationText: "Expression evaluation does not require equation substitution verification.",
      confidence: expressionResultKind === "symbolic_relation" ? 0.75 : 0.9,
      fallbackReason: expressionResultKind === "symbolic_relation" ? "no_closed_form" : null,
      warnings: expressionResultKind === "symbolic_relation" ? ["symbolic_expression_preserved"] : [],
    });
    return {
      ok: true,
      mode: "expression",
      input_latex: input,
      normalized_expression: normalizedExpression,
      variable: chooseSolveVariable(normalizedExpression),
      result_text: evaluated,
      result_latex: evaluatedLatex,
      steps,
      trace,
      artifact_v1,
    };
  } catch (error) {
    const mode = input.includes("=") ? "equation" : "expression";
    const normalized = expressionFromLatexOrText(input);
    const artifact_v1 = makeArtifactResult({
      mode,
      inputLatex: input,
      canonicalText: normalized,
      canonicalLatex: mode === "equation" ? toLatexEquation(normalized) : toLatexExpression(normalized),
      targetVariable: null,
      resultText: "The calculator could not complete this solve.",
      resultLatex: null,
      resultKind: "unsolved",
      methodText: "The selected calculator route failed before producing a result.",
      verificationText: "Verification was not run because solving failed.",
      confidence: 0,
      fallbackReason: "internal_solver_error",
      parseStatus: "error",
      issues: ["internal_solver_error"],
      warnings: ["internal_solver_error"],
    });
    return {
      ok: false,
      mode,
      input_latex: input,
      normalized_expression: normalized,
      variable: null,
      result_text: "",
      result_latex: "",
      steps: [],
      trace: buildTrace(input, ["The calculator engine failed before producing a result."]),
      error: "internal_solver_error",
      artifact_v1,
    };
  }
}
