"use client";

import { motion } from "framer-motion";
import type { OrbState } from "@/lib/protocol";

type Props = {
  state: OrbState;
  /** Live mic levels 0–1 while listening (optional). */
  levels?: number[];
};

const BAR_COUNT = 28;

export function Waveform({ state, levels }: Props) {
  const active = state === "listening" || state === "speaking";
  const bars =
    levels && levels.length >= BAR_COUNT
      ? levels.slice(0, BAR_COUNT)
      : Array.from({ length: BAR_COUNT }, (_, i) => {
          if (!active) return 0.12;
          // Deterministic pseudo-animation seed by index
          const t = (i / BAR_COUNT) * Math.PI;
          return 0.2 + Math.abs(Math.sin(t * 2.2)) * 0.55;
        });

  return (
    <div
      className="flex h-10 w-full max-w-xs items-end justify-center gap-[3px]"
      aria-hidden
    >
      {bars.map((level, i) => {
        const h = Math.max(0.1, Math.min(1, level));
        return (
          <motion.span
            key={i}
            className="w-[3px] rounded-full origin-bottom"
            style={{
              background:
                state === "speaking"
                  ? "linear-gradient(to top, #3d8f6e, #7ee0b8)"
                  : state === "listening"
                    ? "linear-gradient(to top, #3d6ef5, #9bb8ff)"
                    : "rgba(255,255,255,0.12)",
            }}
            animate={{
              height: `${8 + h * 28}px`,
              opacity: active ? 0.85 + h * 0.15 : 0.35,
            }}
            transition={
              active
                ? {
                    duration: 0.18 + (i % 5) * 0.03,
                    repeat: levels ? 0 : Infinity,
                    repeatType: "mirror",
                    ease: "easeInOut",
                    delay: levels ? 0 : (i % 7) * 0.04,
                  }
                : { duration: 0.3 }
            }
          />
        );
      })}
    </div>
  );
}
