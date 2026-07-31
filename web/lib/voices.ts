/** Curated Kokoro voice subset offered in the Echo UI.
 *  Voice ids must match Kokoro's voice pack names used server-side by tts.py.
 */

export type VoiceOption = {
  id: string;
  label: string;
  hint: string;
};

export const VOICES: VoiceOption[] = [
  { id: "af_heart", label: "Heart", hint: "US · warm" },
  { id: "af_alloy", label: "Alloy", hint: "US · neutral" },
  { id: "af_aoi", label: "Aoi", hint: "US · bright" },
  { id: "af_nova", label: "Nova", hint: "US · clear" },
  { id: "af_sky", label: "Sky", hint: "US · airy" },
  { id: "am_michael", label: "Michael", hint: "US · male" },
  { id: "bf_emma", label: "Emma", hint: "UK · female" },
  { id: "bm_george", label: "George", hint: "UK · male" },
];

export const DEFAULT_VOICE = "af_heart";

export const VOICE_STORAGE_KEY = "echo.voice";
export const OPEN_MIC_STORAGE_KEY = "echo.openMic";

export function voiceLabel(id: string): string {
  return VOICES.find((v) => v.id === id)?.label ?? id;
}
