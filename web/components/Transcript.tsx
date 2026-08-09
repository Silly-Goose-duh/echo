"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TranscriptEntry } from "@/lib/protocol";

type Props = {
  entries: TranscriptEntry[];
};

export function Transcript({ entries }: Props) {
  const [open, setOpen] = useState(false);
  const count = entries.length;

  return (
    <div className="relative min-w-0 flex-1">
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="drawer"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-full left-0 mb-2 w-[min(24rem,calc(100vw-2rem))]"
          >
            <div className="glass max-h-[45vh] overflow-y-auto rounded-2xl px-4 py-3 text-[13px] leading-relaxed sm:max-h-64">
              {count === 0 ? (
                <p className="text-zinc-500">
                  Nothing yet. Tap the orb once to begin.
                </p>
              ) : (
                <ul className="space-y-3">
                  {entries.map((e) => (
                    <li key={e.id} className="break-words">
                      <span
                        className={
                          e.role === "user"
                            ? "text-[#9bb8ff]"
                            : e.role === "assistant"
                              ? "text-[#7ee0b8]"
                              : "text-zinc-500"
                        }
                      >
                        {e.role === "user"
                          ? "You"
                          : e.role === "assistant"
                            ? "Echo"
                            : "System"}
                      </span>
                      {e.meta && (
                        <span className="ml-2 text-[11px] text-zinc-600">
                          {e.meta}
                        </span>
                      )}
                      <p className="mt-0.5 text-zinc-200/95">{e.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="glass-soft flex max-w-full items-center gap-2 rounded-full px-4 py-2.5
          text-xs tracking-wide text-zinc-400 transition hover:text-zinc-200 active:scale-95 sm:px-5"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M5 6h14M5 12h10M5 18h12"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
        <span className="truncate">Transcript</span>
        {count > 0 && (
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400">
            {count}
          </span>
        )}
      </button>
    </div>
  );
}
