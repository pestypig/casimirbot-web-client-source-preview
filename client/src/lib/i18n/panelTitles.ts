import type { InterfaceMessageId, InterfaceMessageValues } from "@/lib/i18n/messages/types";

type InterfaceTranslate = (id: InterfaceMessageId, values?: InterfaceMessageValues) => string;

const PANEL_TITLE_MESSAGES: Record<string, InterfaceMessageId> = {
  "account-session": "panel.title.accountSession",
  "code-admin": "panel.title.codeAdmin",
  "docs-viewer": "panel.title.docsViewer",
  "document-image-lens": "panel.title.imageLens",
  endpoints: "panel.title.endpoints",
  "essence-prompt-panel": "panel.title.essencePromptVariations",
  "essence-proposals": "panel.title.essenceProposals",
  "helix-noise-gens": "panel.title.helixNoiseGens",
  "helix-observables": "panel.title.helixObservables",
  "image-lens": "panel.title.imageLens",
  "live-answer-environment": "panel.title.liveAnswer",
  "helix-luma": "panel.title.lumaLab",
  "mission-ethos": "panel.title.missionEthos",
  "moral-graph": "panel.title.moralGraph",
  "mission-ethos-source": "panel.title.missionEthosSource",
  narrator: "panel.title.narrator",
  "rag-admin": "panel.title.ragAdmin",
  "rag-ingest": "panel.title.ragIngest",
  "resonance-orchestra": "panel.title.resonanceOrchestra",
  "scientific-calculator": "panel.title.scientificCalculator",
  "situation-room-pipelines": "panel.title.situationRoom",
  "situation-room-sources": "panel.title.situationRoom",
  "stage-play-badge-graph": "panel.title.stagePlayBadgeGraph",
  "theory-badge-graph": "panel.title.theoryBadgeGraph",
  "star-coherence": "panel.title.starCoherence",
  "star-hydrostatic": "panel.title.starHydrostatic",
  "star-watcher": "panel.title.starWatcher",
  taskbar: "panel.title.taskbar",
  "agi-task-history": "panel.title.taskHistory",
  "workstation-clipboard-history": "panel.title.clipboardHistory",
  "workstation-notes": "panel.title.workstationNotes",
  "workstation-process-graph": "panel.title.processGraph",
  "workstation-storage-map": "panel.title.storageMap",
  "workstation-task-manager": "panel.title.taskManager",
  "workstation-workflow-timeline": "panel.title.workflowTimeline",
};

export function getInterfacePanelTitle(
  translate: InterfaceTranslate,
  panelId: string,
  fallbackTitle: string,
): string {
  const messageId = PANEL_TITLE_MESSAGES[panelId];
  return messageId ? translate(messageId) : fallbackTitle;
}
