/** Client-side voice-activity detection: RMS hysteresis + silence hangover.
 *
 *  Pure state machine so it can be unit-tested outside the browser.
 *  Levels are rmsLevel() output (0–1); `now` is a monotonic ms clock.
 */

export type VadEvent = "none" | "speech_start" | "speech_end";

export type VadOptions = {
  /** Rising threshold: level ≥ this starts an utterance. */
  onLevel?: number;
  /** Falling threshold: level < this counts as silence. */
  offLevel?: number;
  /** Continuous silence needed to end an utterance. */
  silenceMs?: number;
};

export type Vad = {
  /** Feed one audio frame; returns the transition it caused (if any). */
  push(level: number, now: number): VadEvent;
  /** True while inside an utterance. */
  readonly speaking: boolean;
  reset(): void;
};

export function createVad({
  onLevel = 0.16,
  offLevel = 0.09,
  silenceMs = 500,
}: VadOptions = {}): Vad {
  let speaking = false;
  let silenceSince: number | null = null;

  return {
    get speaking() {
      return speaking;
    },
    reset() {
      speaking = false;
      silenceSince = null;
    },
    push(level, now) {
      if (!speaking) {
        if (level < onLevel) return "none";
        speaking = true;
        silenceSince = null;
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
      speaking = false;
      silenceSince = null;
      return "speech_end";
    },
  };
}
