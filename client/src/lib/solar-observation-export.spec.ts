import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { exportObservationSnapshot } from './solar-observation-export';

afterEach(() => vi.unstubAllGlobals());
const observation = () => {
  vi.stubGlobal('crypto', webcrypto);
  const bytes = Buffer.alloc(32 * 32 * 4);
  return { instrument: 'AIA', wavelength_A: 193, meta: { observed_mode: 'observed' },
    frames: [{ grid_size: 32, map_b64: bytes.toString('base64'), obstime: '2026-09-26T17:00:00Z',
      coordinate_frame: 'native_instrument_pixel_grid', fits_sha256: 'a'.repeat(64),
      display_sha256: createHash('sha256').update(bytes).digest('hex') }] };
};
describe('observation export receipt presentation', () => {
  it('uses the native operation and reports its actual save receipt', async () => {
    const download = vi.fn();
    const saveSolarObservation = vi.fn(async (text: string) => ({ status: 'saved' as const,
      fileName: 'chosen.json', bytes: Buffer.byteLength(text) }));
    expect(await exportObservationSnapshot(observation(), { saveSolarObservation }, download)).toContain('Saved chosen.json');
    expect(JSON.parse(saveSolarObservation.mock.calls[0][0]).frames).toHaveLength(1);
    expect(download).not.toHaveBeenCalled();
  });
  it('does not claim success or fall back to blocked downloads on cancellation or failure', async () => {
    const download = vi.fn();
    expect(await exportObservationSnapshot(observation(), { saveSolarObservation: async () => ({ status: 'cancelled' }) }, download))
      .toContain('cancelled; no file written');
    expect(await exportObservationSnapshot(observation(), { saveSolarObservation: async () => ({ status: 'failed', reason: 'disk full' }) }, download))
      .toBe('Snapshot not saved: disk full');
    expect(download).not.toHaveBeenCalled();
  });
  it('fails closed on older desktop builds and malformed native receipts', async () => {
    const download = vi.fn();
    await expect(exportObservationSnapshot(observation(), {}, download)).rejects.toThrow('does not support');
    await expect(exportObservationSnapshot(observation(), { saveSolarObservation: async () => null as any }, download)).rejects.toThrow('invalid');
    expect(download).not.toHaveBeenCalled();
  });
  it('labels a web download as requested rather than saved', async () => {
    const download = vi.fn();
    expect(await exportObservationSnapshot(observation(), undefined, download)).toContain('download requested; verify');
    expect(download).toHaveBeenCalledOnce();
  });
  it('rejects corrupted input before invoking either export path', async () => {
    const value = observation(); value.frames[0].display_sha256 = 'b'.repeat(64);
    const saveSolarObservation = vi.fn(); const download = vi.fn();
    await expect(exportObservationSnapshot(value, { saveSolarObservation }, download)).rejects.toThrow('hash mismatch');
    expect(saveSolarObservation).not.toHaveBeenCalled(); expect(download).not.toHaveBeenCalled();
  });
});
