"use client";

import { motion } from "framer-motion";

type Props = {
  onAccept: () => void;
};

export function Onboarding({ onAccept }: Props) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-12">
      {/* Soft background blooms */}
      <div
        className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full opacity-50 echo-drift"
        style={{
          background:
            "radial-gradient(circle, rgba(212,160,106,0.22) 0%, transparent 70%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-24 h-80 w-80 rounded-full opacity-40 echo-drift"
        style={{
          background:
            "radial-gradient(circle, rgba(120,90,70,0.25) 0%, transparent 70%)",
          animationDelay: "-6s",
        }}
        aria-hidden
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
      >
        <div className="glass rounded-[1.75rem] p-7 sm:p-9">
          <div className="flex items-center gap-3">
            <span
              className="h-9 w-9 shrink-0 rounded-full"
              style={{
                background:
                  "radial-gradient(circle at 40% 35%, #f0dcc0 0%, #d4a06a 40%, #6a4a30 100%)",
                boxShadow: "0 0 24px rgba(212,160,106,0.4)",
              }}
              aria-hidden
            />
            <p className="brand-wordmark text-lg tracking-tight text-[#f3eee6]">
              sheleftme
            </p>
          </div>

          <h1 className="brand-wordmark mt-6 text-[1.85rem] leading-tight tracking-tight text-[#f5f0e8] sm:text-[2.15rem]">
            Someone to talk to
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[var(--foreground-muted)]">
            A quiet place to speak or write — short replies, simple words. Not a
            licensed therapist, doctor, or crisis service.
          </p>

          <div className="mt-6 space-y-3 rounded-2xl border border-[rgba(255,236,210,0.08)] bg-[rgba(255,246,232,0.03)] p-4 text-[13px] leading-relaxed text-[var(--foreground-faint)]">
            <p>
              <span className="text-[var(--foreground-muted)]">Crisis (India):</span>{" "}
              Tele-MANAS{" "}
              <span className="text-[#e8c49a]">14416</span> · iCall{" "}
              <span className="text-[#e8c49a]">9152987821</span> · Vandrevala{" "}
              <span className="text-[#e8c49a]">9999666555</span>
            </p>
            <p>
              Tap once to begin voice. Switch to chat anytime with the button in
              the corner.
            </p>
          </div>

          <button
            type="button"
            onClick={onAccept}
            className="glass-fab mt-8 w-full rounded-full px-5 py-3.5 text-sm font-medium
              transition hover:brightness-110 active:scale-[0.98]"
          >
            I understand — continue
          </button>
        </div>
      </motion.div>
    </div>
  );
}
