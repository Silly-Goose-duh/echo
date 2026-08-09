"use client";

import { AnimatePresence, motion } from "framer-motion";

type Props = {
  active: boolean;
  /** Live 0–1 levels (mic or playback). Softly modulates bloom intensity. */
  levels?: number[];
};

/**
 * Full-screen warm ambient field while speaking —
 * soft drifting blooms, not sci-fi bar waveforms.
 */
export function SpeakingWaves({ active, levels }: Props) {
  const energy =
    levels && levels.length
      ? Math.min(
          1,
          levels.reduce((a, b) => a + b, 0) / levels.length / 0.45,
        )
      : 0.55;

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="speaking-waves"
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.65, ease: "easeInOut" }}
        >
          {/* Warm dusk wash */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 95% 75% at 50% 48%, rgba(120,78,42,0.32) 0%, rgba(40,30,22,0.5) 48%, rgba(16,14,12,0.92) 100%)",
            }}
          />

          {/* Ember core behind presence */}
          <div
            className="echo-aura absolute left-1/2 top-[44%] h-[95vmin] w-[95vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: `radial-gradient(circle, rgba(224,180,138,${0.28 + energy * 0.22}) 0%, rgba(176,122,69,0.14) 38%, transparent 68%)`,
            }}
          />

          {/* Soft drifting blooms */}
          <div
            className="echo-drift absolute left-[8%] top-[28%] h-[42vmin] w-[42vmin] rounded-full opacity-70"
            style={{
              background:
                "radial-gradient(circle, rgba(212,160,106,0.2) 0%, transparent 70%)",
              filter: "blur(8px)",
            }}
          />
          <div
            className="echo-drift absolute right-[6%] top-[40%] h-[36vmin] w-[36vmin] rounded-full opacity-60"
            style={{
              background:
                "radial-gradient(circle, rgba(160,110,90,0.18) 0%, transparent 70%)",
              filter: "blur(10px)",
              animationDelay: "-7s",
            }}
          />
          <div
            className="echo-ember absolute bottom-[18%] left-1/2 h-[28vmin] w-[70vmin] -translate-x-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(ellipse, rgba(212,160,106,0.16) 0%, transparent 70%)",
            }}
          />

          {/* Gentle horizontal shimmer band */}
          <div
            data-echo-wave
            className="absolute inset-x-0 top-[52%] h-32 -translate-y-1/2 opacity-40"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(232,196,154,0.12), transparent)",
              animation: "echo-wave-x 22s linear infinite",
              maskImage:
                "linear-gradient(to right, transparent, black 20%, black 80%, transparent)",
            }}
          />

          {/* Legibility veil */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(16,14,12,0.55) 0%, rgba(16,14,12,0.08) 30%, rgba(16,14,12,0.06) 58%, rgba(16,14,12,0.55) 100%)",
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
