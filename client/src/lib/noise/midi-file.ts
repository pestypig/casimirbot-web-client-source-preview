import type { MidiMotif, MidiNote } from "@/types/noise-gens";

const readString = (view: DataView, offset: number, length: number) => {
  let value = "";
  for (let i = 0; i < length; i += 1) {
    value += String.fromCharCode(view.getUint8(offset + i));
  }
  return value;
};

const readVarLength = (view: DataView, start: number) => {
  let result = 0;
  let offset = start;
  for (let i = 0; i < 4; i += 1) {
    const byte = view.getUint8(offset);
    result = (result << 7) | (byte & 0x7f);
    offset += 1;
    if ((byte & 0x80) === 0) break;
  }
  return { value: result, offset };
};

const clamp01 = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

export const parseMidiFile = (
  buffer: ArrayBuffer,
  fallbackName?: string,
): MidiMotif | null => {
  if (buffer.byteLength < 14) return null;
  const view = new DataView(buffer);
  let offset = 0;
  if (readString(view, offset, 4) !== "MThd") return null;
  offset += 4;
  const headerLength = view.getUint32(offset, false);
  offset += 4;
  if (headerLength < 6) return null;
  const format = view.getUint16(offset, false);
  const trackCount = view.getUint16(offset + 2, false);
  const division = view.getUint16(offset + 4, false);
  offset += headerLength;
  const ticksPerBeat = division & 0x8000 ? 480 : division;
  if (!ticksPerBeat) return null;

  let tempoMicro = 500000;
  let timeSigNum = 4;
  let timeSigDen = 4;
  const notes: MidiNote[] = [];
  const active = new Map<string, Array<{ startTick: number; velocity: number }>>();

  const trackTotal = format === 2 ? 1 : trackCount;
  for (let trackIndex = 0; trackIndex < trackTotal; trackIndex += 1) {
    if (offset + 8 > buffer.byteLength) break;
    if (readString(view, offset, 4) !== "MTrk") break;
    offset += 4;
    const trackLength = view.getUint32(offset, false);
    offset += 4;
    const trackEnd = Math.min(buffer.byteLength, offset + trackLength);
    let tick = 0;
    let runningStatus = 0;
    while (offset < trackEnd) {
      const delta = readVarLength(view, offset);
      tick += delta.value;
      offset = delta.offset;
      if (offset >= trackEnd) break;
      const statusByte = view.getUint8(offset);
      if (statusByte === 0xff) {
        offset += 1;
        if (offset >= trackEnd) break;
        const type = view.getUint8(offset);
        offset += 1;
        const len = readVarLength(view, offset);
        offset = len.offset;
        if (type === 0x51 && len.value === 3 && offset + 2 < trackEnd) {
          tempoMicro =
            (view.getUint8(offset) << 16) |
            (view.getUint8(offset + 1) << 8) |
            view.getUint8(offset + 2);
        } else if (type === 0x58 && len.value >= 2 && offset + 1 < trackEnd) {
          timeSigNum = view.getUint8(offset);
          const denomPow = view.getUint8(offset + 1);
          timeSigDen = Math.pow(2, denomPow) || 4;
        }
        offset += len.value;
        continue;
      }
      if (statusByte === 0xf0 || statusByte === 0xf7) {
        offset += 1;
        const len = readVarLength(view, offset);
        offset = len.offset + len.value;
        continue;
      }

      let status = statusByte;
      let data1: number;
      if (statusByte < 0x80) {
        status = runningStatus;
        data1 = statusByte;
        offset += 1;
      } else {
        runningStatus = statusByte;
        offset += 1;
        if (offset >= trackEnd) break;
        data1 = view.getUint8(offset);
        offset += 1;
      }

      const eventType = status & 0xf0;
      const channel = status & 0x0f;
      const needsTwoBytes = !(eventType === 0xc0 || eventType === 0xd0);
      let data2 = 0;
      if (needsTwoBytes) {
        if (offset >= trackEnd) break;
        data2 = view.getUint8(offset);
        offset += 1;
      }

      if (eventType === 0x90 || eventType === 0x80) {
        const pitch = data1;
        const velocity = data2;
        const key = `${channel}:${pitch}`;
        if (eventType === 0x90 && velocity > 0) {
          const bucket = active.get(key) ?? [];
          bucket.push({ startTick: tick, velocity: velocity / 127 });
          active.set(key, bucket);
        } else {
          const bucket = active.get(key);
          const entry = bucket?.shift();
          if (entry) {
            const durationTicks = Math.max(0, tick - entry.startTick);
            notes.push({
              startBeat: entry.startTick / ticksPerBeat,
              durationBeats: Math.max(0.01, durationTicks / ticksPerBeat),
              pitch,
              velocity: clamp01(entry.velocity),
            });
          }
        }
      }
    }
    offset = trackEnd;
  }

  if (!notes.length) return null;
  notes.sort(
    (a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch,
  );
  const totalBeats = notes.reduce(
    (acc, note) => Math.max(acc, note.startBeat + note.durationBeats),
    0,
  );
  const bpm = tempoMicro > 0 ? Math.round(60000000 / tempoMicro) : undefined;
  const timeSig =
    timeSigNum && timeSigDen
      ? (`${timeSigNum}/${timeSigDen}` as MidiMotif["timeSig"])
      : undefined;
  const beatsPerBar = timeSigNum || 4;
  const bars = totalBeats > 0 ? Math.max(1, Math.ceil(totalBeats / beatsPerBar)) : undefined;

  return {
    name: fallbackName,
    bpm,
    timeSig,
    bars,
    lengthBeats: totalBeats > 0 ? totalBeats : undefined,
    notes,
  };
};
