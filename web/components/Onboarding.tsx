"use client";

import { motion } from "framer-motion";

type Props = {
  onAccept: () => void;
};

export function Onboarding({ onAccept }: Props) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0A0A0A] px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <p className="text-[11px] font-medium tracking-[0.34em] text-zinc-400">
          ECHO
        </p>
        <h1 className="mt-3 text-2xl font-medium tracking-tight text-zinc-100 sm:text-3xl">
          Someone to talk to
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-zinc-400">
          Echo listens and supports you like a therapist would — with simple
          words and short replies. Echo is not a licensed therapist, doctor, or
          crisis service, and does not diagnose.
        </p>

        <div className="mt-6 space-y-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-[13px] leading-relaxed text-zinc-500">
          <p>
            <span className="text-zinc-300">If you&apos;re in crisis (India):</span>{" "}
            Tele-MANAS <span className="text-zinc-200">14416</span> · iCall{" "}
            <span className="text-zinc-200">9152987821</span> · Vandrevala{" "}
            <span className="text-zinc-200">9999666555</span>
          </p>
          <p>Use Voice or Chat. You can switch anytime.</p>
        </div>

        <button
          type="button"
          onClick={onAccept}
          className="mt-8 w-full rounded-full bg-[#3d6ef5] px-5 py-3.5 text-sm font-medium
            text-white shadow-[0_0_40px_rgba(61,110,245,0.35)] transition
            hover:bg-[#4f7dff] active:scale-[0.98]"
        >
          I understand — continue
        </button>
      </motion.div>
    </div>
  );
}
