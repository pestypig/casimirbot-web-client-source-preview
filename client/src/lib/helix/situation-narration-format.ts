import type { SituationNarrationReceipt } from "@shared/helix-situation-narration";
import type { SituationPrediction } from "@shared/helix-situation-prediction";

export function formatSituationNarration(receipt: SituationNarrationReceipt): string {
  const intent = receipt.inferred_intent ? ` Intent: ${receipt.inferred_intent}.` : "";
  const prediction = receipt.prediction ? ` Prediction: ${receipt.prediction}` : "";
  return `${receipt.text}${intent}${prediction}`.trim();
}

export function formatSituationPrediction(prediction: SituationPrediction): string {
  const next = prediction.predicted_next_action ? ` Next: ${prediction.predicted_next_action}.` : "";
  return `${prediction.predicted_goal} (${Math.round(prediction.confidence * 100)}%, ${prediction.status}).${next}`;
}
