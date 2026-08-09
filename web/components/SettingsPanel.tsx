"use client";

import { AnimatePresence, motion } from "framer-motion";
import { voiceLabel } from "@/lib/voices";

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
  sessionStarted?: boolean;
};

export function SettingsPanel({
  open,
  onToggleOpen,
  voice,
  onVoiceChange: _onVoiceChange,
  openMic,
  onOpenMicChange,
  micLabel,
  micActive,
  disabled,
  sessionStarted,
}: Props) {
  // Multi-voice picker removed — single fixed warm voice (Fish S2-Pro / Kokoro).
  void _onVoiceChange;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-label="Settings"
        className="glass-soft flex h-10 w-10 items-center justify-center rounded-full
          text-zinc-300 transition hover:text-white active:scale-95"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12 3.5v2.2M12 18.3V20.5M4.9 6.5l1.6 1.6M17.5 15.9l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.9 17.5l1.6-1.6M17.5 8.1l1.6-1.6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        {micActive && (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#7ee0b8] shadow-[0_0_8px_rgba(126,224,184,0.8)]" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))]"
          >
            <div className="glass rounded-2xl p-4">
              <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                Voice
              </p>
              <div className="rounded-xl bg-[rgba(212,160,106,0.12)] px-3 py-2.5 ring-1 ring-[rgba(212,160,106,0.28)]">
                <span className="block text-xs text-zinc-100">
                  {voiceLabel(voice)}
                </span>
                <span className="block text-[10px] text-zinc-500">
                  single warm voice · server-fixed
                </span>
              </div>

              <div className="mt-4 border-t border-white/[0.06] pt-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={openMic}
                  disabled={disabled || !sessionStarted}
                  onClick={() => onOpenMicChange(!openMic)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl
                    px-1 py-2 text-left transition disabled:opacity-40 hover:text-zinc-200"
                >
                  <span>
                    <span className="block text-xs text-zinc-300">
                      Open mic (VAD)
                    </span>
                    <span className="block text-[10px] text-zinc-600">
                      {!sessionStarted
                        ? "tap the orb once to begin"
                        : openMic
                          ? "auto-detects when you finish"
                          : "tap the orb to talk"}
                    </span>
                  </span>
                  <span
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                      openMic ? "bg-[#d4a06a]" : "bg-white/10"
                    }`}
                    aria-hidden
                  >
                    <motion.span
                      className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow"
                      animate={{ left: openMic ? 18 : 2 }}
                      transition={{ type: "spring", stiffness: 420, damping: 30 }}
                    />
                  </span>
                </button>
                <p className="mt-2 text-[10px] text-zinc-600">
                  {voiceLabel(voice)} · mic: {micLabel}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
