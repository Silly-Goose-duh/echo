"use client";

import { motion } from "framer-motion";
import type { OrbState } from "@/lib/protocol";

type Props = {
  state: OrbState;
  /** Toggle handler — fired once per tap/click (mouse and touch). */
  onToggle: () => void;
  /** True while the tap-to-talk mic is open (ignored in open-mic mode). */
  listening: boolean;
  disabled?: boolean;
  /** Override the caption (e.g. when open-mic/VAD is on). */
  idleLabel?: string;
  /** Passive orb: open-mic mode drives state on its own. */
  passive?: boolean;
};

const labels: Record<OrbState, string> = {
  idle: "tap to start",
  listening: "listening…",
  processing: "thinking…",
  speaking: "speaking…",
};

/**
 * Soft lantern presence — warm, intimate, not sci-fi.
 */
export function Orb({
  state,
  onToggle,
  listening,
  disabled,
  idleLabel,
  passive,
}: Props) {
  const isListening = state === "listening";
  const isSpeaking = state === "speaking";
  const isProcessing = state === "processing";

  const caption = passive
    ? state === "idle" && idleLabel
      ? idleLabel
      : labels[state]
    : listening
      ? "tap to stop"
      : state === "idle"
        ? (idleLabel ?? labels.idle)
        : labels[state];

  return (
    <div className="relative flex select-none flex-col items-center gap-7 sm:gap-8">
      {/* Far ambient bloom */}
      <motion.div
        className="pointer-events-none absolute left-1/2 top-[46%] h-[280px] w-[280px]
          -translate-x-1/2 -translate-y-1/2 rounded-full sm:h-[360px] sm:w-[360px]"
        style={{
          background:
            "radial-gradient(circle, rgba(212,160,106,0.22) 0%, rgba(176,122,69,0.08) 42%, transparent 70%)",
        }}
        animate={{
          scale: isListening ? 1.18 : isSpeaking ? [1, 1.1, 1] : 1,
          opacity: isListening ? 0.95 : isSpeaking ? 0.85 : 0.55,
        }}
        transition={
          isSpeaking
            ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.45 }
        }
      />

      {/* Soft pulse rings — warm, slow */}
      {(isSpeaking || isListening) &&
        [0, 1].map((i) => (
          <motion.div
            key={i}
            className="pointer-events-none absolute left-1/2 top-[46%] h-[150px] w-[150px]
              -translate-x-1/2 -translate-y-1/2 rounded-full border sm:h-[190px] sm:w-[190px]"
            style={{
              borderColor: isSpeaking
                ? "rgba(224,180,138,0.28)"
                : "rgba(201,184,154,0.3)",
            }}
            initial={{ scale: 0.92, opacity: 0.45 }}
            animate={{ scale: 1.45, opacity: 0 }}
            transition={{
              duration: isSpeaking ? 2.6 : 2.8,
              repeat: Infinity,
              delay: i * 0.9,
              ease: "easeOut",
            }}
          />
        ))}

      <motion.button
        type="button"
        disabled={disabled}
        aria-label={caption}
        aria-pressed={passive ? undefined : listening}
        className="relative z-10 h-[148px] w-[148px] cursor-pointer touch-manipulation
          rounded-full border-0 outline-none focus-visible:ring-2
          focus-visible:ring-[rgba(212,160,106,0.55)] focus-visible:ring-offset-2
          focus-visible:ring-offset-[#100e0c] disabled:cursor-not-allowed
          disabled:opacity-50 sm:h-[184px] sm:w-[184px] lg:h-[200px] lg:w-[200px]"
        style={{
          background: listening
            ? "radial-gradient(circle at 38% 32%, #f0dcc0 0%, #e0b48a 26%, #a87a4e 58%, #2a2218 100%)"
            : isSpeaking
              ? "radial-gradient(circle at 38% 32%, #f5e6d0 0%, #e8c49a 24%, #c9955e 55%, #2a2218 100%)"
              : "radial-gradient(circle at 38% 32%, #ead4b4 0%, #d4a06a 28%, #8a6240 60%, #1c1612 100%)",
          boxShadow: isListening
            ? "0 0 64px rgba(201,184,154,0.45), 0 20px 48px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,246,232,0.35)"
            : isSpeaking
              ? "0 0 72px rgba(224,180,138,0.5), 0 20px 48px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,246,232,0.4)"
              : "0 0 48px rgba(176,122,69,0.28), 0 18px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,246,232,0.28)",
        }}
        animate={{
          scale: isListening ? 1.04 : isProcessing ? [1, 1.025, 1] : 1,
        }}
        transition={
          isProcessing
            ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
            : { type: "spring", stiffness: 280, damping: 24 }
        }
        whileTap={disabled ? undefined : { scale: 0.97 }}
        onClick={() => {
          if (!disabled) onToggle();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Soft inner highlight */}
        <span
          className="pointer-events-none absolute inset-[14%] rounded-full opacity-70"
          style={{
            background:
              "radial-gradient(circle at 40% 28%, rgba(255,246,232,0.35) 0%, transparent 55%)",
          }}
        />

        {/* Idle breath ring */}
        {state === "idle" && (
          <motion.span
            className="pointer-events-none absolute inset-[10%] rounded-full border border-[rgba(255,246,232,0.14)]"
            animate={{ opacity: [0.2, 0.5, 0.2], scale: [0.98, 1.02, 0.98] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        {/* Stop glyph while capturing (tap-to-talk only) */}
        {listening && !passive && (
          <motion.span
            className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2
              -translate-y-1/2 rounded-md bg-[#1a120c]/85 sm:h-6 sm:w-6"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: [0.65, 1, 0.65], scale: 1 }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        <span className="sr-only">{caption}</span>
      </motion.button>

      <p className="text-[13px] tracking-[0.12em] text-[var(--foreground-muted)] sm:text-sm">
        {caption}
      </p>
    </div>
  );
}
