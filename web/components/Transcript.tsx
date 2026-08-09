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
            <div className="glass max-h-[45vh] overflow-y-auto rounded-[1.35rem] px-4 py-3 text-[13px] leading-relaxed sm:max-h-64">
              {count === 0 ? (
                <p className="text-[var(--foreground-faint)]">
                  Nothing yet. Tap once to begin.
                </p>
              ) : (
                <ul className="space-y-3">
                  {entries.map((e) => (
                    <li key={e.id} className="break-words">
                      <span
                        className={
                          e.role === "user"
                            ? "text-[var(--accent-soft)]"
                            : e.role === "assistant"
                              ? "text-[#e8c49a]"
                              : "text-[var(--foreground-faint)]"
                        }
                      >
                        {e.role === "user"
                          ? "You"
                          : e.role === "assistant"
                            ? "sheleftme"
                            : "System"}
                      </span>
                      {e.meta && (
                        <span className="ml-2 text-[11px] text-[var(--foreground-faint)]">
                          {e.meta}
                        </span>
                      )}
                      <p className="mt-0.5 text-[#f3eee6]/95">{e.text}</p>
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
          text-xs tracking-wide text-[var(--foreground-muted)] transition
          hover:text-[#f3eee6] active:scale-95 sm:px-5"
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
          <span className="rounded-full bg-[rgba(255,246,232,0.08)] px-1.5 py-0.5 text-[10px] text-[var(--foreground-muted)]">
            {count}
          </span>
        )}
      </button>
    </div>
  );
}
