"use client";

import { motion } from "framer-motion";
import type { OrbState } from "@/lib/protocol";

type Props = {
  state: OrbState;
  /** Live mic levels 0–1 while listening (optional). */
  levels?: number[];
};

const BAR_COUNT = 24;

/** Compact warm level meter under the presence. */
export function Waveform({ state, levels }: Props) {
  const active = state === "listening" || state === "speaking";
  const bars =
    levels && levels.length >= BAR_COUNT
      ? levels.slice(0, BAR_COUNT)
      : Array.from({ length: BAR_COUNT }, (_, i) => {
          if (!active) return 0.1;
          const t = (i / BAR_COUNT) * Math.PI;
          return 0.18 + Math.abs(Math.sin(t * 2.2)) * 0.5;
        });

  return (
    <div
      className="flex h-7 w-full max-w-[13rem] items-end justify-center gap-[3px]
        opacity-90 sm:h-8 sm:max-w-[15rem]"
      aria-hidden
    >
      {bars.map((level, i) => {
        const h = Math.max(0.08, Math.min(1, level));
        return (
          <motion.span
            key={i}
            className="w-[2.5px] origin-bottom rounded-full sm:w-[3px]"
            style={{
              background:
                state === "speaking"
                  ? "linear-gradient(to top, rgba(176,122,69,0.45), #e8c49a)"
                  : state === "listening"
                    ? "linear-gradient(to top, rgba(160,140,110,0.4), #d4c4a8)"
                    : "rgba(255,246,232,0.1)",
            }}
            animate={{
              height: `${6 + h * 20}px`,
              opacity: active ? 0.8 + h * 0.2 : 0.3,
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
