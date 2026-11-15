import {solarObservationSourceReceiptSchema,type SolarObservationSourceReceipt} from '@shared/solar-observation-source';
import {validateObservationReplay} from './solar-observation-replay';

/** Client replay identity check, not source FITS authentication or scientific admission. */
export async function verifyRetainedSolarObservation(
  input:unknown,ownerProfileId:string,selected:SolarObservationSourceReceipt,
) {
  const value=input as {receipt?:unknown;archive?:unknown}|null;
  const receipt=solarObservationSourceReceiptSchema.parse(value?.receipt);
  if(receipt.ownerProfileId!==ownerProfileId||selected.ownerProfileId!==ownerProfileId||
    (Object.keys(selected) as Array<keyof SolarObservationSourceReceipt>).some(key=>receipt[key]!==selected[key]))
    throw new Error('Retained source receipt does not match selected owner and source');
  const archive=await validateObservationReplay(value?.archive);
  const frame=archive.frames[receipt.frameIndex];
  if(!frame||archive.archive_identity?.snapshotId!==receipt.archiveId||
    frame.index!==receipt.frameIndex||frame.display_sha256!==receipt.displaySha256||
    frame.fits_sha256!==receipt.sourceFitsSha256||frame.obstime!==receipt.observedAtUtc||
    archive.instrument!==receipt.instrument||archive.wavelength_A!==receipt.wavelengthAngstrom)
    throw new Error('Retained source receipt does not match display archive and frame');
  return {receipt,archive};
}
