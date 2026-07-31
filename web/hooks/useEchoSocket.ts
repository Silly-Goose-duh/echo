"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionStatus,
  DEFAULT_WS_URL,
  ServerMessage,
  ClientMessage,
} from "@/lib/protocol";

type Handlers = {
  onMessage?: (msg: ServerMessage) => void;
  onStatus?: (status: ConnectionStatus) => void;
  /** Fired right after the socket opens and {type:"start"} is sent.
   *  Use it to (re)send session config such as the selected voice. */
  onOpen?: () => void;
};

export function useEchoSocket(url: string = DEFAULT_WS_URL, handlers: Handlers = {}) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(handlers);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUser = useRef(false);

  handlersRef.current = handlers;

  const updateStatus = useCallback((s: ConnectionStatus) => {
    setStatus(s);
    handlersRef.current.onStatus?.(s);
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }, []);

  const connect = useCallback(() => {
    if (typeof window === "undefined") return;
    closedByUser.current = false;
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    try {
      wsRef.current?.close();
    } catch {
      /* ignore */
    }

    updateStatus("connecting");
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      updateStatus("connected");
      // Prefer direct send here so we don't race a stale closure
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "start" }));
      }
      handlersRef.current.onOpen?.();
    };

    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data as string) as ServerMessage;
      } catch {
        return;
      }
      if (msg.type === "ready") {
        updateStatus("ready");
      }
      handlersRef.current.onMessage?.(msg);
    };

    ws.onerror = () => {
      updateStatus("error");
    };

    ws.onclose = () => {
      updateStatus("disconnected");
      wsRef.current = null;
      if (!closedByUser.current) {
        retryRef.current = setTimeout(() => connect(), 1500);
      }
    };
  }, [url, updateStatus]);

  const disconnect = useCallback(() => {
    closedByUser.current = true;
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    try {
      wsRef.current?.close();
    } catch {
      /* ignore */
    }
    wsRef.current = null;
    updateStatus("disconnected");
  }, [updateStatus]);

  const reset = useCallback(() => {
    send({ type: "reset" });
  }, [send]);

  useEffect(() => {
    connect();
    return () => {
      closedByUser.current = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
    };
  }, [connect]);

  return {
    status,
    send,
    reset,
    connect,
    disconnect,
    isOpen: status === "ready" || status === "connected",
  };
}
