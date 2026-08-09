/** Single fixed warm voice for Echo (Fish S2-Pro / Kokoro fallback).
 *  Multi-voice picker removed server-side; UI keeps a stub label only.
 */

export type VoiceOption = {
  id: string;
  label: string;
  hint: string;
};

/** One entry — id is informational; server ignores client voice when on Fish. */
export const VOICES: VoiceOption[] = [
  { id: "echo", label: "Echo", hint: "warm · fixed" },
];

export const DEFAULT_VOICE = "echo";

export const VOICE_STORAGE_KEY = "echo.voice";
export const OPEN_MIC_STORAGE_KEY = "echo.openMic";

export function voiceLabel(id: string): string {
  return VOICES.find((v) => v.id === id)?.label ?? "Echo";
}
