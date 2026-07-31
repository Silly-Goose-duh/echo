/** PCM16 LE mono helpers for Echo WebSocket audio. */

/** Float32 [-1,1] → base64 int16le */
export function floatTo16Base64(float32: Float32Array): string {
  const i16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return bytesToBase64(new Uint8Array(i16.buffer));
}

/** base64 int16le → Float32Array */
export function base64Pcm16ToFloat32(b64: string): Float32Array {
  const bytes = base64ToBytes(b64);
  const i16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
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

/** Play a base64 PCM16 mono buffer; resolves when playback ends.
 * `onSource` (optional) receives the live AudioBufferSourceNode so callers
 * can stop playback early (barge-in).
 */
export async function playPcm16Base64(
  b64: string,
  sampleRate: number,
  audioCtx: AudioContext,
  onSource?: (src: AudioBufferSourceNode) => void,
): Promise<void> {
  const f32 = base64Pcm16ToFloat32(b64);
  if (f32.length === 0) return;
  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }
  const buf = audioCtx.createBuffer(1, f32.length, sampleRate);
  // Copy into a fresh ArrayBuffer-backed view for DOM lib typings
  const channel = new Float32Array(f32.length);
  channel.set(f32);
  buf.copyToChannel(channel, 0);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(audioCtx.destination);
  onSource?.(src);
  src.start();
  await new Promise<void>((resolve) => {
    src.onended = () => resolve();
  });
}

/** Simple RMS level 0–1 from a float chunk (for waveform placeholder). */
export function rmsLevel(float32: Float32Array): number {
  if (float32.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < float32.length; i++) {
    const v = float32[i];
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / float32.length) * 4);
}
