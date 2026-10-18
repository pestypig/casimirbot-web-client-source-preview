import { serializeObservationSnapshot } from './solar-observation-replay';
import type { SolarObservationSaveResult } from '../../../shared/solar-observation-save';

type SaveBridge = { saveSolarObservation?: (text: string) => Promise<SolarObservationSaveResult> };
const requestBrowserDownload = (text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'solar-observation.json';
  try { anchor.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
};

/** Browser download requests are not filesystem save receipts. */
export async function exportObservationSnapshot(input: unknown, bridge: SaveBridge | undefined,
  download: (text: string) => void = requestBrowserDownload): Promise<string> {
  const text = await serializeObservationSnapshot(input);
  const snapshotId=JSON.parse(text).archive_identity.snapshotId as string;
  if (bridge) {
    if (typeof bridge.saveSolarObservation !== 'function')
      throw new Error('This desktop build does not support native observation export yet');
    const result = await bridge.saveSolarObservation(text);
    if (result?.status === 'saved' && typeof result.fileName === 'string' &&
        !/[\\/]/.test(result.fileName) && result.fileName.toLowerCase().endsWith('.json') &&
        Number.isInteger(result.bytes) && result.bytes > 0 && result.bytes <= 8_000_000)
      return `Saved ${result.fileName} (${result.bytes} bytes). Archive identity: ${snapshotId}. Display hashes verified; original FITS files are not included.`;
    if (result?.status === 'cancelled') return 'Snapshot save cancelled; no file written.';
    if (result?.status === 'failed' && typeof result.reason === 'string')
      return `Snapshot not saved: ${result.reason}`;
    throw new Error('Desktop returned an invalid observation-save receipt');
  }
  download(text);
  return `Browser download requested; verify the downloaded file before replay. Archive identity: ${snapshotId}. Original FITS files are not included.`;
}
