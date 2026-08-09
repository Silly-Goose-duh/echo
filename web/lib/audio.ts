/** PCM16 helpers + gap-free TTS scheduler for Echo. */

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
  for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
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
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let ttsCtx: AudioContext | null = null;
let ttsGain: GainNode | null = null;
let ttsNextTime = 0;
/** Serializes decode→start only (NOT full playback). */
let scheduleChain: Promise<void> = Promise.resolve();
const activeSources = new Set<AudioBufferSourceNode>();
const endWaiters: Promise<void>[] = [];

export function bumpPlaybackGeneration(): void {
  ttsNextTime = 0;
  for (const s of [...activeSources]) {
    try {
      s.onended = null;
      s.stop();
    } catch {
      /* ok */
    }
  }
  activeSources.clear();
  endWaiters.length = 0;
  // Keep scheduleChain alive but no-op gaps
  scheduleChain = Promise.resolve();
}

function ensureGraph(sampleRate = 24000): AudioContext {
  if (!ttsCtx || ttsCtx.state === "closed") {
    ttsCtx = new AudioContext({ sampleRate });
    ttsGain = ttsCtx.createGain();
    ttsGain.gain.value = 1;
    ttsGain.connect(ttsCtx.destination);
    ttsNextTime = 0;
  }
  return ttsCtx;
}

/**
 * Schedule clip ASAP on a continuous timeline.
 * Resolves when scheduling is done (clip may still be playing).
 * Use drainPlayback() to wait until silence.
 */
export function schedulePcm16Base64(
  b64: string,
  sampleRate: number,
  onSource?: (src: AudioBufferSourceNode) => void,
): Promise<void> {
  const job = scheduleChain.then(async () => {
    const f32 = base64Pcm16ToFloat32(b64);
    if (f32.length === 0) return;

    const ctx = ensureGraph(sampleRate);
    if (ctx.state === "suspended") await ctx.resume();

    const buf = ctx.createBuffer(1, f32.length, sampleRate);
    const channel = new Float32Array(new ArrayBuffer(f32.byteLength));
    channel.set(f32);
    buf.copyToChannel(channel, 0);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ttsGain ?? ctx.destination);
    activeSources.add(src);
    onSource?.(src);

    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.025, ttsNextTime);
    ttsNextTime = startAt + buf.duration;
    src.start(startAt);

    const ended = new Promise<void>((resolve) => {
      src.onended = () => {
        activeSources.delete(src);
        resolve();
      };
    });
    endWaiters.push(ended);
  });
  scheduleChain = job.catch(() => undefined);
  return job;
}

/** Wait until all scheduled clips have finished (or been stopped). */
export async function drainPlayback(): Promise<void> {
  // Drain in waves so clips scheduled while waiting still get covered.
  for (let i = 0; i < 8; i++) {
    await scheduleChain;
    if (endWaiters.length === 0 && activeSources.size === 0) return;
    const batch = endWaiters.splice(0, endWaiters.length);
    if (batch.length) await Promise.all(batch);
    else break;
  }
}

/** @deprecated — schedules and waits for this clip only (can gap). Prefer schedule + drain. */
export async function playPcm16Base64Seamless(
  b64: string,
  sampleRate: number,
  onSource?: (src: AudioBufferSourceNode) => void,
  _gen?: number,
): Promise<void> {
  await schedulePcm16Base64(b64, sampleRate, onSource);
  await drainPlayback();
}

export async function playPcm16Base64(
  b64: string,
  sampleRate: number,
  _ctx: AudioContext,
  onSource?: (src: AudioBufferSourceNode) => void,
): Promise<void> {
  return playPcm16Base64Seamless(b64, sampleRate, onSource);
}

export function rmsLevel(float32: Float32Array): number {
  if (float32.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < float32.length; i++) sum += float32[i] * float32[i];
  return Math.min(1, Math.sqrt(sum / float32.length) * 4);
}
