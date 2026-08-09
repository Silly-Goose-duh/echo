"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { OrbState } from "@/lib/protocol";

type Props = {
  state: OrbState;
  /** Current sentence being spoken (must match audio). */
  text: string;
  idleHint: string;
};

/** Bottom captions: show exactly the line that is playing. */
export function Captions({ state, text, idleHint }: Props) {
  const trimmed = text.trim();
  const isThinking = state === "processing" && !trimmed;
  const isSpeaking = state === "speaking" && !!trimmed;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4
        pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] sm:px-6
        sm:pb-[calc(env(safe-area-inset-bottom,0px)+6.5rem)]"
      aria-live="polite"
    >
      <div className="w-full max-w-[34rem] text-center sm:max-w-2xl">
        <AnimatePresence mode="wait" initial={false}>
          {isThinking ? (
            <motion.div
              key="thinking"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-center justify-center gap-1.5 py-2"
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="echo-dot h-1.5 w-1.5 rounded-full bg-[#8fb0ff]"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </motion.div>
          ) : isSpeaking ? (
            <motion.div
              key={trimmed}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl bg-black/50 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4"
            >
              <p
                className="text-balance text-[18px] font-medium leading-snug text-white
                  drop-shadow-[0_1px_12px_rgba(0,0,0,0.65)] sm:text-2xl sm:leading-relaxed"
              >
                {trimmed}
              </p>
            </motion.div>
          ) : (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-balance px-2 text-[15px] leading-relaxed text-zinc-500 sm:text-base"
            >
              {idleHint}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
