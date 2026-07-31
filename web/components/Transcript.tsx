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
    <div className="w-full max-w-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-white/[0.06]
          bg-white/[0.03] px-4 py-3 text-left text-sm text-zinc-300
          transition hover:bg-white/[0.05]"
      >
        <span className="tracking-wide">
          Transcript
          {count > 0 && (
            <span className="ml-2 text-zinc-500">({count})</span>
          )}
        </span>
        <span className="text-zinc-500">{open ? "▾" : "▸"}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="drawer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div
              className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-white/[0.06]
                bg-[#111] px-4 py-3 text-[13px] leading-relaxed"
            >
              {count === 0 ? (
                <p className="text-zinc-500">No turns yet. Hold the orb to talk.</p>
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
    </div>
  );
}
