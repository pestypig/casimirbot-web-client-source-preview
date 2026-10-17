import {
  buildCivilizationBoundsRoadmapV1,
  buildCivilizationCollaborationBoundV1,
  type CivilizationBoundsBadgeV1,
  type CivilizationBoundsBridgeContextV1,
  type CivilizationBoundsEdgeV1,
  type CivilizationActionChannelV1,
  type CivilizationComparisonCaseV1,
  type CivilizationDependencyChainV1,
  type CivilizationHypothesisClaimV1,
  type CivilizationParameterScopeV1,
  type CivilizationBoundsRoadmapV1,
  type CivilizationProceduralScaffoldV1,
  type CivilizationClaimTierV1,
  type CivilizationLayerModeV1,
  type CivilizationPhaseV1,
  type CivilizationSystemV1,
} from "@shared/civilization-bounds-roadmap";
import {
  COUNTRY_PROGRAM_ROLES,
  PHASE_DEFS,
  type CountryProgramRole,
  type PhaseId,
} from "./needleWorldRoles";

export const NEEDLE_CIVILIZATION_BOUNDS_SCENARIO_ID =
  "needle_hull_ideal_global_construction" as const;

const CLAIM_TIER: CivilizationClaimTierV1 = "declared_scenario";
const LAYER_MODE: CivilizationLayerModeV1 = "ideal_bounds";
const EVIDENCE_PREFIX = "declared:needle-world-roles";
const MAX_COLLABORATION_BOUNDS = 4;

const PHASE_ORDER: PhaseId[] = ["P0", "P1", "P2", "P3", "P4"];

const CAPABILITY_KIND_HINTS: Array<{
  pattern: RegExp;
  theoryBadgeIds: string[];
  moralNodeIds: string[];
  relation: "supports" | "constrains" | "requires" | "bounds" | "analogy_only";
  proceduralEffect: string;
}> = [
  {
    pattern: /(?:power|hvdc|cryoplant|rf|q_devices|grid|energy)/i,
    theoryBadgeIds: [
      "physics.symmetry.energy_momentum_conservation",
      "physics.gr.stress_energy_conservation",
    ],
    moralNodeIds: [
      "impermanence-entropy-and-revision",
      "skillful-action-under-uncertainty",
    ],
    relation: "bounds",
    proceduralEffect: "Energy and thermal capacity bound claim strength and require revision triggers.",
  },
  {
    pattern: /(?:material|rare_earth|tungsten|fab|metrology|tile|manufactur)/i,
    theoryBadgeIds: [
      "biophysics.membrane.open_system_entropy_flow",
      "physics.symmetry.energy_momentum_conservation",
    ],
    moralNodeIds: [
      "direct-observation-before-claim",
      "provenance-protocol",
    ],
    relation: "requires",
    proceduralEffect: "Material inventory and fabrication claims require observed source and provenance checks.",
  },
  {
    pattern: /(?:governance|ethics|education|citizen|sensor|observatory)/i,
    theoryBadgeIds: ["observation", "provenance", "falsifiability"],
    moralNodeIds: [
      "fairness-due-process-and-justification",
      "feedback-loop-hygiene",
      "non-harm-and-compassionate-constraint",
    ],
    relation: "constrains",
    proceduralEffect: "Review coverage and observation gaps constrain procedural posture.",
  },
];

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function phaseWeight(role: CountryProgramRole, phaseId: PhaseId): number {
  return role.phases.find((phase) => phase.phaseId === phaseId)?.costShareEstimate ?? 0;
}

function systemIdForRole(role: CountryProgramRole, index: number, seen: Set<string>): string {
  const base = `needle:${slug(role.iso2 || role.name) || `system-${index + 1}`}`;
  if (!seen.has(base)) {
    seen.add(base);
    return base;
  }
  const next = `${base}:${index + 1}`;
  seen.add(next);
  return next;
}

function evidenceRefForRole(role: CountryProgramRole): string {
  return `${EVIDENCE_PREFIX}:${role.iso2.toLowerCase()}`;
}

function capabilityEvidenceRef(systemId: string, capability: string): string {
  return `${EVIDENCE_PREFIX}:${systemId}:capability:${slug(capability)}`;
}

function phaseEvidenceRef(phaseId: PhaseId): string {
  return `${EVIDENCE_PREFIX}:phase:${phaseId}`;
}

function buildPhases(): CivilizationPhaseV1[] {
  return PHASE_ORDER.map((phaseId) => {
    const def = PHASE_DEFS[phaseId];
    return {
      phaseId,
      label: `${phaseId} (${def.startYear}-${def.endYear}y)`,
      start: def.startYear,
      end: def.endYear,
      summary: def.summary,
      claimTier: CLAIM_TIER,
      evidenceRefs: [phaseEvidenceRef(phaseId)],
    };
  });
}

function buildSystems(roles: CountryProgramRole[]): Array<{
  role: CountryProgramRole;
  system: CivilizationSystemV1;
}> {
  const seen = new Set<string>();
  return roles.map((role, index) => {
    const systemId = systemIdForRole(role, index, seen);
    const evidenceRefs = [evidenceRefForRole(role)];
    const capabilities = unique(role.capabilities);
    const system: CivilizationSystemV1 = {
      systemId,
      label: role.name,
      scopeBoundary: "research_program",
      timeHorizon: {
        mode: "relative_years",
        start: Math.min(...role.phases.map((phase) => phase.startYear)),
        end: Math.max(...role.phases.map((phase) => phase.endYear)),
      },
      populationOrAgents: {
        description: "Declared scenario actor converted from the Needle role dataset.",
        agentClasses: ["bounded_system_actor"],
      },
      energyBudget: {
        label: "Declared energy capacity envelope",
        description: capabilities.some((capability) => /power|hvdc|cryoplant/i.test(capability))
          ? "Energy infrastructure capability is declared in the scenario data."
          : "No direct energy infrastructure capability is declared for this system actor.",
        confidence: 0.35,
        evidenceRefs,
      },
      materialInventory: capabilities
        .filter((capability) => /material|rare_earth|tungsten|fab|tile/i.test(capability))
        .slice(0, 6)
        .map((capability) => ({
          label: capability.replaceAll("_", " "),
          confidence: 0.35,
          evidenceRefs: [capabilityEvidenceRef(systemId, capability)],
        })),
      observabilityCoverage: {
        coverageLabel: capabilities.some((capability) => /sensor|observatory|metrology/i.test(capability))
          ? "declared observability channel"
          : "observability gap",
        coverageScore: capabilities.some((capability) => /sensor|observatory|metrology/i.test(capability)) ? 0.55 : 0.25,
        blindSpots: ["source_backed_capacity_measurements", "live_operational_receipts"],
        evidenceRefs,
      },
      governanceProcess: capabilities.some((capability) => /ethics|governance|education|citizen/i.test(capability))
        ? {
            processId: `${systemId}:declared-governance`,
            label: "Declared review and public-interface capacity",
            decisionRule: "Scenario-level governance capacity only",
            reviewCadence: "Undetermined until source-backed receipts exist",
            evidenceRefs,
          }
        : undefined,
      consentAndReviewInterfaces: [
        {
          interfaceId: `${systemId}:technical-review`,
          label: "Technical review interface",
          interfaceKind: "technical_review",
          coverageScore: capabilities.some((capability) => /metrology|hpc|gr_theory|sensor/i.test(capability)) ? 0.55 : 0.3,
          missingChecks: ["independent_review_receipts", "capacity_audit_refs"],
          evidenceRefs,
        },
        {
          interfaceId: `${systemId}:ethics-review`,
          label: "Ethics and affected-party review interface",
          interfaceKind: capabilities.some((capability) => /ethics|governance|citizen/i.test(capability))
            ? "ethics_review"
            : "unknown",
          coverageScore: capabilities.some((capability) => /ethics|governance|citizen/i.test(capability)) ? 0.5 : 0.2,
          missingChecks: ["affected_party_review_scope", "contestability_process"],
          evidenceRefs,
        },
      ],
      capabilities,
      dependencies: unique(
        capabilities
          .filter((capability) => /launch|grid|hvdc|rare_earth|tungsten|cryoplant|fab/i.test(capability))
          .map((capability) => `dependency:${capability}`),
      ),
      risks: [
        "declared_scenario_not_observed",
        "capacity_measurements_missing",
        "procedural_review_receipts_missing",
      ],
      evidenceRefs,
      claimTier: CLAIM_TIER,
    };
    return { role, system };
  });
}

function phaseBadgeId(systemId: string, phaseId: PhaseId): string {
  return `${systemId}:phase:${phaseId}:system`;
}

function capabilityBadgeId(systemId: string, phaseId: PhaseId, capability: string): string {
  return `${systemId}:phase:${phaseId}:capability:${slug(capability)}`;
}

function bindingForCapability(capability: string) {
  return CAPABILITY_KIND_HINTS.find((hint) => hint.pattern.test(capability));
}

function buildBadgesAndBindings(
  entries: Array<{ role: CountryProgramRole; system: CivilizationSystemV1 }>,
): {
  badges: CivilizationBoundsBadgeV1[];
  theoryBindings: CivilizationBoundsRoadmapV1["theoryBindings"];
  moralBindings: CivilizationBoundsRoadmapV1["moralBindings"];
} {
  const badges: CivilizationBoundsBadgeV1[] = [];
  const theoryBindings: CivilizationBoundsRoadmapV1["theoryBindings"] = [];
  const moralBindings: CivilizationBoundsRoadmapV1["moralBindings"] = [];

  for (const { role, system } of entries) {
    for (const phase of role.phases) {
      const systemBadge: CivilizationBoundsBadgeV1 = {
        badgeId: phaseBadgeId(system.systemId, phase.phaseId),
        label: system.label,
        kind: "system_actor",
        systemId: system.systemId,
        phaseId: phase.phaseId,
        coordinates: { lat: role.lat, lon: role.lon },
        layerMode: LAYER_MODE,
        weight: phase.costShareEstimate ?? 0,
        confidence: 0.4,
        missingEvidence: ["source_backed_capacity_measurements"],
        evidenceRefs: [evidenceRefForRole(role), phaseEvidenceRef(phase.phaseId)],
        claimTier: CLAIM_TIER,
      };
      badges.push(systemBadge);

      role.capabilities.slice(0, 8).forEach((capability, index) => {
        const binding = bindingForCapability(capability);
        const badgeId = capabilityBadgeId(system.systemId, phase.phaseId, capability);
        const angle = (Math.PI * 2 * index) / Math.max(role.capabilities.slice(0, 8).length, 1);
        const capabilityBadge: CivilizationBoundsBadgeV1 = {
          badgeId,
          label: capability.replaceAll("_", " "),
          kind: binding ? "capability" : "resource",
          systemId: system.systemId,
          phaseId: phase.phaseId,
          coordinates: {
            lat: role.lat + Math.sin(angle) * 1.5,
            lon: role.lon + Math.cos(angle) * 2.2,
          },
          layerMode: LAYER_MODE,
          weight: Math.max(0.1, (phase.costShareEstimate ?? 0.12) * 0.65),
          confidence: 0.35,
          ...(binding ? { theoryBadgeIds: binding.theoryBadgeIds, moralNodeIds: binding.moralNodeIds } : {}),
          missingEvidence: ["observed_throughput", "source_backed_inventory"],
          evidenceRefs: [capabilityEvidenceRef(system.systemId, capability)],
          claimTier: CLAIM_TIER,
        };
        badges.push(capabilityBadge);
        if (binding) {
          theoryBindings.push({
            badgeId,
            theoryBadgeIds: binding.theoryBadgeIds,
            relation: binding.relation,
            evidenceRefs: capabilityBadge.evidenceRefs,
          });
          moralBindings.push({
            badgeId,
            moralNodeIds: binding.moralNodeIds,
            proceduralEffect: binding.proceduralEffect,
            refusesAuthority: [
              "moral_finality",
              "policy_finality",
              "prediction_finality",
              "execution_authority",
            ],
            evidenceRefs: capabilityBadge.evidenceRefs,
          });
        }
      });
    }
  }

  return { badges, theoryBindings, moralBindings };
}

function buildEdgesAndCollaborations(
  entries: Array<{ role: CountryProgramRole; system: CivilizationSystemV1 }>,
): {
  edges: CivilizationBoundsEdgeV1[];
  collaborationBounds: CivilizationBoundsRoadmapV1["collaborationBounds"];
} {
  const edges: CivilizationBoundsEdgeV1[] = [];
  const collaborationBounds: CivilizationBoundsRoadmapV1["collaborationBounds"] = [];

  for (const phaseId of PHASE_ORDER) {
    const active = entries
      .map((entry) => ({
        ...entry,
        weight: phaseWeight(entry.role, phaseId),
      }))
      .filter((entry) => entry.weight > 0)
      .sort((a, b) => b.weight - a.weight);
    const anchor = active[0];
    if (!anchor) continue;
    for (const entry of active.slice(1, MAX_COLLABORATION_BOUNDS + 1)) {
      const sharedCapabilities = entry.system.capabilities.filter((capability) =>
        anchor.system.capabilities.includes(capability),
      );
      const hasEnergyInterface = [...entry.system.capabilities, ...anchor.system.capabilities].some((capability) =>
        /power|hvdc|cryoplant|grid/i.test(capability),
      );
      const hasGovernanceInterface = [...entry.system.capabilities, ...anchor.system.capabilities].some((capability) =>
        /ethics|governance|citizen|education/i.test(capability),
      );
      const bound = buildCivilizationCollaborationBoundV1({
        boundId: `needle:${phaseId}:bound:${slug(entry.system.systemId)}:to:${slug(anchor.system.systemId)}`,
        fromSystemId: entry.system.systemId,
        toSystemId: anchor.system.systemId,
        physicalCapacityMargin: clamp01((entry.weight + anchor.weight) / 1.2),
        materialAvailability: clamp01(0.25 + sharedCapabilities.length / 12),
        energyMargin: hasEnergyInterface ? 0.55 : 0.3,
        interfaceCompatibility: sharedCapabilities.length > 0 ? 0.65 : 0.35,
        evidenceQuality: 0.35,
        proceduralAdmissibility: hasGovernanceInterface ? 0.55 : 0.3,
        reversibilityMargin: hasGovernanceInterface ? 0.5 : 0.35,
        missingEvidence: [
          "observed_capacity_measurements",
          "source_backed_material_inventory",
          "review_interface_receipts",
        ],
        evidenceRefs: [
          evidenceRefForRole(entry.role),
          evidenceRefForRole(anchor.role),
          phaseEvidenceRef(phaseId),
        ],
        claimTier: CLAIM_TIER,
      });
      collaborationBounds.push(bound);
      edges.push({
        edgeId: `needle:${phaseId}:edge:${slug(entry.system.systemId)}:to:${slug(anchor.system.systemId)}`,
        fromBadgeId: phaseBadgeId(entry.system.systemId, phaseId),
        toBadgeId: phaseBadgeId(anchor.system.systemId, phaseId),
        relation: "collaborates_with",
        weight: bound.collaborationValue,
        confidence: 0.35,
        evidenceRefs: bound.evidenceRefs,
        claimTier: CLAIM_TIER,
      });
    }
  }

  return { edges, collaborationBounds };
}

function buildNeedleParameterScopes(): CivilizationParameterScopeV1[] {
  const evidenceRefs = [`${EVIDENCE_PREFIX}:procedural-scaffold`];
  return [
    {
      scopeId: "parameter:material_base",
      kind: "material_base",
      label: "Material base",
      description: "Declared Needle role capacities mapped to resource, production, logistics, fiscal, and infrastructure constraints.",
      indicatorRefs: ["declared:needle-world-roles", "world_bank.world_development_indicators"],
      missingEvidence: ["observed_material_inventory", "energy_budget_receipts", "source_backed_capacity_measurements"],
      evidenceRefs,
      claimTier: CLAIM_TIER,
    },
    {
      scopeId: "parameter:governance_institutional_capacity",
      kind: "governance_institutional_capacity",
      label: "Governance and institutional capacity",
      description: "Declared review, education, ethics, and public-interface capacities that bound claim promotion.",
      indicatorRefs: ["world_bank.worldwide_governance_indicators", "v_dem.democracy_indices"],
      missingEvidence: ["review_interface_receipts", "affected_party_review_scope", "contestability_process"],
      evidenceRefs,
      claimTier: CLAIM_TIER,
    },
    {
      scopeId: "parameter:security_conflict_exposure",
      kind: "security_conflict_exposure",
      label: "Security and conflict exposure",
      description: "Security pressure remains a missing observation layer for any world-affairs comparison.",
      indicatorRefs: ["acled.event_data", "ucdp.armed_conflict_data", "global_peace_index"],
      missingEvidence: ["security_risk_assessment", "conflict_event_receipts"],
      evidenceRefs,
      claimTier: CLAIM_TIER,
    },
    {
      scopeId: "parameter:social_cohesion_demographic_pressure",
      kind: "social_cohesion_demographic_pressure",
      label: "Social cohesion and demographic pressure",
      description: "Population, trust, migration, and participation pressures are not observed by the declared role dataset.",
      indicatorRefs: ["fragile_states_index", "world_bank.population_indicators"],
      missingEvidence: ["demographic_pressure_refs", "public_trust_refs"],
      evidenceRefs,
      claimTier: CLAIM_TIER,
    },
    {
      scopeId: "parameter:information_ideology_legitimacy",
      kind: "information_ideology_legitimacy",
      label: "Information, ideology, and legitimacy",
      description: "Narrative and legitimacy channels can be compared only after source-backed observation enters the roadmap.",
      indicatorRefs: ["v_dem.civil_liberties_media", "public_opinion_surveys"],
      missingEvidence: ["media_pluralism_refs", "legitimacy_claim_refs"],
      evidenceRefs,
      claimTier: CLAIM_TIER,
    },
    {
      scopeId: "parameter:environment_entropy_pressure",
      kind: "environment_entropy_pressure",
      label: "Environment and entropy pressure",
      description: "Thermal, ecological, and sink-capacity pressure remains a constraint layer for any buildout reflection.",
      indicatorRefs: ["world_bank.climate_environment_indicators", "our_world_in_data.environment"],
      missingEvidence: ["ecological_sink_capacity_measurements", "thermal_ceiling_measurements"],
      evidenceRefs,
      claimTier: CLAIM_TIER,
    },
  ];
}

function buildNeedleActionChannels(): CivilizationActionChannelV1[] {
  const evidenceRefs = [`${EVIDENCE_PREFIX}:procedural-scaffold`];
  const blockedUses = [
    "certify prediction",
    "authorize action",
    "treat procedural analogy as moral proof",
  ];
  return [
    ["economic", "Economic integration channel", "economic city purchase and trade routes", "Trade, credit, supply-chain, investment, and market-access dependencies."],
    ["coercive", "Coercive capacity channel", "military city takeover", "Force posture, deterrence, repression, occupation, or border pressure."],
    ["persuasive", "Persuasive legitimacy channel", "religious city conversion", "Identity, ideology, education, media, and legitimacy claims."],
    ["diplomatic", "Diplomatic transfer channel", "gifts and relation modifiers", "Aid, sanctions relief, treaty bargaining, and confidence-building measures."],
    ["governance_review", "Governance review channel", "city building mix and morale stability", "Due process, public review, ethics review, and affected-party interfaces."],
    ["infrastructure_buildout", "Infrastructure buildout channel", "factories, houses, turrets, and vehicles", "Production capacity, housing, energy, logistics, defense hardening, and service reach."],
    ["observation", "Observation and evidence channel", "visible city states and map control", "Source freshness, event logs, measurement quality, and blind spots."],
  ].map(([kind, label, sporeAnalogy, realWorldInterpretation]) => ({
    channelId: `action-channel:${kind}`,
    kind: kind as CivilizationActionChannelV1["kind"],
    label,
    sporeAnalogy,
    realWorldInterpretation,
    admissibleUses: ["compare scenario structure", "identify dependency evidence", "flag missing observations"],
    blockedUses,
    evidenceRefs,
    claimTier: CLAIM_TIER,
  }));
}

function buildNeedleProceduralScaffold(): CivilizationProceduralScaffoldV1 {
  return {
    scaffoldId: "spore_civilization_stage_procedural_scaffold",
    source: "spore_civilization_stage_research",
    designMetaphor: "Spore Civilization Stage supplies procedural grammar for nodes, resource anchors, action channels, dependency edges, and maturity gates.",
    surfaces: [
      { sporeSurface: "city", proceduralMeaning: "concentrated capability node", roadmapField: "systems,badges" },
      { sporeSurface: "spice geyser", proceduralMeaning: "resource anchor", roadmapField: "parameterScopes,badges" },
      { sporeSurface: "vehicle", proceduralMeaning: "mobility or projection capacity", roadmapField: "actionChannels,capabilities" },
      { sporeSurface: "trade route", proceduralMeaning: "dependency and integration edge", roadmapField: "edges,dependencyChains" },
      { sporeSurface: "stage completion", proceduralMeaning: "maturity transition", roadmapField: "phases,comparisonCases" },
    ],
    blockedInterpretations: [
      "Spore mechanics are not a history model.",
      "Spore pathways do not certify real-world predictions.",
      "Procedural comparison does not authorize policy, coercion, or moral finality.",
    ],
    researchRefs: ["docs/audits/research/civilization-bounds-spore-procedural-systems-2026-06-17.md"],
    evidenceRefs: [`${EVIDENCE_PREFIX}:procedural-scaffold`],
  };
}

export function buildNeedleCivilizationBoundsScenario(options?: {
  generatedAt?: string;
}): CivilizationBoundsRoadmapV1 {
  const phases = buildPhases();
  const systemEntries = buildSystems(COUNTRY_PROGRAM_ROLES);
  const { badges, theoryBindings, moralBindings } = buildBadgesAndBindings(systemEntries);
  const { edges, collaborationBounds } = buildEdgesAndCollaborations(systemEntries);
  const systemBadgeIds = badges
    .filter((badge) => badge.kind === "system_actor")
    .slice(0, 10)
    .map((badge) => badge.badgeId);
  const topEdgeIds = edges.slice(0, 10).map((edge) => edge.edgeId);
  const dependencyChains: CivilizationDependencyChainV1[] = [
    {
      chainId: "chain:needle:declared-capacity-to-review",
      label: "Declared capacity to review dependency chain",
      nodeBadgeIds: systemBadgeIds,
      edgeIds: topEdgeIds,
      bottlenecks: ["source_backed_capacity_measurements", "review_interface_receipts"],
      missingEvidence: ["source_backed_capacity_measurements", "review_interface_receipts"],
      evidenceRefs: [`${EVIDENCE_PREFIX}:procedural-scaffold`],
      claimTier: CLAIM_TIER,
    },
  ];
  const comparisonCases: CivilizationComparisonCaseV1[] = [
    {
      caseId: "comparison:needle:stable-peer",
      label: "Stable peer with comparable industrial and governance capacity",
      sourceClass: "historical_case",
      similarityAxes: ["material_base", "governance_institutional_capacity"],
      blockers: ["named_peer_case_refs", "source_scope_and_timestamp"],
      evidenceRefs: [`${EVIDENCE_PREFIX}:procedural-scaffold`],
      claimTier: CLAIM_TIER,
    },
    {
      caseId: "comparison:needle:null-case",
      label: "Null case where declared role similarity does not imply future outcome",
      sourceClass: "declared_scenario",
      similarityAxes: ["blocked_prediction_finality", "missing_observation_review"],
      blockers: ["source_backed_capacity_measurements", "causal_direction_not_certified"],
      evidenceRefs: [`${EVIDENCE_PREFIX}:procedural-scaffold`],
      claimTier: CLAIM_TIER,
    },
  ];
  const hypothesisClaims: CivilizationHypothesisClaimV1[] = [
    {
      claimId: "hypothesis:needle:dependency-bottleneck",
      claim: "Declared Needle collaboration remains bounded by material, energy, and review evidence gaps before claim promotion.",
      strength: "weak",
      blockers: ["source_backed_capacity_measurements", "observed_material_inventory", "review_interface_receipts"],
      evidenceRefs: [`${EVIDENCE_PREFIX}:procedural-scaffold`],
      claimTier: CLAIM_TIER,
    },
  ];
  return buildCivilizationBoundsRoadmapV1({
    generatedAt: options?.generatedAt,
    roadmapId: "civilization-bounds:needle-hull-ideal-global-construction",
    title: "Civilization Bounds Roadmap",
    scenarioId: NEEDLE_CIVILIZATION_BOUNDS_SCENARIO_ID,
    activeLayerModes: [LAYER_MODE],
    phases,
    systems: systemEntries.map((entry) => entry.system),
    badges,
    edges,
    collaborationBounds,
    falsificationHooks: [
      {
        hookId: "needle:declared-scenario-capacity-falsifier",
        claimId: NEEDLE_CIVILIZATION_BOUNDS_SCENARIO_ID,
        metric: "source-backed capacity receipts",
        threshold: "Each promoted capacity badge requires independent source-backed measurements before promotion.",
        horizon: "before any layer-mode promotion out of ideal_bounds",
        revisionTrigger: "Observed capacity, material, energy, or review receipts contradict declared scenario weights.",
        evidenceRefs: [`${EVIDENCE_PREFIX}:falsification-hooks`],
      },
    ],
    parameterScopes: buildNeedleParameterScopes(),
    actionChannels: buildNeedleActionChannels(),
    dependencyChains,
    comparisonCases,
    hypothesisClaims,
    proceduralScaffold: buildNeedleProceduralScaffold(),
    theoryBindings,
    moralBindings,
    missingEvidence: [
      "source_backed_capacity_measurements",
      "observed_material_inventory",
      "energy_budget_receipts",
      "review_interface_receipts",
      "live_operational_observations",
    ],
  });
}

export function exportCivilizationBoundsBridgeContext(
  roadmap: CivilizationBoundsRoadmapV1,
  selectedBadgeIds?: string[],
): CivilizationBoundsBridgeContextV1 {
  const selected = selectedBadgeIds?.length
    ? roadmap.badges.filter((badge) => selectedBadgeIds.includes(badge.badgeId))
    : roadmap.badges;
  const selectedIds = new Set(selected.map((badge) => badge.badgeId));
  return {
    theoryBadgeIds: unique([
      ...selected.flatMap((badge) => badge.theoryBadgeIds ?? []),
      ...roadmap.theoryBindings
        .filter((binding) => selectedIds.has(binding.badgeId))
        .flatMap((binding) => binding.theoryBadgeIds),
    ]),
    moralNodeIds: unique([
      ...selected.flatMap((badge) => badge.moralNodeIds ?? []),
      ...roadmap.moralBindings
        .filter((binding) => selectedIds.has(binding.badgeId))
        .flatMap((binding) => binding.moralNodeIds),
    ]),
    systemIds: unique(selected.flatMap((badge) => (badge.systemId ? [badge.systemId] : []))),
    constraints: unique([
      ...selected
        .filter((badge) => badge.kind === "constraint" || badge.kind === "capability" || badge.kind === "resource")
        .map((badge) => badge.label),
      ...roadmap.collaborationBounds.map((bound) => `limiting:${bound.limitingFactor}`),
    ]),
    missingEvidence: unique([
      ...roadmap.missingEvidence,
      ...selected.flatMap((badge) => badge.missingEvidence ?? []),
    ]),
    evidenceRefs: unique([
      ...selected.flatMap((badge) => badge.evidenceRefs),
      ...roadmap.collaborationBounds.flatMap((bound) => bound.evidenceRefs),
    ]),
  };
}
