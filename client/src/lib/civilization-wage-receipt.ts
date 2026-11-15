import { WAGE_ASSESSMENT_ALGORITHM, wageAssessmentPackSchema, wageAssessmentReceiptSchema,
  type WageAssessmentPack } from '@shared/civilization-wage-assessment';

const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, entry]) => [key, canonical(entry)])) : value;
const json = (value: unknown) => JSON.stringify(canonical(value));
const hash = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256', new TextEncoder().encode(json(value)))), byte => byte.toString(16).padStart(2, '0')).join('');

/** Checks selected-input/content identity, not sources, causal validity or numerical correctness. */
export async function verifyCivilizationWageReceipt(input: unknown, submitted: WageAssessmentPack) {
  const receipt = wageAssessmentReceiptSchema.parse(input);
  const pack = wageAssessmentPackSchema.parse(submitted);
  if (json(receipt.pack) !== json(pack) || receipt.calculation.assessmentId !== pack.assessmentId ||
    receipt.calculation.countryIso3 !== pack.countryIso3 || receipt.calculation.currency !== pack.currency)
    throw new Error('wage_assessment_input_mismatch');
  const inputSha256 = await hash({ algorithmVersion: WAGE_ASSESSMENT_ALGORITHM, pack });
  if (receipt.inputSha256 !== inputSha256 ||
    receipt.receiptSha256 !== await hash({ inputSha256, calculation: receipt.calculation }))
    throw new Error('wage_assessment_content_mismatch');
  return receipt;
}
