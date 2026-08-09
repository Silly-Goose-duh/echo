"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { OrbState } from "@/lib/protocol";

type Props = {
  state: OrbState;
  text: string;
  idleHint: string;
};

export function Captions({ state, text, idleHint }: Props) {
  const trimmed = text.trim();
  const isThinking = state === "processing" && !trimmed;
  const isSpeaking = state === "speaking" && !!trimmed;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-5
        pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] sm:px-8
        sm:pb-[calc(env(safe-area-inset-bottom,0px)+6.5rem)]"
      aria-live="polite"
    >
      <div className="w-full max-w-[32rem] text-center sm:max-w-xl">
        <AnimatePresence mode="wait" initial={false}>
          {isThinking ? (
            <motion.div
              key="thinking"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto flex w-fit items-center justify-center gap-1.5 rounded-full
                border border-[rgba(255,236,210,0.08)] bg-[rgba(22,18,14,0.45)] px-5 py-2.5
                backdrop-blur-md"
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="echo-dot h-1.5 w-1.5 rounded-full bg-[var(--accent-soft)]"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </motion.div>
          ) : isSpeaking ? (
            <motion.div
              key={trimmed}
              initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-[1.35rem] border border-[rgba(255,236,210,0.1)]
                bg-[rgba(22,18,14,0.55)] px-5 py-4 shadow-[0_16px_48px_rgba(0,0,0,0.35)]
                backdrop-blur-xl sm:px-7 sm:py-5"
            >
              <p
                className="brand-wordmark text-balance text-[1.2rem] font-medium leading-snug
                  text-[#f5f0e8] sm:text-[1.55rem] sm:leading-relaxed"
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
              transition={{ duration: 0.45 }}
              className="text-balance px-2 text-[15px] leading-relaxed text-[var(--foreground-faint)] sm:text-base"
            >
              {idleHint}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
