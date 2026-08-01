"use client";

import { AnimatePresence, motion } from "framer-motion";
import { VOICES, voiceLabel } from "@/lib/voices";

type Props = {
  open: boolean;
  onToggleOpen: () => void;
  voice: string;
  onVoiceChange: (voice: string) => void;
  openMic: boolean;
  onOpenMicChange: (on: boolean) => void;
  micLabel: string;
  micActive: boolean;
  disabled?: boolean;
};

export function SettingsPanel({
  open,
  onToggleOpen,
  voice,
  onVoiceChange,
  openMic,
  onOpenMicChange,
  micLabel,
  micActive,
  disabled,
}: Props) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-black/40
          px-3.5 py-2 text-[11px] tracking-wide text-zinc-400 backdrop-blur-md transition
          hover:border-white/20 hover:text-zinc-200 active:scale-95 sm:px-4"
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
            micActive ? "bg-[#638cff]" : "bg-white/20"
          }`}
          aria-hidden
        />
        <span className="max-w-[9rem] truncate">
          {voiceLabel(voice)}
          {openMic ? " · open mic" : ""}
        </span>
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-zinc-600"
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute right-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))]"
          >
            <div
              className="rounded-2xl border border-white/[0.07] bg-black/75 p-4
                backdrop-blur-xl"
            >
              <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                Voice
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {VOICES.map((v) => {
                  const selected = v.id === voice;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => onVoiceChange(v.id)}
                      className={`rounded-lg px-2.5 py-2.5 text-left transition disabled:opacity-40
                        ${
                          selected
                            ? "bg-[#3d6ef5]/15 text-zinc-100 ring-1 ring-[#638cff]/50"
                            : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                        }`}
                    >
                      <span className="block text-xs">{v.label}</span>
                      <span className="block text-[10px] text-zinc-600">
                        {v.hint}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 border-t border-white/[0.06] pt-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={openMic}
                  disabled={disabled}
                  onClick={() => onOpenMicChange(!openMic)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg
                    px-1 py-2 text-left transition disabled:opacity-40
                    hover:text-zinc-200"
                >
                  <span>
                    <span className="block text-xs text-zinc-300">
                      Open mic (VAD)
                    </span>
                    <span className="block text-[10px] text-zinc-600">
                      {openMic
                        ? "auto-detects end of speech"
                        : "tap the orb to talk"}
                    </span>
                  </span>
                  <span
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                      openMic ? "bg-[#3d6ef5]" : "bg-white/10"
                    }`}
                    aria-hidden
                  >
                    <motion.span
                      className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow"
                      animate={{ left: openMic ? 18 : 2 }}
                      transition={{ type: "spring", stiffness: 500, damping: 32 }}
                    />
                  </span>
                </button>
                <p className="mt-2 text-[10px] text-zinc-600">mic: {micLabel}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
