"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";

type Props = {
  active: boolean;
  /** Live 0–1 levels (mic or playback). Drives bar amplitude when speaking. */
  levels?: number[];
};

const BAR_COUNT = 48;

/**
 * Full-screen blue waveform field while Echo is speaking.
 * Uses live levels when available; otherwise a smooth synthetic pulse.
 */
export function SpeakingWaves({ active, levels }: Props) {
  const bars = useMemo(() => {
    if (levels && levels.length > 0) {
      // Resample incoming levels into BAR_COUNT slots
      const out: number[] = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        const src = Math.floor((i / BAR_COUNT) * levels.length);
        out.push(Math.max(0.08, Math.min(1, levels[src] ?? 0.12)));
      }
      return out;
    }
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      const t = (i / BAR_COUNT) * Math.PI * 2;
      return 0.18 + Math.abs(Math.sin(t * 1.7)) * 0.55;
    });
  }, [levels]);

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
          transition={{ duration: 0.55, ease: "easeInOut" }}
        >
          {/* Deep blue wash */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 90% 70% at 50% 55%, rgba(35,70,180,0.45) 0%, rgba(12,20,48,0.55) 45%, rgba(10,10,10,0.92) 100%)",
            }}
          />

          {/* Soft aura behind orb */}
          <div
            className="echo-aura absolute left-1/2 top-[42%] h-[120vmin] w-[120vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(61,110,245,0.5) 0%, rgba(99,140,255,0.18) 40%, transparent 70%)",
            }}
          />

          {/* Center mirrored waveform bars — the hero visual */}
          <div className="absolute inset-x-0 top-1/2 flex h-[42vh] -translate-y-1/2 items-center justify-center px-3 sm:px-10">
            <div className="flex h-full w-full max-w-5xl items-center justify-center gap-[2px] sm:gap-[3px]">
              {bars.map((level, i) => {
                const h = Math.max(0.1, Math.min(1, level));
                // Mirror energy: outer bars slightly quieter
                const edge = 1 - Math.abs(i - BAR_COUNT / 2) / (BAR_COUNT / 2);
                const amp = h * (0.45 + edge * 0.55);
                return (
                  <motion.span
                    key={i}
                    className="w-[3px] rounded-full sm:w-[4px]"
                    style={{
                      background:
                        "linear-gradient(to top, rgba(45,90,220,0.35), #3d6ef5 35%, #8fb0ff 70%, #b8d0ff)",
                      boxShadow: "0 0 12px rgba(99,140,255,0.35)",
                    }}
                    animate={{
                      height: `${12 + amp * 42}vh`,
                      opacity: 0.45 + amp * 0.55,
                    }}
                    transition={
                      levels
                        ? { duration: 0.08, ease: "easeOut" }
                        : {
                            duration: 0.9 + (i % 5) * 0.08,
                            repeat: Infinity,
                            repeatType: "mirror",
                            ease: "easeInOut",
                            delay: (i % 9) * 0.05,
                          }
                    }
                  />
                );
              })}
            </div>
          </div>

          {/* Soft horizontal wave ribbons at bottom */}
          <div
            className="absolute inset-x-0 bottom-0 h-[38%]"
            style={{
              background:
                "linear-gradient(to top, rgba(30,70,200,0.35), transparent)",
            }}
          />
          <div
            data-echo-wave
            className="absolute inset-x-0 bottom-[8%] h-24 opacity-70"
            style={{
              background:
                "repeating-linear-gradient(90deg, transparent 0 18px, rgba(126,224,184,0.08) 18px 20px)",
              animation: "echo-wave-x 18s linear infinite",
              maskImage:
                "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
            }}
          />

          {/* Legibility veil */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(10,10,10,0.55) 0%, rgba(10,10,10,0.08) 28%, rgba(10,10,10,0.05) 55%, rgba(10,10,10,0.5) 100%)",
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
