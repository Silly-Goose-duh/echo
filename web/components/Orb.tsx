"use client";

import { motion } from "framer-motion";
import type { OrbState } from "@/lib/protocol";

type Props = {
  state: OrbState;
  onPressStart: () => void;
  onPressEnd: () => void;
  disabled?: boolean;
  /** Override the idle caption (e.g. when open-mic/VAD is on). */
  idleLabel?: string;
};

const labels: Record<OrbState, string> = {
  idle: "hold to talk",
  listening: "listening…",
  processing: "thinking…",
  speaking: "speaking",
};

export function Orb({
  state,
  onPressStart,
  onPressEnd,
  disabled,
  idleLabel,
}: Props) {
  const isListening = state === "listening";
  const isSpeaking = state === "speaking";
  const isProcessing = state === "processing";
  const caption =
    state === "idle" && idleLabel ? idleLabel : labels[state];

  return (
    <div className="relative flex flex-col items-center gap-6 select-none">
      {/* Soft ambient glow */}
      <motion.div
        className="pointer-events-none absolute rounded-full"
        style={{
          width: 280,
          height: 280,
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

      {/* Speaking ripples */}
      {isSpeaking &&
        [0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="pointer-events-none absolute rounded-full border border-[#7ee0b8]/40"
            style={{ width: 200, height: 200 }}
            initial={{ scale: 0.85, opacity: 0.55 }}
            animate={{ scale: 1.55, opacity: 0 }}
            transition={{
              duration: 1.8,
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
        className="relative z-10 h-[200px] w-[200px] rounded-full border-0 outline-none
          focus-visible:ring-2 focus-visible:ring-[#638cff]/60 focus-visible:ring-offset-2
          focus-visible:ring-offset-[#0A0A0A] disabled:cursor-not-allowed disabled:opacity-50
          touch-none cursor-pointer"
        style={{
          background:
            "radial-gradient(circle at 35% 30%, #6b9bff 0%, #3d6ef5 28%, #1a1a2e 62%, #0c0c14 100%)",
          boxShadow: isListening
            ? "0 0 80px rgba(99,140,255,0.7), inset 0 0 40px rgba(255,255,255,0.08)"
            : isSpeaking
              ? "0 0 70px rgba(126,224,184,0.55), inset 0 0 40px rgba(255,255,255,0.06)"
              : "0 0 48px rgba(61,110,245,0.4), inset 0 0 36px rgba(255,255,255,0.05)",
        }}
        animate={{
          scale: isListening ? 1.1 : isProcessing ? [1, 1.03, 1] : 1,
        }}
        transition={
          isProcessing
            ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
            : { type: "spring", stiffness: 320, damping: 22 }
        }
        onMouseDown={(e) => {
          e.preventDefault();
          if (!disabled) onPressStart();
        }}
        onMouseUp={() => onPressEnd()}
        onMouseLeave={() => onPressEnd()}
        onTouchStart={(e) => {
          e.preventDefault();
          if (!disabled) onPressStart();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          onPressEnd();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Inner idle pulse ring */}
        {state === "idle" && (
          <motion.span
            className="pointer-events-none absolute inset-3 rounded-full border border-white/10"
            animate={{ opacity: [0.25, 0.55, 0.25], scale: [0.96, 1.02, 0.96] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        <span className="sr-only">{caption}</span>
      </motion.button>

      <p className="text-sm tracking-wide text-zinc-400">{caption}</p>
    </div>
  );
}
