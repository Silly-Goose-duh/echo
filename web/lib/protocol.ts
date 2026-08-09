/** WebSocket protocol for Echo /ws/converse — mirrors server/app/ws.py */

export type ClientMessage =
  | { type: "start" }
  | { type: "reset" }
  | { type: "end_utt" }
  | { type: "text"; text: string }
  | { type: "audio"; pcm16: string; sr: number }
  /**
   * Session configuration, client → server. All fields optional.
   *   voice:    Kokoro voice id (e.g. "af_heart") used for subsequent TTS.
   *   open_mic: informational — client streams continuously with client-side VAD.
   */
  | { type: "config"; voice?: string; open_mic?: boolean };

export type TurnMetrics = {
  stt_ms?: number | null;
  llm_first_token_ms?: number | null;
  tts_first_audio_ms?: number | null;
  total_ms?: number | null;
  interrupted?: boolean;
  user_text?: string;
  assistant_text?: string;
};

export type ServerMessage =
  | { type: "ready" }
  | { type: "partial_transcript"; text: string }
  | {
      type: "final_transcript";
      text: string;
      stt_ms?: number;
      backend?: string;
    }
  | { type: "assistant_text"; text: string; final?: boolean }
  | {
      type: "audio";
      pcm16: string;
      sr: number;
      text?: string;
      tts_ms?: number;
    }
  | { type: "interrupted" }
  | { type: "config_ok"; voice?: string; open_mic?: boolean }
  | { type: "turn_end"; metrics?: TurnMetrics }
  | { type: "error"; message: string };

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "ready"
  | "disconnected"
  | "error";

export type OrbState = "idle" | "listening" | "processing" | "speaking";

export type TranscriptEntry = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  meta?: string;
  ts: number;
};

/** Public Tailscale Funnel endpoint for the inference server. */
export const PRODUCTION_WS_URL =
  "wss://desktop-re0mlgm.tail7e61ea.ts.net/ws/converse";

/**
 * Default WS URL.
 * - Override anytime with NEXT_PUBLIC_ECHO_WS_URL (local: ws://127.0.0.1:8787/ws/converse)
 * - Production default is the public Funnel URL so Vercel never bakes in localhost
 *   (the classic "Not connected to server" bug).
 */
export const DEFAULT_WS_URL =
  process.env.NEXT_PUBLIC_ECHO_WS_URL ?? PRODUCTION_WS_URL;

export const TARGET_SAMPLE_RATE = 16000;
