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
  idle: "tap to talk",
  listening: "tap to stop",
  processing: "thinking…",
  speaking: "speaking",
};

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
    <div className="relative flex select-none flex-col items-center gap-6 sm:gap-7">
      {/* Soft ambient glow */}
      <motion.div
        className="pointer-events-none absolute left-1/2 top-[110px] h-[240px] w-[240px]
          -translate-x-1/2 -translate-y-1/2 rounded-full sm:top-[130px] sm:h-[320px] sm:w-[320px]"
        style={{
          background:
            "radial-gradient(circle, rgba(99,140,255,0.22) 0%, transparent 70%)",
        }}
        animate={{
          scale: isListening ? 1.25 : isSpeaking ? [1, 1.15, 1] : 1,
          opacity: isListening ? 0.9 : isSpeaking ? 0.75 : 0.45,
        }}
        transition={
          isSpeaking
            ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.35 }
        }
      />

      {/* Listening / speaking ripples */}
      {(isSpeaking || isListening) &&
        [0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className={`pointer-events-none absolute left-1/2 top-[110px] h-[160px] w-[160px]
              -translate-x-1/2 -translate-y-1/2 rounded-full border sm:top-[130px]
              sm:h-[210px] sm:w-[210px] ${
                isSpeaking ? "border-[#7ee0b8]/40" : "border-[#8fb0ff]/40"
              }`}
            initial={{ scale: 0.85, opacity: 0.55 }}
            animate={{ scale: 1.55, opacity: 0 }}
            transition={{
              duration: isSpeaking ? 1.8 : 2.2,
              repeat: Infinity,
              delay: i * 0.55,
              ease: "easeOut",
            }}
          />
        ))}

      <motion.button
        type="button"
        disabled={disabled}
        aria-label={caption}
        aria-pressed={passive ? undefined : listening}
        className="relative z-10 h-[160px] w-[160px] cursor-pointer touch-manipulation
          rounded-full border-0 outline-none focus-visible:ring-2
          focus-visible:ring-[#638cff]/60 focus-visible:ring-offset-2
          focus-visible:ring-offset-[#0A0A0A] disabled:cursor-not-allowed
          disabled:opacity-50 sm:h-[200px] sm:w-[200px] lg:h-[220px] lg:w-[220px]"
        style={{
          background: listening
            ? "radial-gradient(circle at 35% 30%, #9dbcff 0%, #4f7dff 30%, #1d2440 64%, #0c0c14 100%)"
            : "radial-gradient(circle at 35% 30%, #6b9bff 0%, #3d6ef5 28%, #1a1a2e 62%, #0c0c14 100%)",
          boxShadow: isListening
            ? "0 0 80px rgba(99,140,255,0.7), inset 0 0 40px rgba(255,255,255,0.08)"
            : isSpeaking
              ? "0 0 70px rgba(126,224,184,0.55), inset 0 0 40px rgba(255,255,255,0.06)"
              : "0 0 48px rgba(61,110,245,0.4), inset 0 0 36px rgba(255,255,255,0.05)",
        }}
        animate={{
          scale: isListening ? 1.06 : isProcessing ? [1, 1.03, 1] : 1,
        }}
        transition={
          isProcessing
            ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
            : { type: "spring", stiffness: 320, damping: 22 }
        }
        whileTap={disabled ? undefined : { scale: 0.96 }}
        onClick={() => {
          if (!disabled) onToggle();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Idle pulse ring */}
        {state === "idle" && (
          <motion.span
            className="pointer-events-none absolute inset-3 rounded-full border border-white/10"
            animate={{ opacity: [0.25, 0.55, 0.25], scale: [0.96, 1.02, 0.96] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        {/* Stop glyph while capturing (tap-to-talk only) */}
        {listening && !passive && (
          <motion.span
            className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2
              -translate-y-1/2 rounded-[7px] bg-white/85 sm:h-7 sm:w-7"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: [0.7, 1, 0.7], scale: 1 }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        <span className="sr-only">{caption}</span>
      </motion.button>

      <p className="text-[13px] tracking-[0.14em] text-zinc-400 sm:text-sm">
        {caption}
      </p>
    </div>
  );
}
