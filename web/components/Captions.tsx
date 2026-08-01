"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { OrbState } from "@/lib/protocol";

type Props = {
  state: OrbState;
  /** Latest assistant turn text, streamed/accumulated by EchoApp. */
  text: string;
  /** Soft hint shown when there is nothing to caption. */
  idleHint: string;
};

/** Split into sentences so we can highlight the one being spoken. */
function sentences(text: string): string[] {
  const parts = text.match(/[^.!?…]+[.!?…]+["')\]]*|[^.!?…]+$/g);
  return (parts ?? [text]).map((s) => s.trim()).filter(Boolean);
}

export function Captions({ state, text, idleHint }: Props) {
  const trimmed = text.trim();
  const isThinking = state === "processing" && !trimmed;
  const lines = trimmed ? sentences(trimmed) : [];
  // Show the tail of the turn: the current sentence plus a little lead-in.
  const current = lines.length ? lines[lines.length - 1] : "";
  const previous = lines.length > 1 ? lines[lines.length - 2] : "";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4
        pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] sm:px-6
        sm:pb-[calc(env(safe-area-inset-bottom,0px)+6.5rem)]"
      aria-live="polite"
      aria-atomic="false"
    >
      <div className="w-full max-w-[34rem] text-center sm:max-w-2xl">
        <AnimatePresence mode="wait" initial={false}>
          {isThinking ? (
            <motion.div
              key="thinking"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
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
          ) : current ? (
            <motion.div
              key="caption"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="rounded-2xl bg-black/45 px-4 py-3 backdrop-blur-md
                supports-[backdrop-filter]:bg-black/30 sm:px-6 sm:py-4"
            >
              {previous && (
                <p className="mb-1 line-clamp-1 text-[13px] leading-snug text-zinc-400 sm:text-sm">
                  {previous}
                </p>
              )}
              <p
                className="text-balance text-[19px] font-medium leading-snug tracking-[-0.01em]
                  text-white drop-shadow-[0_1px_12px_rgba(0,0,0,0.65)] sm:text-2xl sm:leading-relaxed"
              >
                {current}
              </p>
            </motion.div>
          ) : (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
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
