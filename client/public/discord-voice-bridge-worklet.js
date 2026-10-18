// Ephemeral Discord PCM bridge for the owner's active GPT Live session.
// No audio is stored or sent to room APIs. The controlling page owns admission.
class DiscordVoiceInputProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.offset = 0;
    this.queuedSamples = 0;
    this.port.onmessage = (event) => {
      const samples = event.data;
      if (!(samples instanceof Float32Array) || samples.length < 1 ||
          samples.length > 2880 || this.queuedSamples + samples.length > 24000) return;
      this.queue.push(samples);
      this.queuedSamples += samples.length;
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) return true;
    for (let i = 0; i < output.length; i += 1) {
      const head = this.queue[0];
      if (!head) { output[i] = 0; continue; }
      output[i] = head[this.offset++];
      this.queuedSamples -= 1;
      if (this.offset >= head.length) { this.queue.shift(); this.offset = 0; }
    }
    return true;
  }
}

class DiscordVoiceOutputProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Int16Array(1920);
    this.offset = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const left = input?.[0];
    const right = input?.[1] || left;
    outputs[0]?.forEach(channel => channel.fill(0));
    if (!left) return true;
    for (let i = 0; i < left.length; i += 1) {
      const l = Math.max(-1, Math.min(1, left[i] || 0));
      const r = Math.max(-1, Math.min(1, right[i] || 0));
      this.frame[this.offset++] = l < 0 ? Math.round(l * 32768) : Math.round(l * 32767);
      this.frame[this.offset++] = r < 0 ? Math.round(r * 32768) : Math.round(r * 32767);
      if (this.offset === this.frame.length) {
        this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
        this.frame = new Int16Array(1920);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("casimir-discord-voice-input", DiscordVoiceInputProcessor);
registerProcessor("casimir-discord-voice-output", DiscordVoiceOutputProcessor);
