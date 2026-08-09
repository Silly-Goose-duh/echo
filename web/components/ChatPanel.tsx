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
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pb-4 pt-2">
        {chatEntries.length === 0 && !streaming && (
          <div className="px-2 py-10 text-center">
            <p className="text-sm text-zinc-500">
              Write like you would to a steady friend.
            </p>
            <p className="mt-2 text-xs text-zinc-600">
              Meaning, choice, loneliness, anxiety — whatever is sitting with
              you.
            </p>
          </div>
        )}

        {chatEntries.map((e) => (
          <div
            key={e.id}
            className={`flex ${e.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed sm:max-w-[80%] ${
                e.role === "user"
                  ? "rounded-br-md bg-[#3d6ef5] text-white"
                  : e.meta === "crisis"
                    ? "rounded-bl-md border border-amber-500/30 bg-amber-500/10 text-amber-50"
                    : "rounded-bl-md border border-white/[0.06] bg-white/[0.05] text-zinc-100"
              }`}
            >
              <p className="whitespace-pre-wrap">{e.text}</p>
            </div>
          </div>
        ))}

        {streaming ? (
          <div className="flex justify-start">
            <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-white/[0.06] bg-white/[0.05] px-4 py-2.5 text-[15px] leading-relaxed text-zinc-100 sm:max-w-[80%]">
              <p className="whitespace-pre-wrap">{streaming}</p>
              <span className="mt-1 inline-block h-3 w-1.5 animate-pulse bg-[#638cff]/80" />
            </div>
          </div>
        ) : null}

        {busy && !streaming ? (
          <div className="flex justify-start px-2">
            <div className="flex gap-1 py-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="echo-dot h-1.5 w-1.5 rounded-full bg-[#8fb0ff]"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-white/[0.06] pt-3">
        <div className="flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-black/40 p-2 backdrop-blur-md">
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            disabled={disabled || busy}
            placeholder={
              disabled ? "Connecting…" : busy ? "Echo is writing…" : "Message Echo…"
            }
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5
              text-[15px] text-zinc-100 outline-none placeholder:text-zinc-600
              disabled:opacity-50"
          />
          <button
            type="button"
            disabled={disabled || busy || !draft.trim()}
            onClick={submit}
            className="mb-0.5 shrink-0 rounded-xl bg-[#3d6ef5] px-4 py-2.5 text-sm
              font-medium text-white transition hover:bg-[#4f7dff]
              disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
          >
            Send
          </button>
        </div>
        <p className="mt-2 px-1 text-center text-[10px] tracking-wide text-zinc-600">
          Enter to send · Shift+Enter for newline · not a substitute for therapy
        </p>
      </div>
    </div>
  );
}
