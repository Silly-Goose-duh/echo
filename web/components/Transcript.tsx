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
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="absolute bottom-full left-0 mb-2 w-[min(24rem,calc(100vw-2rem))]"
          >
            <div
              className="max-h-[45vh] overflow-y-auto rounded-2xl border border-white/[0.07]
                bg-black/75 px-4 py-3 text-[13px] leading-relaxed backdrop-blur-xl
                sm:max-h-64"
            >
              {count === 0 ? (
                <p className="text-zinc-500">
                  Nothing yet. Tap the orb whenever you&apos;re ready.
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
                      <p className="mt-0.5 text-zinc-200">{e.text}</p>
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
        className="flex max-w-full items-center gap-2 rounded-full border border-white/[0.08]
          bg-black/40 px-4 py-2.5 text-xs tracking-wide text-zinc-400 backdrop-blur-md
          transition hover:border-white/20 hover:text-zinc-200 active:scale-95 sm:px-5"
      >
        <span className="truncate">Transcript</span>
        {count > 0 && <span className="text-zinc-600">{count}</span>}
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 0 : 180 }}
          transition={{ duration: 0.2 }}
          className="text-zinc-600"
        >
          ▾
        </motion.span>
      </button>
    </div>
  );
}
