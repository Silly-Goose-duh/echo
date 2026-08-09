"""WebSocket protocol for /ws/converse.

Client → server:
  {"type":"start"}                        # optional session start / reset
  {"type":"audio","pcm16":"<base64>","sr":16000}  # push-to-talk chunks
  {"type":"end_utt"}                      # user released PTT — run turn on buffer
  {"type":"text","text":"..."}            # text-only turn (debug)
  {"type":"reset"}
  {"type":"config","voice":"af_heart","open_mic":true}
      # session config; all fields optional. `voice` selects the Kokoro voice
      # used for subsequent TTS (overrides the server TTS_VOICE setting for
      # this session only). `open_mic` is informational — the client streams
      # continuously and sends end_utt itself from client-side VAD.

Server → client:
  {"type":"ready"}
  {"type":"partial_transcript","text":"..."}   # reserved
  {"type":"final_transcript","text":"...","stt_ms":123}
  {"type":"assistant_text","text":"...","final":false}
  {"type":"audio","pcm16":"<base64>","sr":24000,"text":"sentence"}
  {"type":"interrupted"}                  # in-flight turn aborted by barge-in
  {"type":"config_ok","voice":"af_heart","open_mic":true}
  {"type":"turn_end","metrics":{...}}
  {"type":"error","message":"..."}
"""

from __future__ import annotations

import asyncio
import audioop
import base64
import json
import threading
from typing import Any

import numpy as np
from fastapi import WebSocket, WebSocketDisconnect

from .orchestrator import Orchestrator, TurnResult
from .stt import Transcript

_SENTINEL: Any = object()


def _b64_pcm16(pcm_f32: np.ndarray) -> str:
    pcm16 = np.clip(pcm_f32 * 32767.0, -32768, 32767).astype(np.int16)
    return base64.b64encode(pcm16.tobytes()).decode("ascii")


# ~250ms frames at 24 kHz — keeps WS JSON under ~25KB and avoids frame-size drops.
_TTS_FRAME_SAMPLES = 6000


def _audio_frames(pcm_f32: np.ndarray, sample_rate: int, text: str, tts_ms: float):
    """Yield JSON-ready audio frames, chunking long TTS output."""
    n = int(pcm_f32.size)
    if n == 0:
        return
    if n <= _TTS_FRAME_SAMPLES * 2:
        yield {
            "type": "audio",
            "pcm16": _b64_pcm16(pcm_f32),
            "sr": sample_rate,
            "text": text,
            "tts_ms": tts_ms,
        }
        return
    # First frame carries the sentence text for captions; rest are silent-text.
    first = True
    for i in range(0, n, _TTS_FRAME_SAMPLES):
        sl = pcm_f32[i : i + _TTS_FRAME_SAMPLES]
        yield {
            "type": "audio",
            "pcm16": _b64_pcm16(sl),
            "sr": sample_rate,
            "text": text if first else "",
            "tts_ms": tts_ms if first else 0.0,
        }
        first = False


def _decode_pcm16(b64: str) -> bytes:
    return base64.b64decode(b64)


async def converse_socket(ws: WebSocket, orch: Orchestrator) -> None:
    client = ws.client.host if hasattr(ws, "client") and ws.client else "?"
    print(f"[ws] connect from {client}", flush=True)
    await ws.accept()
    await ws.send_json({"type": "ready"})
    buf = bytearray()
    sr = orch.settings.sample_rate_in

    turn_task: asyncio.Task[None] | None = None
    turn_cancel: threading.Event | None = None

    async def interrupt_turn(notify: bool = True) -> None:
        """Cancel an in-flight turn (barge-in) and wait for it to wind down."""
        nonlocal turn_task, turn_cancel
        if turn_task is None or turn_task.done():
            turn_task = None
            return
        if not orch.settings.barge_in_enabled:
            # Barge-in disabled: wait for the current turn to finish instead.
            await turn_task
            turn_task = None
            return
        if turn_cancel is not None:
            turn_cancel.set()
        await turn_task
        turn_task = None
        if notify:
            await ws.send_json({"type": "interrupted"})

    async def start_turn(
        text: str, stt: Transcript | None, *, speak: bool = True
    ) -> None:
        nonlocal turn_task, turn_cancel
        if not text.strip():
            await ws.send_json({"type": "error", "message": "empty transcript"})
            return
        turn_cancel = threading.Event()
        turn_task = asyncio.create_task(
            _stream_turn(ws, orch, text, stt, turn_cancel, speak=speak)
        )

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg: dict[str, Any] = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "invalid json"})
                continue

            mtype = msg.get("type")
            if mtype == "reset" or mtype == "start":
                await interrupt_turn(notify=False)
                orch.reset()
                buf.clear()
                await ws.send_json({"type": "ready"})
                continue

            if mtype in ("config", "set_voice"):
                # Session config from the client. Applied immediately; takes
                # effect on the next TTS sentence.
                if "voice" in msg and msg["voice"]:
                    orch.set_voice(str(msg["voice"]))
                if "open_mic" in msg:
                    orch.open_mic = bool(msg["open_mic"])
                await ws.send_json(
                    {
                        "type": "config_ok",
                        "voice": orch.current_voice,
                        "open_mic": orch.open_mic,
                    }
                )
                continue

            if mtype == "audio":
                # New speech while assistant is talking → barge-in.
                await interrupt_turn()
                chunk = _decode_pcm16(msg.get("pcm16", ""))
                if "sr" in msg and int(msg["sr"]) != sr:
                    # crude resample via audioop (16-bit)
                    chunk = audioop.ratecv(
                        chunk, 2, 1, int(msg["sr"]), sr, None
                    )[0]
                buf.extend(chunk)
                continue

            if mtype == "text":
                await interrupt_turn()
                text = str(msg.get("text", "")).strip()
                # speak=false → chat mode (text only, no TTS) for faster typing UX
                speak = bool(msg.get("speak", True))
                if "tts" in msg:
                    speak = bool(msg["tts"])
                await start_turn(text, stt=None, speak=speak)
                continue

            if mtype == "end_utt":
                await interrupt_turn()
                pcm = bytes(buf)
                buf.clear()
                if not pcm:
                    await ws.send_json(
                        {"type": "error", "message": "empty audio buffer"}
                    )
                    continue
                tr = await asyncio.to_thread(
                    orch.stt.transcribe_pcm16, pcm, sample_rate=sr
                )
                await ws.send_json(
                    {
                        "type": "final_transcript",
                        "text": tr.text,
                        "stt_ms": tr.latency_ms,
                        "backend": tr.backend,
                    }
                )
                await start_turn(tr.text, stt=tr)
                continue

            await ws.send_json(
                {"type": "error", "message": f"unknown type: {mtype}"}
            )
    except WebSocketDisconnect:
        if turn_cancel is not None:
            turn_cancel.set()
        if turn_task is not None and not turn_task.done():
            turn_task.cancel()
        return


async def _stream_turn(
    ws: WebSocket,
    orch: Orchestrator,
    text: str,
    stt: Transcript | None,
    cancel: threading.Event,
    *,
    speak: bool = True,
) -> None:
    """Run orchestrator.run_turn in a worker thread and stream events out.

    Audio chunks are forwarded when speak=True. Chat mode uses speak=False.
    """
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[Any] = asyncio.Queue()

    def worker() -> None:
        try:
            for event in orch.run_turn(text, stt=stt, cancel=cancel, speak=speak):
                loop.call_soon_threadsafe(queue.put_nowait, event)
        except Exception as exc:  # surface backend errors to the client
            loop.call_soon_threadsafe(queue.put_nowait, ("error", exc))
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, _SENTINEL)

    threading.Thread(target=worker, daemon=True, name="echo-turn").start()

    try:
        while True:
            event = await queue.get()
            if event is _SENTINEL:
                break
            kind, payload = event
            if cancel.is_set():
                continue  # interrupted: drain silently, drop queued audio
            if kind == "text":
                await ws.send_json(
                    {
                        "type": "assistant_text",
                        "text": str(payload),
                        "final": False,
                    }
                )
            elif kind == "audio":
                if payload.pcm_float32.size == 0:
                    continue
                for frame in _audio_frames(
                    payload.pcm_float32,
                    payload.sample_rate,
                    payload.text,
                    payload.latency_ms,
                ):
                    if cancel.is_set():
                        break
                    await ws.send_json(frame)
            elif kind == "done":
                result: TurnResult = payload
                if result.assistant_text:
                    await ws.send_json(
                        {
                            "type": "assistant_text",
                            "text": result.assistant_text,
                            "final": True,
                        }
                    )
                metrics = {
                    "stt_ms": stt.latency_ms if stt else None,
                    "llm_first_token_ms": result.llm_first_token_ms,
                    "tts_first_audio_ms": result.tts_first_audio_ms,
                    "total_ms": result.total_ms,
                    "interrupted": result.interrupted,
                    "user_text": result.user_text,
                    "assistant_text": result.assistant_text,
                }
                if result.guardrail:
                    metrics["guardrail"] = result.guardrail
                await ws.send_json({"type": "turn_end", "metrics": metrics})
            elif kind == "error":
                await ws.send_json({"type": "error", "message": str(payload)})
    except Exception:
        cancel.set()
        while True:
            leftover = await queue.get()
            if leftover is _SENTINEL:
                break