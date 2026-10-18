import { validateObservationReplay, SOLAR_OBSERVATION_SNAPSHOT_MAX_BYTES } from '../../../shared/solar-observation-replay';
export { validateObservationReplay, serializeObservationSnapshot, SOLAR_OBSERVATION_SNAPSHOT_MAX_BYTES } from '../../../shared/solar-observation-replay';

export async function readObservationReplayInput(input: {
  files: ArrayLike<Pick<File, 'size' | 'text'>> | null;
  value: string;
}) {
  try {
    const file = input.files?.[0];
    if (!file || file.size > SOLAR_OBSERVATION_SNAPSHOT_MAX_BYTES)
      throw new Error('Select a snapshot no larger than 8 MB');
    const text=await file.text();
    if(new TextEncoder().encode(text).byteLength>SOLAR_OBSERVATION_SNAPSHOT_MAX_BYTES)
      throw new Error('Select a snapshot no larger than 8 MB');
    return await validateObservationReplay(JSON.parse(text));
  } finally {
    // Browsers otherwise suppress change events when the same file is selected again.
    input.value = '';
  }
}
