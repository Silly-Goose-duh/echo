/** Client-side VAD: RMS hysteresis + silence hangover + min-speech gate.
 *
 * Tuned for ChatGPT-voice-like turn taking:
 *  - ~750ms silence ends an utterance (natural mid-thought pauses ok)
 *  - min speech duration avoids false ends on brief noise
 */

export type VadEvent = "none" | "speech_start" | "speech_end";

export type VadOptions = {
  onLevel?: number;
  offLevel?: number;
  silenceMs?: number;
  /** Ignore speech_end until utterance has lasted at least this long. */
  minSpeechMs?: number;
};

export type Vad = {
  push(level: number, now: number): VadEvent;
  readonly speaking: boolean;
  reset(): void;
};

export function createVad({
  onLevel = 0.14,
  offLevel = 0.08,
  silenceMs = 750,
  minSpeechMs = 350,
}: VadOptions = {}): Vad {
  let speaking = false;
  let silenceSince: number | null = null;
  let speechStartedAt: number | null = null;

  return {
    get speaking() {
      return speaking;
    },
    reset() {
      speaking = false;
      silenceSince = null;
      speechStartedAt = null;
    },
    push(level, now) {
      if (!speaking) {
        if (level < onLevel) return "none";
        speaking = true;
        silenceSince = null;
        speechStartedAt = now;
        return "speech_start";
      }
      if (level >= offLevel) {
        silenceSince = null;
        return "none";
      }
      if (silenceSince === null) {
        silenceSince = now;
        return "none";
      }
      if (now - silenceSince < silenceMs) return "none";
      // Too short to count as a real utterance — keep listening.
      if (
        speechStartedAt != null &&
        now - speechStartedAt < minSpeechMs
      ) {
        silenceSince = now;
        return "none";
      }
      speaking = false;
      silenceSince = null;
      speechStartedAt = null;
      return "speech_end";
    },
  };
}
