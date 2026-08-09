"use client";

import { motion } from "framer-motion";

type Props = {
  onAccept: () => void;
};

export function Onboarding({ onAccept }: Props) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#07080c] px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <div className="glass rounded-3xl p-6 sm:p-8">
          <p className="text-[11px] font-medium tracking-[0.34em] text-zinc-400">
            ECHO
          </p>
          <h1 className="mt-3 text-2xl font-medium tracking-tight text-zinc-100 sm:text-3xl">
            Someone to talk to
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">
            Echo listens and supports you like a therapist would — with simple
            words and short replies. Not a licensed therapist, doctor, or crisis
            service.
          </p>

          <div className="mt-6 space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 text-[13px] leading-relaxed text-zinc-500">
            <p>
              <span className="text-zinc-300">Crisis (India):</span> Tele-MANAS{" "}
              <span className="text-zinc-200">14416</span> · iCall{" "}
              <span className="text-zinc-200">9152987821</span> · Vandrevala{" "}
              <span className="text-zinc-200">9999666555</span>
            </p>
            <p>Tap the orb once to begin voice. Chat anytime via the blue button.</p>
          </div>

          <button
            type="button"
            onClick={onAccept}
            className="glass-fab mt-8 w-full rounded-full px-5 py-3.5 text-sm font-medium
              text-white transition hover:brightness-110 active:scale-[0.98]"
          >
            I understand — continue
          </button>
        </div>
      </motion.div>
    </div>
  );
}
