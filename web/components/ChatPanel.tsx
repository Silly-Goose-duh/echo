"use client";

import { useEffect, useRef, useState } from "react";
import type { TranscriptEntry } from "@/lib/protocol";

type Props = {
  entries: TranscriptEntry[];
  streaming?: string;
  busy?: boolean;
  disabled?: boolean;
  onSend: (text: string) => void;
};

export function ChatPanel({
  entries,
  streaming,
  busy,
  disabled,
  onSend,
}: Props) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries, streaming]);

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  const submit = () => {
    const t = draft.trim();
    if (!t || busy || disabled) return;
    setDraft("");
    onSend(t);
  };

  const chatEntries = entries.filter((e) => e.role !== "system");

  return (
    <div className="flex h-full min-h-0 w-full max-w-2xl flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-1 pb-4 pt-3">
        {chatEntries.length === 0 && !streaming && (
          <div className="flex flex-col items-center px-4 py-14 text-center">
            <div
              className="mb-5 h-12 w-12 rounded-full"
              style={{
                background:
                  "radial-gradient(circle at 40% 35%, #e8c49a 0%, #b07a45 55%, #2a2218 100%)",
                boxShadow: "0 0 32px rgba(176,122,69,0.35)",
              }}
              aria-hidden
            />
            <p className="brand-wordmark text-lg text-[#f3eee6]/95">
              Write like you would to a steady friend.
            </p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--foreground-faint)]">
              Whatever is on your mind — keep it simple.
            </p>
          </div>
        )}

        {chatEntries.map((e) => (
          <div
            key={e.id}
            className={`flex ${e.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[88%] rounded-[1.25rem] px-4 py-2.5 text-[15px] leading-relaxed sm:max-w-[80%] ${
                e.role === "user"
                  ? "rounded-br-md text-[#1a120c] shadow-[0_10px_28px_rgba(176,122,69,0.22)]"
                  : e.meta === "crisis"
                    ? "surface-paper rounded-bl-md border border-[rgba(232,160,144,0.28)] text-[#f5e8e4]"
                    : "surface-paper rounded-bl-md text-[#f3eee6]"
              }`}
              style={
                e.role === "user"
                  ? { background: "var(--surface-chat-user)" }
                  : undefined
              }
            >
              <p className="whitespace-pre-wrap">{e.text}</p>
            </div>
          </div>
        ))}

        {streaming ? (
          <div className="flex justify-start">
            <div className="surface-paper max-w-[88%] rounded-[1.25rem] rounded-bl-md px-4 py-2.5 text-[15px] leading-relaxed text-[#f3eee6] sm:max-w-[80%]">
              <p className="whitespace-pre-wrap">{streaming}</p>
              <span className="mt-1 inline-block h-3 w-1.5 animate-pulse rounded-sm bg-[var(--accent)]/80" />
            </div>
          </div>
        ) : null}

        {busy && !streaming ? (
          <div className="flex justify-start px-2">
            <div className="flex gap-1.5 py-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="echo-dot h-1.5 w-1.5 rounded-full bg-[var(--accent-soft)]"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 pt-2">
        <div className="glass flex items-end gap-2 rounded-[1.35rem] p-2">
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            disabled={disabled || busy}
            placeholder={
              disabled ? "Connecting…" : busy ? "Writing…" : "Say something…"
            }
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5
              text-[15px] text-[#f3eee6] outline-none placeholder:text-[var(--foreground-faint)]
              disabled:opacity-50"
          />
          <button
            type="button"
            disabled={disabled || busy || !draft.trim()}
            onClick={submit}
            aria-label="Send"
            className="glass-fab mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center
              rounded-xl transition hover:brightness-110 disabled:cursor-not-allowed
              disabled:opacity-35 active:scale-95"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 12h14M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <p className="mt-2.5 px-1 text-center text-[10px] tracking-wide text-[var(--foreground-faint)]">
          Enter to send · Shift+Enter for newline · not a substitute for therapy
        </p>
      </div>
    </div>
  );
}
