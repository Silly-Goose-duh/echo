"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Orb } from "@/components/Orb";
import { Waveform } from "@/components/Waveform";
import { Transcript } from "@/components/Transcript";
import { SettingsPanel } from "@/components/SettingsPanel";
import { SpeakingWaves } from "@/components/SpeakingWaves";
import { Captions } from "@/components/Captions";
import { useEchoSocket } from "@/hooks/useEchoSocket";
import { floatTo16Base64, playPcm16Base64, rmsLevel } from "@/lib/audio";
import { createVad } from "@/lib/vad";
import {
  DEFAULT_VOICE,
  OPEN_MIC_STORAGE_KEY,
  VOICE_STORAGE_KEY,
  voiceLabel,
} from "@/lib/voices";
import {
  DEFAULT_WS_URL,
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
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [levels, setLevels] = useState<number[]>([]);
  const [statusLabel, setStatusLabel] = useState("connecting…");
  const [error, setError] = useState<string | null>(null);
  /** Text of the assistant turn currently being spoken (live captions). */
  const [caption, setCaption] = useState("");

  const [voice, setVoice] = useState<string>(DEFAULT_VOICE);
  const [openMic, setOpenMic] = useState(false);
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
  const vadRef = useRef(createVad());
  const prerollRef = useRef<Float32Array[]>([]);

  const pushEntry = useCallback((entry: Omit<TranscriptEntry, "id" | "ts">) => {
    setEntries((prev) => [...prev, { ...entry, id: uid(), ts: Date.now() }]);
  }, []);

  /** Start of a new user turn — wipe the assistant captions. */
  const clearCaption = useCallback(() => setCaption(""), []);

  // Restore persisted preferences
  useEffect(() => {
    try {
      const v = localStorage.getItem(VOICE_STORAGE_KEY);
      if (v) {
        setVoice(v);
        voiceRef.current = v;
      }
      const om = localStorage.getItem(OPEN_MIC_STORAGE_KEY);
      if (om === "1") setOpenMic(true);
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
        if (msg.final !== false) {
          pushEntry({ role: "assistant", text: msg.text });
          // Text-only turns (no TTS) still deserve captions.
          setCaption((prev) => (prev.trim() ? prev : msg.text));
        } else {
          setCaption(msg.text);
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
        playQueueRef.current = playQueueRef.current.then(async () => {
          if (gen !== playGenRef.current) return; // interrupted — drop chunk
          // Caption the sentence at the moment it starts playing, so the
          // text on screen matches what is actually being heard.
          if (chunkText) {
            setCaption((prev) => (prev ? `${prev} ${chunkText}` : chunkText));
          }
          try {
            const ctx = await getAudioCtx();
            // Prefer native rate for TTS playback (often 24 kHz)
            let playCtx = ctx;
            if (Math.abs(ctx.sampleRate - sr) > 1) {
              // Use a one-off context matching TTS rate when needed
              playCtx = new AudioContext({ sampleRate: sr });
            }
            await playPcm16Base64(pcm, sr, playCtx, (src) => {
              activeSrcRef.current = src;
            });
            activeSrcRef.current = null;
            if (playCtx !== ctx) {
              await playCtx.close().catch(() => undefined);
            }
          } catch (e) {
            console.error("playback failed", e);
          }
        });
        return;
      }

      if (msg.type === "interrupted") {
        // Server aborted the in-flight turn (barge-in): stop playback now,
        // drop any queued audio, and reset like a turn_end.
        playGenRef.current += 1;
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
        ].filter(Boolean);
        if (bits.length) {
          pushEntry({
            role: "system",
            text: bits.join(" · "),
          });
        }
        playQueueRef.current = playQueueRef.current.then(() => {
          if (!listeningRef.current) {
            setOrbState("idle");
            setStatusLabel(openMicRef.current ? "listening for you…" : "ready");
          }
          // Re-open the mic for the next utterance
          speakingRef.current = false;
          vadRef.current.reset();
          prerollRef.current = [];
          if (openMicRef.current && capturingRef.current) {
            setMicPhase("armed");
          }
        });
        return;
      }

      if (msg.type === "error") {
        setError(msg.message);
        setStatusLabel("error");
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
          if (speakingRef.current) return; // assistant turn in flight

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
    try {
      activeSrcRef.current?.stop();
    } catch {
      /* already stopped */
    }
    activeSrcRef.current = null;
    playQueueRef.current = Promise.resolve();

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

  /** Single tap target: first tap opens the mic, second closes it. */
  const handleOrbToggle = useCallback(() => {
    if (openMicRef.current) return;
    if (listeningRef.current) {
      stopListening();
    } else {
      void startListening();
    }
  }, [startListening, stopListening]);

  // ---- open mic lifecycle ----
  useEffect(() => {
    openMicRef.current = openMic;
    try {
      localStorage.setItem(OPEN_MIC_STORAGE_KEY, openMic ? "1" : "0");
    } catch {
      /* ignore */
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
          setStatusLabel("listening for you…");
        } else {
          setOpenMic(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    // turning off
    if (capturingRef.current) cleanupMic();
    setMicPhase("off");
    vadRef.current.reset();
    setOrbState((s) => (s === "listening" ? "idle" : s));
    return;
  }, [openMic, cleanupMic, startCapture]);

  // Tell the server whenever open-mic toggles (informational)
  useEffect(() => {
    if (!isOpen) return;
    send({ type: "config", open_mic: openMic });
  }, [openMic, isOpen, send]);

  const handleVoiceChange = useCallback(
    (v: string) => {
      setVoice(v);
      voiceRef.current = v;
      try {
        localStorage.setItem(VOICE_STORAGE_KEY, v);
      } catch {
        /* ignore */
      }
      const sent = send({ type: "config", voice: v });
      if (sent) {
        pushEntry({ role: "system", text: `voice → ${voiceLabel(v)} (${v})` });
      }
    },
    [pushEntry, send],
  );

  const handleReset = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    speakingRef.current = false;
    vadRef.current.reset();
    prerollRef.current = [];
    playGenRef.current += 1;
    try {
      activeSrcRef.current?.stop();
    } catch {
      /* already stopped */
    }
    activeSrcRef.current = null;
    playQueueRef.current = Promise.resolve();
    if (!openMicRef.current) {
      cleanupMic();
      setMicPhase("off");
    } else {
      setMicPhase("armed");
    }
    reset();
    // reset() wipes server session state; re-apply the chosen voice
    send({ type: "config", voice: voiceRef.current, open_mic: openMicRef.current });
    setEntries([]);
    setError(null);
    setCaption("");
    setOrbState("idle");
    setStatusLabel(openMicRef.current ? "listening for you…" : "ready");
  }, [cleanupMic, reset, send]);

  // Stop everything on unmount
  useEffect(() => {
    return () => {
      cleanupMic();
    };
  }, [cleanupMic]);

  const micLabel =
    micPhase === "off"
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
    orbState === "listening"
      ? "I'm listening. Take your time."
      : openMic
        ? "Whenever you're ready — just start talking."
        : "Whenever you're ready — tap the orb and talk.";

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden">
      {/* Hero visual: flowing blue waves while Echo speaks */}
      <SpeakingWaves active={orbState === "speaking"} />

      {/* ---- top bar ---- */}
      <header className="echo-pad-top relative z-30 flex items-start justify-between gap-3 px-4 sm:px-8">
        <div className="min-w-0">
          <h1 className="text-[11px] font-medium tracking-[0.34em] text-zinc-300 sm:text-xs">
            ECHO
          </h1>
          <p className="mt-0.5 text-[10px] tracking-[0.18em] text-zinc-600 sm:text-[11px]">
            voice therapist
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-600">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                connected
                  ? "bg-emerald-400/90 shadow-[0_0_8px_rgba(52,211,153,0.55)]"
                  : status === "connecting"
                    ? "bg-amber-400/80 animate-pulse"
                    : "bg-zinc-600"
              }`}
              aria-hidden
            />
            <span className="truncate">{statusLabel}</span>
          </p>
        </div>

        <SettingsPanel
          open={settingsOpen}
          onToggleOpen={() => setSettingsOpen((o) => !o)}
          voice={voice}
          onVoiceChange={handleVoiceChange}
          openMic={openMic}
          onOpenMicChange={setOpenMic}
          micLabel={micLabel}
          micActive={micActive}
        />
      </header>

      {/* ---- centre stage ---- */}
      <main
        className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8
          px-5 py-10 sm:gap-10 sm:px-8"
      >
        <Orb
          state={orbState}
          onToggle={handleOrbToggle}
          listening={listening}
          passive={openMic}
          disabled={openMic || !connected}
          idleLabel={
            openMic
              ? "open mic — just speak"
              : !connected
                ? "connecting…"
                : undefined
          }
        />

        <Waveform state={orbState} levels={levels.length ? levels : undefined} />

        {error && (
          <p className="max-w-sm text-balance text-center text-xs text-red-400/90">
            {error}
          </p>
        )}
      </main>

      {/* ---- live captions ---- */}
      <Captions state={orbState} text={caption} idleHint={captionHint} />

      {/* ---- bottom controls ---- */}
      <div
        className="echo-pad-bottom fixed inset-x-0 bottom-0 z-30 flex items-end justify-between
          gap-3 px-4 sm:px-8"
      >
        <Transcript entries={entries} />

        <button
          type="button"
          onClick={handleReset}
          className="shrink-0 rounded-full border border-white/[0.08] bg-black/40 px-4 py-2.5
            text-xs tracking-wide text-zinc-400 backdrop-blur-md transition
            hover:border-white/20 hover:text-zinc-200 active:scale-95 sm:px-5"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
