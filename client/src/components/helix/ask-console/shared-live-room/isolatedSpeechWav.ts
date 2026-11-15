const MAX_PCM_BYTES = 12_000 / 20 * 960 * 2 * 2;
const FRAME_BYTES = 3_840;

/** Browser-side 48 kHz stereo PCM16 wrapper for the native, owner-keyed
 * transcription path. The caller erases this buffer after IPC completes. */
export function isolatedSpeechWav(pcm: Uint8Array): Uint8Array | null {
  if (!(pcm instanceof Uint8Array) || pcm.byteLength < 3 * FRAME_BYTES ||
      pcm.byteLength > MAX_PCM_BYTES || pcm.byteLength % FRAME_BYTES !== 0)
    return null;
  const wav = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(wav.buffer);
  const ascii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) wav[offset + i] = value.charCodeAt(i);
  };
  ascii(0, "RIFF"); view.setUint32(4, wav.byteLength - 8, true);
  ascii(8, "WAVEfmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, 48_000, true); view.setUint32(28, 48_000 * 4, true);
  view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  ascii(36, "data"); view.setUint32(40, pcm.byteLength, true);
  wav.set(pcm, 44);
  return wav;
}
