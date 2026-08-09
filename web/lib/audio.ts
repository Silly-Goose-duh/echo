/** PCM16 LE mono helpers + seamless TTS playback for Echo. */

export function floatTo16Base64(float32: Float32Array): string {
  const i16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return bytesToBase64(new Uint8Array(i16.buffer));
}

export function base64Pcm16ToFloat32(b64: string): Float32Array {
  const bytes = base64ToBytes(b64);
  const i16 = new Int16Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength / 2,
  );
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) {
    f32[i] = i16[i] / 32768;
  }
  return f32;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Shared TTS playback graph (Kokoro = 24 kHz). */
let ttsCtx: AudioContext | null = null;
let ttsNextTime = 0;

/** Call on barge-in / reset so the next clip starts cleanly. */
export function bumpPlaybackGeneration(): void {
  ttsNextTime = 0;
}

export function getTtsContext(sampleRate = 24000): AudioContext {
  if (!ttsCtx || ttsCtx.state === "closed") {
    ttsCtx = new AudioContext({ sampleRate });
    ttsNextTime = 0;
  }
  return ttsCtx;
}

/**
 * Queue PCM16 onto a seamless timeline (no gaps between consecutive clips).
 * Resolves when this clip finishes (or is stopped).
 */
export async function playPcm16Base64Seamless(
  b64: string,
  sampleRate: number,
  onSource?: (src: AudioBufferSourceNode) => void,
  _gen?: number,
): Promise<void> {
  const f32 = base64Pcm16ToFloat32(b64);
  if (f32.length === 0) return;

  const ctx = getTtsContext(sampleRate);
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const buf = ctx.createBuffer(1, f32.length, sampleRate);
  const channel = new Float32Array(f32.length);
  channel.set(f32);
  buf.copyToChannel(channel, 0);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  onSource?.(src);

  const now = ctx.currentTime;
  const startAt = Math.max(now + 0.015, ttsNextTime || now + 0.015);
  ttsNextTime = startAt + buf.duration;
  src.start(startAt);

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    src.onended = finish;
    // If stop() is called for barge-in, onended still fires.
  });
}

/** @deprecated prefer seamless */
export async function playPcm16Base64(
  b64: string,
  sampleRate: number,
  _audioCtx: AudioContext,
  onSource?: (src: AudioBufferSourceNode) => void,
): Promise<void> {
  return playPcm16Base64Seamless(b64, sampleRate, onSource);
}

export function rmsLevel(float32: Float32Array): number {
  if (float32.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < float32.length; i++) {
    const v = float32[i];
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / float32.length) * 4);
}
