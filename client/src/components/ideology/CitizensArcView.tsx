import { useCallback, useRef, useState, type ReactNode } from "react";
import type { IdeologyNode } from "@/lib/ideology-types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { exportNodeToImage } from "@/lib/ideology/pill-export";
import { Download } from "lucide-react";

type CitizensArcViewProps = {
  onSelectNode: (id: string) => void;
  resolve?: (id: string) => IdeologyNode | null;
  showExportControls?: boolean;
  onToggleExportControls?: (value: boolean) => void;
};

const BRIDGE_LABELS: Record<string, string> = {
  "interbeing-systems": "Interbeing Systems",
  "scarcity-justice": "Scarcity Justice",
  "capability-ambition-gradient": "Capability & the Ambition Gradient",
  "struggle-testament": "Struggle as Testament",
  "promise-trials": "Promise Trials",
  "koan-governance": "Koan Governance",
  "values-over-images": "Values Over Images",
  "worldview-integrity": "Worldview Integrity",
  "beginners-mind": "Beginner's Mind",
  "impermanence-by-design": "Impermanence by Design",
  "verification-checklist": "Verification Checklist",
  "sangha-architecture": "Sangha Architecture",
  "no-bypass-guardrail": "No Bypass Guardrail",
  "integrity-protocols": "Integrity Protocols",
  "inner-spark": "Inner Spark",
  "lifetime-trust-ledger": "Lifetime Trust Ledger",
  "solitude-to-signal": "Solitude to Signal",
  "habit-pressure-break": "Habit Pressure Break",
  "civic-signal-loop": "Civic Signal Loop",
  "three-tenets-loop": "Three Tenets Loop",
  "lawful-interface-protocol": "Lawful Interface Protocol",
  "federal-civic-listening-circuit": "Federal Civic Listening Circuit",
  "metric-integrity-guardrail": "Metric Integrity Guardrail",
  "harm-weighted-priority-standard": "Harm-Weighted Priority Standard",
  "integration-ladder": "Integration Ladder",
  "local-stability-compact": "Local Stability Compact",
  "access-to-counsel-pathway": "Access-to-Counsel Pathway",
  "training-certification-gate": "Training and Certification Gate",
  "citizens-arc-anti-mutation": "Citizen's Arc: Anti-Mutation Addendum",
  "citizens-arc-stress-test": "Citizen's Arc: Stress Test Note"
};

const FLOOR_GUARANTEES = [
  "Basic material security: food, shelter stability, healthcare, safety from violence.",
  "Access infrastructure: education, tools, connectivity, mobility.",
  "Protection without infantilization: support that preserves agency (choices, privacy, dignity)."
];
const FLOOR_REFUSES = [
  "Using desperation as a filter.",
  "Turning vulnerability into a permanent identity tag.",
  "Creating an underclass that subsidizes other people's hero stories."
];
const PROMISE_TRIAL_COMPONENTS = [
  "A clear mission (something the community genuinely needs).",
  "A constraint set (time limits, limited budget, limited tools, ambiguity).",
  "A support frame (training, mentorship, safety backstops).",
  "Accountability (audits, peer review, measurable outcomes).",
  "A debrief (reflection, lessons, documented mistakes)."
];
const PROMISE_TRIAL_EXAMPLES = [
  "Build and run a local mutual-aid logistics system for six months.",
  "Lead a cross-neighborhood mediation project with measurable conflict reduction.",
  "Run a public budget-with-tradeoffs exercise where you must defend pain points openly.",
  "Operate an emergency response drill where information is incomplete and incentives are adversarial."
];
const KOAN_TRADEOFFS = [
  "Who benefits.",
  "Who pays.",
  "What risks rise.",
  "What metrics will prove it failed."
];
const VALUES_OVER_IMAGES = [
  "Ban prestige narratives like \"I am more real because I had it worse.\"",
  "Reward quiet competence: long-term reliability, repair work, truth-telling under pressure.",
  "Reduce incentives for performative suffering (no \"martyr leader\" aesthetic)."
];
const SANGHA_BLOCKS = [
  "Small circles (8 to 20) for mutual aid, accountability, and skills exchange.",
  "Guilds (craft, caregiving, mediation, logistics, teaching) that certify competence through practice, not branding.",
  "Mentorship chains (everyone mentors someone, everyone is mentored by someone).",
  "Rotating service so leadership stays grounded in actual human contact."
];
const NO_BYPASS_MECHANISMS = [
  "No major office without completing specific trials relevant to that office.",
  "No money route around trials. Wealth can fund projects, not unlock seats.",
  "Conflict-of-interest constraints with teeth.",
  "Transparent decision artifacts: if you cannot explain it, you cannot ship it."
];
const INTEGRITY_PROTOCOLS = [
  "Independent auditors with real authority.",
  "Whistleblower protection that is practical, not ceremonial.",
  "Randomized audits of spending, outcomes, and claims.",
  "Clear consequences for deception, especially deception that harms trust."
];
const INNER_SPARK_QUESTIONS = [
  "What are you called to build?",
  "What responsibility can you carry without becoming brittle?",
  "What keeps you honest when nobody is watching?"
];
const TRUST_LEDGER_GUARDRAILS = [
  "Local and contextual, not one number.",
  "Opt-in visibility: you can prove competence without broadcasting your life.",
  "Evidence-based: verified service, peer attestations, audited outcomes.",
  "Time-decaying: old failures do not become life sentences, old wins do not become permanent crowns.",
  "Right to appeal with due process."
];
const SOLITUDE_PRACTICES = [
  "Retreat seasons (digital sabbaths, silent days, nature stints, skill immersions).",
  "Habit breaks that prevent addictive equilibrium (attention hygiene, consumption caps in certain domains).",
  "Reflection as civic practice: debriefing as the way you avoid repeating dumb mistakes with confidence."
];
const ARC_STAGE_TRACKS = [
  "Craft",
  "Care",
  "Coordination",
  "Research",
  "Building",
  "Mediation",
  "Defense",
  "Teaching"
];
const ARC_STAGE_TRIALS = [
  "Personal discipline.",
  "Team leadership.",
  "Resource constraints.",
  "Adversarial conditions.",
  "Moral ambiguity and public accountability."
];
const ARC_STAGE_STEWARDSHIP = [
  "Recorded decisions.",
  "Measured outcomes.",
  "Accountability hooks.",
  "Ongoing trials, because stagnation is the quiet coup."
];
const ARC_STAGE_ELDER = [
  "Mentoring.",
  "Arbitration.",
  "Memory keeping.",
  "Institutional immune system work."
];
const STRENGTH_TRAITS = [
  "The ability to carry complexity.",
  "The willingness to be audited.",
  "The capacity to serve without needing a spotlight.",
  "The discipline to revise beliefs.",
  "The competence to produce real outcomes."
];
const FAILURE_MODES = [
  {
    title: "Caste formation (trial graduates become a priesthood).",
    counter: "Time-limited roles, rotation, renewal trials, sortition chambers, decentralization."
  },
  {
    title: "Gamification (people min-max the trials).",
    counter: "Varied trials, qualitative reviews, integrity traps, long-horizon outcomes."
  },
  {
    title: "Suffering prestige (hardship becomes moral currency).",
    counter: "Values-over-images, reward repair work, punish performative cruelty."
  },
  {
    title: "Ledger dystopia (trust tracking becomes surveillance).",
    counter: "Privacy-first design, local attestations, due process, opt-in visibility."
  },
  {
    title: "Ideological ossification (ethos becomes untouchable dogma).",
    counter: "Koan governance, decision journals, red teams, sunset clauses."
  }
];
const ANTI_MUTATION_MECHANISMS = [
  "Sortition oversight for trials, audits, and ledger disputes.",
  "Rotating authority with hard term limits and cooling-off gaps.",
  "Power decomposition: many small powers, few big ones.",
  "Strong exit rights: portable credentials, safe dissent channels, mobility support.",
  "Cultural immunology: distrust prestige narratives; reward refusal to glamorize pain."
];
const STRESS_TEST_PACKETS = [
  {
    title: "Charismatic trial-optimiser",
    counter: "Cross-checks, ledger decay, and red-team interviews before authority is granted."
  },
  {
    title: "Caregiver exodus",
    counter: "Caregiving credit, alternate trials, and representation floors."
  },
  {
    title: "Audit coup",
    counter: "Audit authority split, rotation, and a public appeal path."
  },
  {
    title: "Border koan",
    counter: "Scarcity allocation charter plus a tradeoff ledger that names who bears the cost."
  },
  {
    title: "Crisis velocity failure",
    counter: "Emergency procedures with sunset clauses and review triggers."
  }
];
const CIVIC_SIGNAL_STEPS = [
  {
    title: "Not-Knowing",
    body: "State uncertainty, cite sources, and allow \"not sure\" responses."
  },
  {
    title: "Bearing Witness",
    body: "Collect grounded input with consent, safety, and data dignity."
  },
  {
    title: "Taking Action",
    body: "Translate signals into lawful, nonviolent moves with review triggers."
  }
];
const SURVEY_SIGNAL_MAP = [
  {
    title: "Integration + stake",
    signal: "Who is rooted, vulnerable, or carrying the local economy.",
    nodes: ["interbeing-systems", "sangha-architecture", "scarcity-justice"],
    action: "Stabilize services, protect livelihoods, reduce coercive scarcity."
  },
  {
    title: "Rights awareness + trust",
    signal: "Whether people know their rights and believe they will be honored.",
    nodes: ["right-speech-infrastructure", "voice-integrity", "data-dignity"],
    action: "Provide lawful rights education, multilingual updates, and safe channels."
  },
  {
    title: "Safety + harm signals",
    signal: "Reports of force, intimidation, or retaliation risk.",
    nodes: ["no-bypass-guardrail", "integrity-protocols", "restorative-harm-repair"],
    action: "Enforce de-escalation, independent review, and repair pathways."
  },
  {
    title: "Incentives + legitimacy",
    signal: "Perceived quotas, rewards, or opaque enforcement incentives.",
    nodes: ["capture-resistance", "civic-memory-continuity", "koan-governance"],
    action: "Publish tradeoffs, remove predatory incentives, and audit outcomes."
  }
];
const LAWFUL_INTERFACE_CHECKLIST = [
  "Publish cooperation boundaries, definitions, and correction logs.",
  "Require dual-key approval for joint actions (legal + ethos).",
  "Provide safe reporting channels with non-retaliation safeguards.",
  "Enforce de-escalation, independent review, and repair pathways for force.",
  "Maintain liaison councils and mediation pathways.",
  "Audit incentives and publish outcomes to prevent capture."
];
const WARP_AMBITION_PUBLIC = [
  "A stable civic floor keeps working people invested in long-horizon research.",
  "Discovery must serve as public utility, not prestige theater.",
  "Clear feedback loops prevent hope from drifting into hype.",
  "Ambition is earned by protecting people from falling through the cracks."
];
const WARP_AMBITION_TECHNICAL = [
  "Scarcity justice and interbeing keep the dependency graph honest.",
  "The three-tenets loop turns uncertainty into public learning.",
  "Integrity protocols and verification gates keep claims constraint-honest.",
  "Koan governance and impermanence keep mandates revisable."
];
const WARP_AMBITION_STAGE = [
  "Exploratory: hypothesis and bounds, not certainty.",
  "Reduced-order: simplified models with stated limits.",
  "Diagnostic: testable predictions and error budgets.",
  "Certified: verified evidence and publishable constraints."
];
const PUBLIC_SAFETY_SPINE_PILLS = [
  {
    id: "federal-civic-listening-circuit",
    label: "Federal civic listening circuit",
    intent:
      "Fixed listening cycles and response ledgers keep federal policy grounded.",
    artifact: "Local Needs Docket + Response Ledger",
    indicators: [
      "hearing cadence",
      "response lag",
      "percent declines with rationale"
    ],
    nodes: [
      "federal-civic-listening-circuit",
      "right-speech-infrastructure",
      "civic-memory-continuity",
      "sangha-architecture",
      "interbeing-systems"
    ]
  },
  {
    id: "metric-integrity-guardrail",
    label: "Metric integrity guardrail",
    intent: "Replace quota logic with harm-reduction indicators and reviews.",
    artifact: "Metric Policy Register",
    indicators: [
      "quota-free compliance",
      "review trigger adherence",
      "harm-reduction metric coverage"
    ],
    nodes: [
      "metric-integrity-guardrail",
      "koan-governance",
      "integrity-protocols",
      "capture-resistance"
    ]
  },
  {
    id: "harm-weighted-priority-standard",
    label: "Harm-weighted priority standard",
    intent: "Prioritize credible harm with due process and independent review.",
    artifact: "Harm-Weighted Priority Standard + Review Log",
    indicators: [
      "independent review rate",
      "appeal resolution time",
      "priority-tier audit pass rate"
    ],
    nodes: [
      "harm-weighted-priority-standard",
      "no-bypass-guardrail",
      "restorative-harm-repair",
      "integrity-protocols"
    ]
  },
  {
    id: "integration-ladder",
    label: "Integration ladder",
    intent: "Create a lawful on-ramp for long-term integrated residents.",
    artifact: "Integration Ladder Charter",
    indicators: ["case resolution time", "completion rate", "repeat-harm rate"],
    nodes: [
      "integration-ladder",
      "restorative-harm-repair",
      "interbeing-systems",
      "data-dignity"
    ]
  },
  {
    id: "local-stability-compact",
    label: "Local stability compact",
    intent: "Assess and mitigate disruption to local economies and staffing.",
    artifact: "Local Stability Compact + Stability Impact Statement",
    indicators: [
      "staffing shock index",
      "small business closure rate",
      "mitigation completion rate"
    ],
    nodes: [
      "local-stability-compact",
      "interbeing-systems",
      "scarcity-justice",
      "sangha-architecture"
    ]
  },
  {
    id: "access-to-counsel-pathway",
    label: "Access-to-counsel pathway",
    intent: "Ensure rights are usable with counsel and language access.",
    artifact: "Access-to-Counsel Pathway",
    indicators: [
      "time-to-counsel",
      "language access coverage",
      "outcomes by access level"
    ],
    nodes: [
      "access-to-counsel-pathway",
      "right-speech-infrastructure",
      "integrity-protocols",
      "data-dignity"
    ]
  },
  {
    id: "training-certification-gate",
    label: "Training and certification gate",
    intent: "Keep safety doctrine alive through training and renewal.",
    artifact: "Certification Register",
    indicators: [
      "renewal rate",
      "complaint rate by training status",
      "incident rate trend"
    ],
    nodes: [
      "training-certification-gate",
      "bodhisattva-craft",
      "integrity-protocols",
      "verification-checklist"
    ]
  }
];
const ADDENDA_PILLS = [
  { id: "anti-mutation", label: "Anti-mutation addendum" },
  { id: "stress-test", label: "Stress test register" },
  { id: "lawful-interface-protocol", label: "Lawful interface protocol" },
  { id: "public-safety-spine", label: "Public safety spine" },
  { id: "warp-ambition-spine", label: "Warp ambition spine" }
];

const CORE_SHAPE_PILLS = [
  {
    id: "core-floor",
    label: "1. The Floor",
    body:
      "Interbeing and Scarcity Justice create a dignity baseline that keeps desperation from becoming policy.",
    filename: "citizens-arc_core-floor"
  },
  {
    id: "core-ladder",
    label: "2. The Ladder",
    body:
      "Capability Gradient and Promise Trials reveal competence and integrity without manufacturing cruelty.",
    filename: "citizens-arc_core-ladder"
  },
  {
    id: "core-roof",
    label: "3. The Roof",
    body:
      "Koan Governance and Integrity Protocols keep tradeoffs visible and belief revision normal.",
    filename: "citizens-arc_core-roof"
  }
];

type BridgeRowProps = CitizensArcViewProps & { ids: string[] };

type ExportButtonProps = {
  onClick: () => void;
  label: string;
  disabled: boolean;
};

type ExportableCardProps = {
  exportId: string;
  filename: string;
  exportLabel: string;
  showExportControls: boolean;
  onExport: (exportId: string, filename: string) => void;
  registerRef: (id: string) => (node: HTMLDivElement | null) => void;
  disabled: boolean;
  className?: string;
  children: ReactNode;
};

function ExportButton({ onClick, label, disabled }: ExportButtonProps) {
  return (
    <button
      type="button"
      data-export-control="true"
      className="absolute right-3 top-3 rounded-full border border-white/10 bg-slate-900/80 p-2 text-slate-200 transition hover:border-sky-400/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
      onClick={onClick}
      aria-label={label}
      title="Download pill as PNG"
      disabled={disabled}
    >
      <Download className="h-4 w-4" />
    </button>
  );
}

function ExportableCard({
  exportId,
  filename,
  exportLabel,
  showExportControls,
  onExport,
  registerRef,
  disabled,
  className,
  children
}: ExportableCardProps) {
  return (
    <Card
      ref={registerRef(exportId)}
      data-export-id={exportId}
      className={cn("relative", className)}
    >
      {showExportControls && (
        <ExportButton
          onClick={() => onExport(exportId, filename)}
          label={`Download ${exportLabel}`}
          disabled={disabled}
        />
      )}
      {children}
    </Card>
  );
}

function BridgeRow({ ids, onSelectNode, resolve }: BridgeRowProps) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {ids.map((id) => {
        const label = resolve?.(id)?.title ?? BRIDGE_LABELS[id] ?? id;
        return (
          <button
            key={id}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 transition hover:border-sky-400/40"
            onClick={() => onSelectNode(id)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function CitizensArcView({
  onSelectNode,
  resolve,
  showExportControls: externalShowExportControls,
  onToggleExportControls
}: CitizensArcViewProps) {
  const [localShowExportControls, setLocalShowExportControls] = useState(false);
  const showExportControls =
    typeof externalShowExportControls === "boolean"
      ? externalShowExportControls
      : localShowExportControls;
  const setShowExportControls =
    onToggleExportControls ?? setLocalShowExportControls;
  const isExternallyControlled =
    typeof externalShowExportControls === "boolean" ||
    typeof onToggleExportControls === "function";
  const [isExporting, setIsExporting] = useState(false);
  const pillRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const setPillRef = useCallback(
    (id: string) => (node: HTMLDivElement | null) => {
      pillRefs.current[id] = node;
    },
    []
  );

  const scrollToPill = useCallback((pillId: string) => {
    const node = pillRefs.current[pillId];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const exportPill = useCallback(
    async (pillId: string, filename: string) => {
      if (isExporting) return;
      const node = pillRefs.current[pillId];
      if (!node) return;
      setIsExporting(true);
      node.setAttribute("data-exporting", "true");
      let exported = false;
      try {
        const dataUrl = await exportNodeToImage(node, "png");
        const anchor = document.createElement("a");
        anchor.href = dataUrl;
        anchor.download = `${filename.replace(/[^a-z0-9-_]+/gi, "_")}.png`;
        anchor.click();
        exported = true;
      } catch (err) {
        window.alert("Export failed. Please retry.");
      } finally {
        node.removeAttribute("data-exporting");
        setIsExporting(false);
      }
    },
    [isExporting]
  );

  return (
    <div
      className="space-y-6 text-sm text-slate-200"
      data-exporting={isExporting ? "true" : "false"}
    >
      {!isExternallyControlled && (
        <Card className="p-3 bg-slate-950/50 border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Pill exports
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Switch
                checked={showExportControls}
                onCheckedChange={(checked) => setShowExportControls(Boolean(checked))}
                aria-label="Toggle pill export downloads"
              />
            </div>
          </div>
        </Card>
      )}

      <Card className="p-3 bg-slate-950/50 border-white/10">
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Addenda
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Quick jumps to the hardening guardrails and stress tests.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ADDENDA_PILLS.map((pill) => (
            <button
              key={pill.id}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 transition hover:border-sky-400/40"
              onClick={() => scrollToPill(pill.id)}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </Card>

      <ExportableCard
        exportId="societal-view"
        filename="citizens-arc_societal-view"
        exportLabel="Societal view"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Societal view
        </div>
        <p className="mt-2 text-sm text-slate-300">
          If Mission Ethos is taken seriously, the big picture stops looking like
          a jungle gym. It becomes a living watershed where leadership is the job
          of keeping water clean, channels unblocked, and droughts honest.
        </p>
        <p className="mt-2 text-sm text-slate-300">
          Think: soft ground, hard tests, clear mirrors.
        </p>
      </ExportableCard>

      <ExportableCard
        exportId="civic-signal-loop"
        filename="citizens-arc_civic-signal-loop"
        exportLabel="Civic signal loop"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Civic signal loop
        </div>
        <p className="mt-2 text-sm text-slate-300">
          Surveys become civic mindfulness instruments when they map signals to
          lawful, nonviolent policy moves.
        </p>
        <BridgeRow
          ids={[
            "three-tenets-loop",
            "civic-signal-loop",
            "right-speech-infrastructure",
            "data-dignity",
            "integrity-protocols"
          ]}
          onSelectNode={onSelectNode}
          resolve={resolve}
        />
        <Separator className="my-4 bg-white/10" />
        <div className="grid gap-3 md:grid-cols-3">
          {CIVIC_SIGNAL_STEPS.map((step) => (
            <div
              key={step.title}
              className="rounded-lg border border-white/10 bg-slate-950/50 p-3"
            >
              <Badge variant="secondary">{step.title}</Badge>
              <p className="mt-2 text-sm text-slate-300">{step.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {SURVEY_SIGNAL_MAP.map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-white/10 bg-slate-950/50 p-3"
            >
              <div className="text-sm font-semibold text-white">{item.title}</div>
              <div className="mt-1 text-xs text-slate-400">Signal: {item.signal}</div>
              <BridgeRow
                ids={item.nodes}
                onSelectNode={onSelectNode}
                resolve={resolve}
              />
              <div className="mt-2 text-sm text-slate-300">
                Policy move: {item.action}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/50 p-3 text-xs text-slate-400">
          Lawful boundary: emphasize rights education, oversight, and nonviolent
          response. No evasion guidance or interference tactics.
        </div>
      </ExportableCard>

      <ExportableCard
        exportId="lawful-interface-protocol"
        filename="citizens-arc_lawful-interface-protocol"
        exportLabel="Lawful interface protocol"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Lawful interface protocol
        </div>
        <p className="mt-2 text-sm text-slate-300">
          A reusable checklist for lawful, nonviolent interfaces between civic
          institutions and enforcement agencies.
        </p>
        <BridgeRow
          ids={[
            "lawful-interface-protocol",
            "jurisdictional-floor",
            "two-key-approval",
            "right-speech-infrastructure",
            "data-dignity",
            "integrity-protocols",
            "restorative-harm-repair",
            "skillful-mediation",
            "capture-resistance",
            "civic-memory-continuity",
            "external-interface-integrity"
          ]}
          onSelectNode={onSelectNode}
          resolve={resolve}
        />
        <Separator className="my-4 bg-white/10" />
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
          {LAWFUL_INTERFACE_CHECKLIST.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/50 p-3 text-xs text-slate-400">
          Boundary: no interference tactics or evasion guidance. Only lawful
          rights education, oversight design, and nonviolent response.
        </div>
      </ExportableCard>

      <ExportableCard
        exportId="public-safety-spine"
        filename="citizens-arc_public-safety-spine"
        exportLabel="Public safety governance spine"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Public safety governance spine
        </div>
        <p className="mt-2 text-sm text-slate-300">
          A pack-ready set of bridges that keep enforcement lawful, transparent,
          and grounded in harm reduction.
        </p>
        <BridgeRow
          ids={[
            "lawful-interface-protocol",
            "metric-integrity-guardrail",
            "harm-weighted-priority-standard",
            "integration-ladder",
            "access-to-counsel-pathway"
          ]}
          onSelectNode={onSelectNode}
          resolve={resolve}
        />
        <Separator className="my-4 bg-white/10" />
        <div className="grid gap-3 md:grid-cols-2">
          {PUBLIC_SAFETY_SPINE_PILLS.map((pill) => (
            <div
              key={pill.id}
              ref={setPillRef(pill.id)}
              data-export-id={pill.id}
              className="relative rounded-lg border border-white/10 bg-slate-950/50 p-3"
            >
              {showExportControls && (
                <ExportButton
                  onClick={() => exportPill(pill.id, `citizens-arc_${pill.id}`)}
                  label={`Download ${pill.label}`}
                  disabled={isExporting}
                />
              )}
              <Badge variant="secondary">{pill.label}</Badge>
              <p className="mt-2 text-sm text-slate-300">{pill.intent}</p>
              <div className="mt-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                Minimal artifact
              </div>
              <div className="mt-1 text-sm text-slate-300">{pill.artifact}</div>
              <div className="mt-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                Public indicators
              </div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-300">
                {pill.indicators.map((indicator) => (
                  <li key={indicator}>{indicator}</li>
                ))}
              </ul>
              <BridgeRow ids={pill.nodes} onSelectNode={onSelectNode} resolve={resolve} />
            </div>
          ))}
        </div>
      </ExportableCard>

      <ExportableCard
        exportId="warp-ambition-spine"
        filename="citizens-arc_warp-ambition-spine"
        exportLabel="Warp ambition spine"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Warp ambition spine
        </div>
        <p className="mt-2 text-sm text-slate-300">
          A civic-to-cosmos bridge: stable floor, reality-paced discovery, and
          public utility guiding the warp bubble horizon.
        </p>
        <BridgeRow
          ids={[
            "scarcity-justice",
            "interbeing-systems",
            "three-tenets-loop",
            "beginners-mind",
            "integrity-protocols",
            "verification-checklist",
            "koan-governance",
            "impermanence-by-design",
            "worldview-integrity"
          ]}
          onSelectNode={onSelectNode}
          resolve={resolve}
        />
        <Separator className="my-4 bg-white/10" />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Public translation
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {WARP_AMBITION_PUBLIC.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Technical spine
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {WARP_AMBITION_TECHNICAL.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-400">
              Stage discipline
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {WARP_AMBITION_STAGE.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/50 p-3 text-xs text-slate-400">
          Boundary: claims must match evidence stage; ambition stays in service
          to public utility.
        </div>
      </ExportableCard>

      <ExportableCard
        exportId="core-shape"
        filename="citizens-arc_core-shape"
        exportLabel="The core shape"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          The core shape
        </div>
        <p className="mt-2 text-sm text-slate-300">
          A durable society with this ethos crystallizes into three interlocking
          layers.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {CORE_SHAPE_PILLS.map((pill) => (
            <div
              key={pill.id}
              ref={setPillRef(pill.id)}
              data-export-id={pill.id}
              className="relative rounded-lg border border-white/10 bg-slate-950/50 p-3"
            >
              {showExportControls && (
                <ExportButton
                  onClick={() => exportPill(pill.id, pill.filename)}
                  label={`Download ${pill.label}`}
                  disabled={isExporting}
                />
              )}
              <Badge variant="secondary">{pill.label}</Badge>
              <p className="mt-2 text-sm text-slate-300">{pill.body}</p>
            </div>
          ))}
        </div>
      </ExportableCard>

      <ExportableCard
        exportId="floor"
        filename="citizens-arc_floor"
        exportLabel="The Floor"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">1</Badge>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            The Floor - Interbeing Systems + Scarcity Justice
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-300">
          Goal: a non-negotiable dignity baseline that prevents desperation from
          becoming policy. Coercive scarcity produces noisy data about character
          and competence.
        </p>
        <BridgeRow
          ids={["interbeing-systems", "scarcity-justice"]}
          onSelectNode={onSelectNode}
          resolve={resolve}
        />
        <Separator className="my-4 bg-white/10" />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              What the floor guarantees
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {FLOOR_GUARANTEES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              What the floor refuses
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {FLOOR_REFUSES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-300">
          Scarcity must be a known constraint, not a weapon, and not a hidden tax
          on the unlucky.
        </p>
      </ExportableCard>

      <ExportableCard
        exportId="ladder"
        filename="citizens-arc_ladder"
        exportLabel="The Ladder"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">2</Badge>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            The Ladder - Capability Gradient + Struggle as Testament + Promise Trials
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-300">
          Goal: legitimate separation of roles, not human worth, by giving people
          real chances to demonstrate capability. The ladder is where the trial
          lives, but it is designed like a scientific instrument, not a furnace.
        </p>
        <BridgeRow
          ids={[
            "capability-ambition-gradient",
            "struggle-testament",
            "promise-trials"
          ]}
          onSelectNode={onSelectNode}
          resolve={resolve}
        />
        <Separator className="my-4 bg-white/10" />
        <div className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Key design move
          </div>
          <p className="mt-2 text-sm text-slate-300">
            Trials are voluntary, staged, and resourced enough to be fair. Hard,
            yes. Randomly destructive, no.
          </p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              A promise trial includes
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {PROMISE_TRIAL_COMPONENTS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Examples
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {PROMISE_TRIAL_EXAMPLES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/50 p-3">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Struggle as testament
          </div>
          <p className="mt-2 text-sm text-slate-300">
            The testament is not "I suffered." It is "I stayed coherent while
            conditions were adversarial."
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Coherence = competence + integrity + emotional regulation + service
            orientation.
          </p>
        </div>
      </ExportableCard>

      <ExportableCard
        exportId="roof"
        filename="citizens-arc_roof"
        exportLabel="The Roof"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">3</Badge>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            The Roof - Koan Governance + Values Over Images + Worldview Integrity
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-300">
          Goal: keep leadership from turning into theater and keep ideology from
          becoming a shrine that reality cannot contradict.
        </p>
        <BridgeRow
          ids={["koan-governance", "values-over-images", "worldview-integrity"]}
          onSelectNode={onSelectNode}
          resolve={resolve}
        />
        <Separator className="my-4 bg-white/10" />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Koan governance in practice
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              <li>
                Every major policy publishes its tradeoffs:
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-400">
                  {KOAN_TRADEOFFS.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </li>
              <li>Red teams are mandatory (friendly adversaries paid to break logic).</li>
              <li>Sunset clauses on big initiatives, renewed only if evidence supports them.</li>
              <li>
                Decision journals: leaders record why they chose what they chose so
                revision is normal, not humiliation.
              </li>
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Values over images
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {VALUES_OVER_IMAGES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-slate-300">
              A society that worships grit will eventually manufacture suffering to
              worship.
            </p>
          </div>
        </div>
      </ExportableCard>

      <ExportableCard
        exportId="sangha-architecture"
        filename="citizens-arc_sangha-architecture"
        exportLabel="Sangha Architecture"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">4</Badge>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Sangha Architecture - Interbeing made physical
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-300">
          Goal: prevent atomized citizens and celebrity leaders. Make competence
          local and legible.
        </p>
        <BridgeRow
          ids={["sangha-architecture"]}
          onSelectNode={onSelectNode}
          resolve={resolve}
        />
        <Separator className="my-4 bg-white/10" />
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Building blocks
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
          {SANGHA_BLOCKS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-300">
          People rotate through roles, seasons, and capacities so strength and
          vulnerability never harden into classes.
        </p>
      </ExportableCard>

      <ExportableCard
        exportId="no-bypass"
        filename="citizens-arc_no-bypass"
        exportLabel="No bypass guardrail"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">5</Badge>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            No Bypass Guardrail + Integrity Protocols
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-300">
          Goal: make it hard to purchase power, fake competence, or farm attention
          into authority.
        </p>
        <BridgeRow
          ids={["no-bypass-guardrail", "integrity-protocols"]}
          onSelectNode={onSelectNode}
          resolve={resolve}
        />
        <Separator className="my-4 bg-white/10" />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              No bypass mechanisms
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {NO_BYPASS_MECHANISMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Integrity protocols
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {INTEGRITY_PROTOCOLS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-300">
          The point is not punishment. The point is that trust is a public utility.
        </p>
      </ExportableCard>

      <ExportableCard
        exportId="inner-spark"
        filename="citizens-arc_inner-spark"
        exportLabel="Inner Spark + Lifetime Trust Ledger"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">6</Badge>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Inner Spark + Lifetime Trust Ledger
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-300">
          Goal: align motivation with service and coherence, not just achievement.
        </p>
        <BridgeRow
          ids={["inner-spark", "lifetime-trust-ledger"]}
          onSelectNode={onSelectNode}
          resolve={resolve}
        />
        <Separator className="my-4 bg-white/10" />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Inner spark asks
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {INNER_SPARK_QUESTIONS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Trust ledger, carefully done
            </div>
            <p className="mt-2 text-sm text-slate-300">
              This is not a social credit score. It is an evidence-based record of
              reliability that keeps context and consent.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {TRUST_LEDGER_GUARDRAILS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-300">
          A trust ledger should track reliability patterns, not morality, ideology,
          or popularity.
        </p>
      </ExportableCard>

      <ExportableCard
        exportId="solitude-to-signal"
        filename="citizens-arc_solitude-to-signal"
        exportLabel="Solitude to Signal + Habit Pressure Break"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">7</Badge>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Solitude to Signal + Habit Pressure Break
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-300">
          Goal: the trial that matters most is often stepping out of comfort loops
          on purpose, then returning with clearer signal.
        </p>
        <BridgeRow
          ids={["solitude-to-signal", "habit-pressure-break"]}
          onSelectNode={onSelectNode}
          resolve={resolve}
        />
        <Separator className="my-4 bg-white/10" />
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
          {SOLITUDE_PRACTICES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ExportableCard>

      <ExportableCard
        exportId="citizen-arc"
        filename="citizens-arc_lifecycle"
        exportLabel="Citizen's arc"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Citizen's arc
        </div>
        <p className="mt-2 text-sm text-slate-300">
          The ladder maps to a lifespan: belonging, skill, trials, stewardship,
          elder calibration.
        </p>
        <ol className="mt-4 space-y-4 border-l border-white/10 pl-5">
          <li className="space-y-2">
            <div className="text-sm font-semibold text-white">
              Stage 1: Belonging (Floor + Sangha)
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
              <li>You start inside community structure and baseline security.</li>
              <li>You learn cooperation and responsibility early, without survival terror.</li>
            </ul>
          </li>
          <li className="space-y-2">
            <div className="text-sm font-semibold text-white">
              Stage 2: Skill and Service (Gradient)
            </div>
            <p className="text-sm text-slate-300">You choose tracks:</p>
            <div className="flex flex-wrap gap-2">
              {ARC_STAGE_TRACKS.map((track) => (
                <Badge key={track} variant="secondary">
                  {track}
                </Badge>
              ))}
            </div>
          </li>
          <li className="space-y-2">
            <div className="text-sm font-semibold text-white">
              Stage 3: Trials (Promise Trials)
            </div>
            <p className="text-sm text-slate-300">
              You opt into increasingly real missions with increasing complexity:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
              {ARC_STAGE_TRIALS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </li>
          <li className="space-y-2">
            <div className="text-sm font-semibold text-white">
              Stage 4: Stewardship (Roof)
            </div>
            <p className="text-sm text-slate-300">You enter stewardship with:</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
              {ARC_STAGE_STEWARDSHIP.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </li>
          <li className="space-y-2">
            <div className="text-sm font-semibold text-white">
              Stage 5: Elder function (Trust Ledger over time)
            </div>
            <p className="text-sm text-slate-300">
              Later-life leadership is less command, more calibration:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
              {ARC_STAGE_ELDER.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </li>
        </ol>
      </ExportableCard>

      <ExportableCard
        exportId="reconciliation"
        filename="citizens-arc_reconciliation"
        exportLabel="Philosophical reconciliation"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          The big philosophical reconciliation
        </div>
        <p className="mt-2 text-sm text-slate-300">
          Protecting people from coercive scarcity creates the conditions for fair
          trials. Fair trials create leaders who can protect without condescension.
        </p>
        <div className="mt-3 text-sm text-slate-300">Strength becomes:</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
          {STRENGTH_TRAITS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-300">
          Not a boot on a neck. Not a trophy made of suffering.
        </p>
      </ExportableCard>

      <ExportableCard
        exportId="failure-modes"
        filename="citizens-arc_failure-modes"
        exportLabel="Failure modes and counters"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Failure modes and counters
        </div>
        <ul className="mt-3 space-y-3 text-sm text-slate-300">
          {FAILURE_MODES.map((mode) => (
            <li key={mode.title}>
              <div className="font-semibold text-white">{mode.title}</div>
              <div className="text-slate-300">Counter: {mode.counter}</div>
            </li>
          ))}
        </ul>
      </ExportableCard>

      <ExportableCard
        exportId="anti-mutation"
        filename="citizens-arc_anti-mutation"
        exportLabel="Anti-mutation addendum"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Anti-mutation addendum
        </div>
        <p className="mt-2 text-sm text-slate-300">
          These mechanisms stop trials and trust from hardening into a new caste.
        </p>
        <BridgeRow
          ids={["citizens-arc-anti-mutation"]}
          onSelectNode={onSelectNode}
          resolve={resolve}
        />
        <Separator className="my-4 bg-white/10" />
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
          {ANTI_MUTATION_MECHANISMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </ExportableCard>

      <ExportableCard
        exportId="stress-test"
        filename="citizens-arc_stress-test"
        exportLabel="Stress test register"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          Stress test register
        </div>
        <p className="mt-2 text-sm text-slate-300">
          Attack packets keep the citizen's arc honest when the system scales.
        </p>
        <BridgeRow
          ids={["citizens-arc-stress-test"]}
          onSelectNode={onSelectNode}
          resolve={resolve}
        />
        <Separator className="my-4 bg-white/10" />
        <ul className="mt-3 space-y-3 text-sm text-slate-300">
          {STRESS_TEST_PACKETS.map((packet) => (
            <li key={packet.title}>
              <div className="font-semibold text-white">{packet.title}</div>
              <div className="text-slate-300">Counter: {packet.counter}</div>
            </li>
          ))}
        </ul>
      </ExportableCard>

      <ExportableCard
        exportId="big-picture"
        filename="citizens-arc_big-picture"
        exportLabel="One-sentence big picture"
        showExportControls={showExportControls}
        onExport={exportPill}
        registerRef={setPillRef}
        disabled={isExporting}
        className="p-4 bg-slate-950/50 border-white/10"
      >
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
          One-sentence big picture
        </div>
        <p className="mt-2 text-sm text-slate-200">
          A society with your Mission Ethos is a dignity-floor civilization that
          runs voluntary, auditable trials to select stewards, and uses koan-style
          governance to keep power honest and ideology revisable.
        </p>
      </ExportableCard>
    </div>
  );
}

export default CitizensArcView;
