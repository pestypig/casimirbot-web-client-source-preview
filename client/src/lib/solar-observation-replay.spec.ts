import { afterEach, describe, expect, it, vi } from 'vitest';
import { webcrypto, createHash } from 'node:crypto';
import { validateObservationReplay, serializeObservationSnapshot, readObservationReplayInput } from './solar-observation-replay';
afterEach(() => vi.unstubAllGlobals());
const snapshot = () => {
  const bytes = Buffer.alloc(32 * 32 * 4);
  return { instrument:'AIA', wavelength_A:193, meta:{observed_mode:'observed'},
    frames:[{grid_size:32,map_b64:bytes.toString('base64'),obstime:'2026-09-26T15:03:00Z',
      coordinate_frame:'native_instrument_pixel_grid',fits_sha256:'a'.repeat(64),
      display_sha256:createHash('sha256').update(bytes).digest('hex')}],
    events:[{malformed:'untrusted'}] };
};
describe('observation snapshot replay', () => {
  it('checks actual UTF-8 bytes before parsing even if a file reports a smaller size',async()=>{
    const input={value:'oversized.json',files:[{size:1,text:async()=> 'é'.repeat(4_000_001)}]};
    await expect(readObservationReplayInput(input)).rejects.toThrow('8 MB');
    expect(input.value).toBe('');
  });
  it('rejects impossible encoded grid lengths before decoding',async()=>{
    const decode=vi.fn();vi.stubGlobal('atob',decode);
    const input=snapshot();input.frames[0].map_b64='A'.repeat(100_000);
    await expect(validateObservationReplay(input)).rejects.toThrow('encoded byte-count');
    expect(decode).not.toHaveBeenCalled();
  });
  it('resets the replay selector after success so the same file can be selected again', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const text = JSON.stringify(snapshot());
    const input = { value: 'snapshot.json', files: [{ size: text.length, text: async () => text }] };
    expect((await readObservationReplayInput(input)).frames).toHaveLength(1);
    expect(input.value).toBe('');
    input.value = 'snapshot.json';
    expect((await readObservationReplayInput(input)).frames).toHaveLength(1);
    expect(input.value).toBe('');
  });
  it('resets rejected inputs without reading an oversized file', async () => {
    const text = vi.fn(async () => 'invalid');
    const input = { value: 'oversized.json', files: [{ size: 8_000_001, text }] };
    await expect(readObservationReplayInput(input)).rejects.toThrow('8 MB');
    expect(input.value).toBe(''); expect(text).not.toHaveBeenCalled();
    const invalid = { value: 'invalid.json', files: [{ size: 7, text }] };
    await expect(readObservationReplayInput(invalid)).rejects.toThrow();
    expect(invalid.value).toBe('');
  });
  it('saves a sanitized snapshot that passes replay and excludes local paths', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const raw = { ...snapshot(), bridge: { untrusted: true } };
    Object.assign(raw.frames[0], { fits_path: 'C:/private/file.fits', wcs_header: {CTYPE1:'HPLN-TAN'},
      registration_geometry:{observerCarringtonLongitudeDeg:75,observerCarringtonLatitudeDeg:6,
        observerDistanceMeters:1.5e11,solarRadiusMeters:6.96e8} });
    const text = await serializeObservationSnapshot(raw);
    expect(text).not.toContain('private'); expect(text).not.toContain('untrusted');
    const replay = await validateObservationReplay(JSON.parse(text));
    expect(replay.frames[0].wcs_header).toEqual({CTYPE1:'HPLN-TAN'});
    expect(replay.frames[0].registration_geometry).toEqual({observerCarringtonLongitudeDeg:75,
      observerCarringtonLatitudeDeg:6,observerDistanceMeters:1.5e11,solarRadiusMeters:6.96e8});
    expect(replay.archive_identity).toMatchObject({schemaVersion:'solar-observation-archive-identity/1',liveMeasurement:false,containsSourceFits:false});
    expect(await serializeObservationSnapshot(replay)).toBe(text);
  });
  it('rejects metadata tampering even when display bytes are unchanged',async()=>{
    vi.stubGlobal('crypto',webcrypto);
    const saved=JSON.parse(await serializeObservationSnapshot(snapshot()));
    saved.frames[0].obstime='2026-09-26T16:03:00Z';
    await expect(validateObservationReplay(saved)).rejects.toThrow('lineage mismatch');
    const claimed=JSON.parse(await serializeObservationSnapshot(snapshot()));
    claimed.archive_identity.scientificAdmission=true;
    await expect(validateObservationReplay(claimed)).rejects.toThrow('lineage mismatch');
  });
  it('refuses saving beyond the replay byte limit', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const raw = snapshot(); Object.assign(raw.frames[0], {wcs_header:{description:'x'.repeat(8_000_000)}});
    await expect(serializeObservationSnapshot(raw)).rejects.toThrow('8 MB');
  });
  it('verifies display bytes and excludes imported event data', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const result = await validateObservationReplay(snapshot());
    expect(result.events).toEqual([]);
    expect(result.frames).toHaveLength(1);
  });
  it('rejects a modified display hash', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const value = snapshot(); value.frames[0].display_sha256 = 'b'.repeat(64);
    await expect(validateObservationReplay(value)).rejects.toThrow('hash mismatch');
  });
  it('rejects invalid solar observer geometry instead of retaining an unusable registration pose',async()=>{
    const value=snapshot();Object.assign(value.frames[0],{registration_geometry:{observerCarringtonLongitudeDeg:360,
      observerCarringtonLatitudeDeg:0,observerDistanceMeters:1,solarRadiusMeters:1}});
    await expect(validateObservationReplay(value)).rejects.toThrow('Solar observer geometry');
  });
  it('rejects fixtures, missing provenance and oversized frame lists', async () => {
    await expect(validateObservationReplay({...snapshot(),meta:{observed_mode:'model'}})).rejects.toThrow();
    const value = snapshot(); value.frames[0].fits_sha256 = '';
    await expect(validateObservationReplay(value)).rejects.toThrow();
    await expect(validateObservationReplay({...snapshot(),frames:Array(41).fill(snapshot().frames[0])})).rejects.toThrow();
  });
});
