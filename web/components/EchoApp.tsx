"use client";

/**
 * sheleftme shell — late-night companion UI.
 * Visual redesign: warm ink neutrals + amber accent, soft lantern presence,
 * editorial captions, calm ambient field (not sci-fi blue orb).
 * Behavior preserved: first orb tap → session + VAD; FAB Chat↔Voice;
 * captions = currently playing audio sentence; audio/WS protocol unchanged.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Orb } from "@/components/Orb";
import { Transcript } from "@/components/Transcript";
import { SettingsPanel } from "@/components/SettingsPanel";
import { SpeakingWaves } from "@/components/SpeakingWaves";
import { Captions } from "@/components/Captions";
import { ChatPanel } from "@/components/ChatPanel";
import { Onboarding } from "@/components/Onboarding";
import { useEchoSocket } from "@/hooks/useEchoSocket";
import {
  floatTo16Base64,
  schedulePcm16Base64,
  drainPlayback,
  rmsLevel,
  base64Pcm16ToFloat32,
  bumpPlaybackGeneration,
} from "@/lib/audio";
import { createVad } from "@/lib/vad";
import {
  DEFAULT_VOICE,
  OPEN_MIC_STORAGE_KEY,
  VOICE_STORAGE_KEY,
} from "@/lib/voices";
import {
  AppMode,
  DEFAULT_WS_URL,
  DISCLAIMER_STORAGE_KEY,
  MODE_STORAGE_KEY,
  OrbState,
  ServerMessage,
  TranscriptEntry,
} from "@/lib/protocol";

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Chunks of pre-roll kept so we don't clip the first syllable. */
const PREROLL_CHUNKS = 2;

type MicPhase = "off" | "idle" | "armed" | "speech" | "error";

export function EchoApp() {
  const [ready, setReady] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [mode, setMode] = useState<AppMode>("voice");
  const modeRef = useRef<AppMode>("voice");

  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [levels, setLevels] = useState<number[]>([]);
  const [statusLabel, setStatusLabel] = useState("connecting…");
  const [error, setError] = useState<string | null>(null);
  /** Text of the assistant turn currently being spoken (live captions). */
  const [caption, setCaption] = useState("");
  const [chatStreaming, setChatStreaming] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  const [voice, setVoice] = useState<string>(DEFAULT_VOICE);
  // VAD starts only after the user taps once to begin the conversation.
  const [openMic, setOpenMic] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [micPhase, setMicPhase] = useState<MicPhase>("off");
  /** Tap-to-talk: true between the first tap and the second. */
  const [listening, setListening] = useState(false);

  const listeningRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const muteRef = useRef<GainNode | null>(null);
  const levelBufRef = useRef<number[]>(Array(28).fill(0.12));
  const playQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Barge-in support: generation counter invalidates queued playback, and
  // the active source node lets us cut off audio that is already playing.
  const playGenRef = useRef(0);
  const activeSrcRef = useRef<AudioBufferSourceNode | null>(null);

  // Open-mic / VAD state (refs — read inside the audio callback)
  const openMicRef = useRef(false);
  const voiceRef = useRef(DEFAULT_VOICE);
  const capturingRef = useRef(false);
  const speakingRef = useRef(false); // gate: assistant is talking / thinking
  const vadRef = useRef(
    createVad({ silenceMs: 750, minSpeechMs: 350, onLevel: 0.14, offLevel: 0.08 }),
  );
  const prerollRef = useRef<Float32Array[]>([]);

  const pushEntry = useCallback((entry: Omit<TranscriptEntry, "id" | "ts">) => {
    setEntries((prev) => [...prev, { ...entry, id: uid(), ts: Date.now() }]);
  }, []);

  /** Start of a new user turn — wipe the assistant captions. */
  const clearCaption = useCallback(() => setCaption(""), []);

  // Restore persisted preferences + disclaimer
  useEffect(() => {
    try {
      // Single fixed voice — ignore legacy multi-voice localStorage ids.
      setVoice(DEFAULT_VOICE);
      voiceRef.current = DEFAULT_VOICE;
      try {
        localStorage.setItem(VOICE_STORAGE_KEY, DEFAULT_VOICE);
      } catch {
        /* ignore */
      }
      const om = localStorage.getItem(OPEN_MIC_STORAGE_KEY);
      // Preference only applies after session start; default VAD on when they tap.
      if (om === "0") setOpenMic(false);
      else if (om === "1") setOpenMic(true);
      if (localStorage.getItem(DISCLAIMER_STORAGE_KEY) === "1") {
        setAccepted(true);
      }
      const m = localStorage.getItem(MODE_STORAGE_KEY);
      if (m === "chat" || m === "voice") {
        setMode(m);
        modeRef.current = m;
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const acceptDisclaimer = useCallback(() => {
    try {
      localStorage.setItem(DISCLAIMER_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setAccepted(true);
  }, []);

  const switchMode = useCallback((m: AppMode) => {
    modeRef.current = m;
    setMode(m);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
  }, []);

  const getAudioCtx = useCallback(async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext({ sampleRate: 16000 });
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const onMessage = useCallback(
    (msg: ServerMessage) => {
      if (msg.type === "ready") {
        setStatusLabel("ready");
        setError(null);
        speakingRef.current = false;
        if (!listeningRef.current) setOrbState("idle");
        return;
      }

      if (msg.type === "final_transcript") {
        const meta = [
          msg.stt_ms != null ? `${Math.round(msg.stt_ms)}ms` : null,
          msg.backend,
        ]
          .filter(Boolean)
          .join(" · ");
        pushEntry({ role: "user", text: msg.text || "(empty)", meta });
        setCaption("");
        setOrbState("processing");
        setStatusLabel("processing…");
        return;
      }

      if (msg.type === "assistant_text") {
        if (msg.final === false) {
          const piece = (msg.text || "").trim();
          if (piece && modeRef.current === "chat") {
            // Chat: stream text. Voice captions follow audio only (sync).
            setChatStreaming((prev) => {
              if (prev.endsWith(piece)) return prev;
              if (!prev) return piece;
              if (piece.includes("\n") || piece.length > 160) return piece;
              return `${prev} ${piece}`;
            });
          }
        } else {
          pushEntry({ role: "assistant", text: msg.text });
          if (modeRef.current === "chat") {
            setChatStreaming("");
          }
          setChatBusy(false);
        }
        return;
      }

      if (msg.type === "audio") {
        speakingRef.current = true;
        setOrbState("speaking");
        setStatusLabel("speaking…");
        const sr = msg.sr || 24000;
        const pcm = msg.pcm16;
        const chunkText = msg.text?.trim() ?? "";
        const gen = playGenRef.current;
        try {
          const f32 = base64Pcm16ToFloat32(pcm);
          const lvl = rmsLevel(f32);
          const next = levelBufRef.current.slice(1);
          next.push(Math.max(0.12, Math.min(1, lvl * 1.35)));
          levelBufRef.current = next;
          setLevels([...next]);
        } catch {
          /* ignore */
        }
        // Schedule immediately (do NOT wait for prior clip to finish playing).
        void schedulePcm16Base64(pcm, sr, (src) => {
          if (gen !== playGenRef.current) {
            try {
              src.stop();
            } catch {
              /* ok */
            }
            return;
          }
          activeSrcRef.current = src;
          if (chunkText) setCaption(chunkText);
        }).catch((e) => console.error("schedule failed", e));
        return;
      }

      if (msg.type === "interrupted") {
        playGenRef.current += 1;
        bumpPlaybackGeneration();
        try {
          activeSrcRef.current?.stop();
        } catch {
          /* already stopped */
        }
        activeSrcRef.current = null;
        playQueueRef.current = Promise.resolve();
        speakingRef.current = false;
        setCaption("");
        if (!listeningRef.current && !vadRef.current.speaking) {
          setOrbState("idle");
          setStatusLabel(openMicRef.current ? "listening for you…" : "ready");
        }
        if (openMicRef.current && capturingRef.current) setMicPhase("armed");
        return;
      }

      if (msg.type === "turn_end") {
        const m = msg.metrics || {};
        const bits = [
          m.total_ms != null ? `total ${Math.round(m.total_ms)}ms` : null,
          m.llm_first_token_ms != null
            ? `llm ${Math.round(m.llm_first_token_ms)}ms`
            : null,
          m.tts_first_audio_ms != null
            ? `tts ${Math.round(m.tts_first_audio_ms)}ms`
            : null,
          m.guardrail ? `safety:${m.guardrail}` : null,
        ].filter(Boolean);
        if (bits.length && modeRef.current === "voice") {
          pushEntry({
            role: "system",
            text: bits.join(" · "),
          });
        }
        if (m.guardrail === "crisis" || m.guardrail === "diagnosis" || m.guardrail === "med") {
          setEntries((prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === "assistant") {
                next[i] = { ...next[i], meta: m.guardrail };
                break;
              }
            }
            return next;
          });
        }
        setChatStreaming("");
        setChatBusy(false);
        // Wait until scheduled audio has actually finished playing.
        void drainPlayback().then(() => {
          if (playGenRef.current) {
            /* gen may have advanced on barge-in — still safe to idle */
          }
          if (!listeningRef.current) {
            setOrbState("idle");
            setStatusLabel(
              modeRef.current === "chat"
                ? "ready"
                : openMicRef.current
                  ? "listening — just speak"
                  : sessionStarted
                    ? "ready"
                    : "tap to start",
            );
          }
          speakingRef.current = false;
          setCaption("");
          vadRef.current.reset();
          prerollRef.current = [];
          if (
            modeRef.current === "voice" &&
            openMicRef.current &&
            capturingRef.current
          ) {
            setMicPhase("armed");
          }
        });
        return;
      }

      if (msg.type === "error") {
        setError(msg.message);
        setStatusLabel("error");
        setChatBusy(false);
        setChatStreaming("");
        pushEntry({ role: "system", text: `error: ${msg.message}` });
        speakingRef.current = false;
        vadRef.current.reset();
        prerollRef.current = [];
        if (openMicRef.current && capturingRef.current) setMicPhase("armed");
        if (!listeningRef.current) setOrbState("idle");
      }
    },
    [getAudioCtx, pushEntry],
  );

  const { status, send, reset, isOpen } = useEchoSocket(DEFAULT_WS_URL, {
    onMessage,
    onOpen: () => {
      // (Re)apply session config on every (re)connect. `send` is assigned
      // before this can fire, so the TDZ reference is safe.
      send({
        type: "config",
        voice: voiceRef.current,
        open_mic: openMicRef.current,
      });
    },
    onStatus: (s) => {
      if (s === "connecting") setStatusLabel("connecting…");
      else if (s === "connected") setStatusLabel("connected");
      else if (s === "ready") setStatusLabel("ready");
      else if (s === "disconnected") setStatusLabel("disconnected — retrying…");
      else if (s === "error") setStatusLabel("connection error");
    },
  });

  const cleanupMic = useCallback(() => {
    try {
      processorRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      sourceRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      muteRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    processorRef.current = null;
    sourceRef.current = null;
    muteRef.current = null;
    mediaStreamRef.current = null;
    capturingRef.current = false;
    vadRef.current.reset();
    prerollRef.current = [];
    levelBufRef.current = Array(28).fill(0.12);
    setLevels([]);
  }, []);

  /** Build the mic graph. `mode` decides how audio chunks are routed. */
  const startCapture = useCallback(
    async (mode: "ptt" | "vad") => {
      if (capturingRef.current) return true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        mediaStreamRef.current = stream;
        const ctx = await getAudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        // ScriptProcessor is deprecated but widely supported; fine for MVP.
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        sourceRef.current = source;
        processorRef.current = processor;
        capturingRef.current = true;

        processor.onaudioprocess = (e) => {
          const data = e.inputBuffer.getChannelData(0);
          const copy = new Float32Array(data);
          const level = rmsLevel(copy);
          const next = levelBufRef.current.slice(1);
          next.push(level);
          levelBufRef.current = next;
          setLevels([...next]);

          if (mode === "ptt") {
            if (!listeningRef.current) return;
            send({
              type: "audio",
              sr: ctx.sampleRate,
              pcm16: floatTo16Base64(copy),
            });
            return;
          }

          // ---- open mic / client-side VAD ----
          if (!openMicRef.current) return;

          // Strong barge-in only — speaker bleed must not cut Echo mid-sentence.
          if (speakingRef.current) {
            if (level < 0.48) return;
            speakingRef.current = false;
            playGenRef.current += 1;
            bumpPlaybackGeneration();
            try {
              activeSrcRef.current?.stop();
            } catch {
              /* already stopped */
            }
            activeSrcRef.current = null;
            playQueueRef.current = Promise.resolve();
            setCaption("");
          }

          const emit = (pcm: Float32Array) =>
            send({
              type: "audio",
              sr: ctx.sampleRate,
              pcm16: floatTo16Base64(pcm),
            });
          const wasSpeaking = vadRef.current.speaking;
          const event = vadRef.current.push(level, performance.now());

          if (event === "speech_start") {
            setMicPhase("speech");
            setOrbState("listening");
            setStatusLabel("listening…");
            setCaption("");
            prerollRef.current.forEach(emit); // don't clip the first syllable
            prerollRef.current = [];
          } else if (!wasSpeaking) {
            // Still silent: keep a rolling pre-roll window.
            prerollRef.current.push(copy);
            if (prerollRef.current.length > PREROLL_CHUNKS) {
              prerollRef.current.shift();
            }
            return;
          }

          emit(copy);

          if (event === "speech_end") {
            speakingRef.current = true;
            prerollRef.current = [];
            setMicPhase("idle");
            setOrbState("processing");
            setStatusLabel("processing…");
            send({ type: "end_utt" });
          }
        };

        source.connect(processor);
        // Keep processor alive without audible feedback
        const mute = ctx.createGain();
        mute.gain.value = 0;
        muteRef.current = mute;
        processor.connect(mute);
        mute.connect(ctx.destination);
        return true;
      } catch (e) {
        capturingRef.current = false;
        setMicPhase("error");
        setError(
          e instanceof Error ? e.message : "Microphone permission denied",
        );
        cleanupMic();
        return false;
      }
    },
    [cleanupMic, getAudioCtx, send],
  );

  // ---- tap-to-talk ----
  const startListening = useCallback(async () => {
    if (openMicRef.current) return; // orb is passive in open-mic mode
    if (listeningRef.current) return;
    if (!isOpen) {
      setError("Not connected to server");
      return;
    }
    // Tapping while Echo is talking is a barge-in: cut playback locally too.
    playGenRef.current += 1;
    bumpPlaybackGeneration();
    try {
      activeSrcRef.current?.stop();
    } catch {
      /* already stopped */
    }
    activeSrcRef.current = null;
    playQueueRef.current = Promise.resolve();
    setCaption("");

    listeningRef.current = true;
    setListening(true);
    setError(null);
    clearCaption();
    setOrbState("listening");
    setStatusLabel("listening…");
    setMicPhase("speech");
    const ok = await startCapture("ptt");
    if (!ok) {
      listeningRef.current = false;
      setListening(false);
      setOrbState("idle");
      setStatusLabel("ready");
    }
  }, [clearCaption, isOpen, startCapture]);

  const stopListening = useCallback(() => {
    if (openMicRef.current) return;
    if (!listeningRef.current) return;
    listeningRef.current = false;
    setListening(false);
    cleanupMic();
    setMicPhase("off");
    setOrbState("processing");
    setStatusLabel("processing…");
    send({ type: "end_utt" });
  }, [cleanupMic, send]);

  /** Single tap: first tap starts the session (enables VAD); later taps are PTT only if VAD off. */
  const handleOrbToggle = useCallback(() => {
    if (!isOpen) {
      setError("Not connected to server");
      return;
    }

    // First tap begins the conversation and turns on VAD (unless user opted out).
    if (!sessionStarted) {
      setSessionStarted(true);
      setError(null);
      // Unlock audio on user gesture
      void getAudioCtx();
      const preferVad =
        (() => {
          try {
            return localStorage.getItem(OPEN_MIC_STORAGE_KEY) !== "0";
          } catch {
            return true;
          }
        })();
      if (preferVad) {
        setOpenMic(true);
        setStatusLabel("listening — just speak");
        setOrbState("idle");
      } else {
        void startListening();
      }
      return;
    }

    if (openMicRef.current) {
      // VAD active — orb is passive; optional: tapping barges in silence
      return;
    }
    if (listeningRef.current) {
      stopListening();
    } else {
      void startListening();
    }
  }, [isOpen, sessionStarted, startListening, stopListening, getAudioCtx]);

  // ---- open mic lifecycle (after session start, voice mode only) ----
  useEffect(() => {
    openMicRef.current = openMic && mode === "voice" && sessionStarted;
    try {
      localStorage.setItem(OPEN_MIC_STORAGE_KEY, openMic ? "1" : "0");
    } catch {
      /* ignore */
    }

    if (mode !== "voice" || !sessionStarted) {
      if (capturingRef.current) cleanupMic();
      setMicPhase("off");
      listeningRef.current = false;
      setListening(false);
      return;
    }

    if (openMic) {
      if (listeningRef.current) {
        listeningRef.current = false;
        setListening(false);
        cleanupMic();
      }
      let cancelled = false;
      void (async () => {
        const ok = await startCapture("vad");
        if (cancelled) return;
        if (ok) {
          speakingRef.current = false;
          setMicPhase("armed");
          setStatusLabel("listening — just speak");
        } else {
          setOpenMic(false);
          setError("Microphone permission needed");
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (capturingRef.current) cleanupMic();
    setMicPhase("off");
    vadRef.current.reset();
    setOrbState((s) => (s === "listening" ? "idle" : s));
    return;
  }, [openMic, mode, sessionStarted, cleanupMic, startCapture]);

  // Tell the server whenever open-mic toggles (informational)
  useEffect(() => {
    if (!isOpen) return;
    send({
      type: "config",
      open_mic: openMic && mode === "voice" && sessionStarted,
    });
  }, [openMic, mode, sessionStarted, isOpen, send]);

  const handleVoiceChange = useCallback(
    (_v: string) => {
      // Single fixed warm voice — no picker. Keep state consistent.
      setVoice(DEFAULT_VOICE);
      voiceRef.current = DEFAULT_VOICE;
    },
    [],
  );

  const handleChatSend = useCallback(
    (text: string) => {
      if (!isOpen) {
        setError("Not connected to server");
        return;
      }
      pushEntry({ role: "user", text });
      setChatBusy(true);
      setChatStreaming("");
      setCaption("");
      setError(null);
      setOrbState("processing");
      setStatusLabel("thinking…");
      // Chat mode: text only (no TTS) for snappy friend-chat feel
      send({ type: "text", text, speak: false });
    },
    [isOpen, pushEntry, send],
  );

  const handleReset = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    speakingRef.current = false;
    vadRef.current.reset();
    prerollRef.current = [];
    playGenRef.current += 1;
    bumpPlaybackGeneration();
    try {
      activeSrcRef.current?.stop();
    } catch {
      /* already stopped */
    }
    activeSrcRef.current = null;
    playQueueRef.current = Promise.resolve();
    if (!openMicRef.current || modeRef.current === "chat") {
      cleanupMic();
      setMicPhase("off");
    } else {
      setMicPhase("armed");
    }
    reset();
    send({
      type: "config",
      voice: voiceRef.current,
      open_mic: openMicRef.current && modeRef.current === "voice",
    });
    setEntries([]);
    setError(null);
    setCaption("");
    setChatStreaming("");
    setChatBusy(false);
    setOrbState("idle");
    setStatusLabel(
      modeRef.current === "chat"
        ? "ready"
        : openMicRef.current
          ? "listening for you…"
          : "ready",
    );
  }, [cleanupMic, reset, send]);

  // Stop everything on unmount
  useEffect(() => {
    return () => {
      cleanupMic();
    };
  }, [cleanupMic]);

  const micLabel =
    !sessionStarted
      ? "tap orb to begin"
      : micPhase === "off"
        ? openMic
          ? "starting…"
          : "idle (tap to talk)"
        : micPhase === "armed"
          ? "open · waiting for speech"
          : micPhase === "speech"
            ? "capturing"
            : micPhase === "error"
              ? "unavailable"
              : "open · paused";

  const micActive = micPhase === "armed" || micPhase === "speech";
  const connected = status === "ready" || status === "connected";

  const captionHint =
    !sessionStarted
      ? "Tap the orb once to begin. Then just talk."
      : orbState === "listening"
        ? "I'm listening. Take your time."
        : openMic
          ? "Whenever you're ready — just start talking."
          : "Tap the orb when you want to talk.";

  if (!ready) {
    return <div className="min-h-dvh bg-[#100e0c]" />;
  }

  if (!accepted) {
    return <Onboarding onAccept={acceptDisclaimer} />;
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden">
      <SpeakingWaves
        active={mode === "voice" && orbState === "speaking"}
        levels={levels}
      />

      {/* Quiet top bar — brand + status, minimal chrome */}
      <header className="echo-pad-top relative z-30 flex items-center justify-between gap-3 px-5 sm:px-8">
        <div className="echo-float-in min-w-0">
          <div className="flex items-center gap-2.5">
            <span
              className="hidden h-2 w-2 shrink-0 rounded-full sm:block"
              style={{
                background: connected
                  ? "var(--accent-soft)"
                  : status === "connecting"
                    ? "var(--accent)"
                    : "var(--foreground-faint)",
                boxShadow: connected
                  ? "0 0 10px rgba(232,196,154,0.55)"
                  : undefined,
                animation:
                  status === "connecting" ? "echo-breathe 1.4s ease-in-out infinite" : undefined,
              }}
              aria-hidden
            />
            <div className="min-w-0">
              <h1 className="brand-wordmark truncate text-[1.05rem] leading-none tracking-tight text-[#f3eee6] sm:text-lg">
                sheleftme
              </h1>
              <p className="mt-1 truncate text-[11px] tracking-wide text-[var(--foreground-faint)]">
                {statusLabel}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {mode === "voice" && (
            <SettingsPanel
              open={settingsOpen}
              onToggleOpen={() => setSettingsOpen((o) => !o)}
              voice={voice}
              onVoiceChange={handleVoiceChange}
              openMic={openMic && sessionStarted}
              onOpenMicChange={(on) => {
                if (!sessionStarted) return;
                setOpenMic(on);
              }}
              micLabel={micLabel}
              micActive={micActive}
              sessionStarted={sessionStarted}
            />
          )}
          {mode === "chat" && (
            <button
              type="button"
              onClick={handleReset}
              className="glass-soft rounded-full px-3.5 py-2 text-[11px] tracking-wide
                text-[var(--foreground-muted)] transition hover:text-[#f3eee6] active:scale-95"
            >
              New chat
            </button>
          )}
        </div>
      </header>

      {mode === "chat" ? (
        <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center px-4 pb-24 pt-1 sm:px-8">
          <ChatPanel
            entries={entries}
            streaming={chatStreaming}
            busy={chatBusy}
            disabled={!connected}
            onSend={handleChatSend}
          />
        </main>
      ) : (
        <>
          <main
            className="relative z-10 flex flex-1 flex-col items-center justify-center gap-9
              px-5 pb-28 pt-6 sm:gap-11 sm:px-8"
          >
            <Orb
              state={orbState}
              onToggle={handleOrbToggle}
              listening={listening}
              passive={sessionStarted && openMic}
              disabled={!connected || (sessionStarted && openMic)}
              idleLabel={
                !sessionStarted
                  ? "tap once to start"
                  : openMic
                    ? "listening — just speak"
                    : !connected
                      ? "connecting…"
                      : "tap to talk"
              }
            />

            {error && (
              <p className="glass-soft max-w-sm rounded-full px-4 py-2 text-balance text-center text-xs text-[var(--danger)]">
                {error}
              </p>
            )}
          </main>

          <Captions state={orbState} text={caption} idleHint={captionHint} />

          <div
            className="echo-pad-bottom fixed inset-x-0 bottom-0 z-30 flex items-end justify-between
              gap-3 px-5 sm:px-8"
          >
            <Transcript entries={entries} />
            <div className="h-14 w-14 shrink-0" aria-hidden />
          </div>
        </>
      )}

      {/* Bottom-right FAB: Chat ↔ Voice */}
      <button
        type="button"
        onClick={() => switchMode(mode === "chat" ? "voice" : "chat")}
        aria-label={mode === "chat" ? "Back to voice" : "Open chat"}
        className="glass-fab echo-pad-bottom fixed bottom-4 right-4 z-40 flex h-14 w-14
          items-center justify-center rounded-full transition
          hover:brightness-110 active:scale-95 sm:bottom-6 sm:right-6"
      >
        {mode === "chat" ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M5 11a7 7 0 0 0 14 0M12 18v3"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 3.5V6.5Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M8.5 9h7M8.5 12h4.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
