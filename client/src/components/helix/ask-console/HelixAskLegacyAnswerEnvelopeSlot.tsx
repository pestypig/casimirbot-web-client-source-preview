import type { ReactNode } from "react";

import type { HelixAskResponseEnvelope } from "@shared/helix-ask-envelope";

import { HelixAskCalculatorPanelLaunchSurface } from "./HelixAskCalculatorPanelLaunchSurface";
import { HelixAskEnvelopeAnswerSurface } from "./HelixAskEnvelopeAnswerSurface";
import { HelixAskEnvelopeSectionsSurface } from "./HelixAskEnvelopeSectionsSurface";
import { HelixAskEnvelopeSupplementSurface } from "./HelixAskEnvelopeSupplementSurface";
import { HelixAskFinalAnswerSurface } from "./HelixAskFinalAnswerSurface";
import { HelixAskPlainAnswerSurface } from "./HelixAskPlainAnswerSurface";
import type { ReadAloudRegionTrafficState } from "@/lib/helix/ask-read-aloud-display";

type HelixAskEnvelopeSection = NonNullable<HelixAskResponseEnvelope["sections"]>[number];

type HelixAskLegacyAnswerCalculatorLaunchState = {
  visible: boolean;
  onOpen: () => void;
};

type HelixAskLegacyAnswerContentRenderer = (content: unknown) => ReactNode;

type HelixAskLegacyAnswerEnvelopeSlotPlainProps = {
  kind: "plain";
  content: ReactNode;
  calculatorLaunch: HelixAskLegacyAnswerCalculatorLaunchState;
};

type HelixAskLegacyAnswerEnvelopeSlotFinalProps = {
  kind: "final";
  finalAnswer: {
    text: string;
    renderContent: HelixAskLegacyAnswerContentRenderer;
    readAloudTraffic?: ReadAloudRegionTrafficState | null;
  };
};

type HelixAskLegacyAnswerEnvelopeSlotEnvelopeProps = {
  kind: "envelope";
  finalAnswer: {
    text: string;
    renderContent: HelixAskLegacyAnswerContentRenderer;
    readAloudTraffic?: ReadAloudRegionTrafficState | null;
  };
  calculatorLaunch: HelixAskLegacyAnswerCalculatorLaunchState;
  supplement: {
    extension: {
      available: boolean;
      open: boolean;
      body: string;
      citations: string[];
      onToggle: () => void;
    };
    detailSections: HelixAskEnvelopeSection[];
    proofSections: HelixAskEnvelopeSection[];
    expandDetails: boolean;
    renderContent: HelixAskLegacyAnswerContentRenderer;
    normalizeCitations: (citations: HelixAskEnvelopeSection["citations"]) => string[];
  };
};

export type HelixAskLegacyAnswerEnvelopeSlotProps =
  | HelixAskLegacyAnswerEnvelopeSlotPlainProps
  | HelixAskLegacyAnswerEnvelopeSlotFinalProps
  | HelixAskLegacyAnswerEnvelopeSlotEnvelopeProps;

export function HelixAskLegacyAnswerEnvelopeSlot(props: HelixAskLegacyAnswerEnvelopeSlotProps) {
  if (props.kind === "plain") {
    return (
      <HelixAskPlainAnswerSurface
        supplement={
          <HelixAskCalculatorPanelLaunchSurface
            visible={props.calculatorLaunch.visible}
            onOpen={props.calculatorLaunch.onOpen}
          />
        }
      >
        {props.content}
      </HelixAskPlainAnswerSurface>
    );
  }

  if (props.kind === "final") {
    return (
      <HelixAskFinalAnswerSurface
        text={props.finalAnswer.text}
        renderContent={props.finalAnswer.renderContent}
        readAloudTraffic={props.finalAnswer.readAloudTraffic}
      />
    );
  }

  const renderSections = (sections: HelixAskEnvelopeSection[], hideTitle?: string) => (
    <HelixAskEnvelopeSectionsSurface
      sections={sections}
      hideTitle={hideTitle}
      renderContent={props.supplement.renderContent}
      normalizeCitations={props.supplement.normalizeCitations}
    />
  );

  return (
    <HelixAskEnvelopeAnswerSurface
      finalAnswer={
        <HelixAskFinalAnswerSurface
          text={props.finalAnswer.text}
          renderContent={props.finalAnswer.renderContent}
          readAloudTraffic={props.finalAnswer.readAloudTraffic}
        />
      }
      calculatorLaunch={
        <HelixAskCalculatorPanelLaunchSurface
          visible={props.calculatorLaunch.visible}
          onOpen={props.calculatorLaunch.onOpen}
        />
      }
      supplement={
        <HelixAskEnvelopeSupplementSurface
          extension={props.supplement.extension}
          detailSections={props.supplement.detailSections}
          proofSections={props.supplement.proofSections}
          expandDetails={props.supplement.expandDetails}
          renderContent={props.supplement.renderContent}
          renderSections={renderSections}
        />
      }
    />
  );
}
