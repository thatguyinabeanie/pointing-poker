import { useCallback, useEffect, useRef, useState } from "react";
import { MIN_QUERY_LENGTH, NEEDS_POINTING_LABEL } from "../../shared/constants.ts";
import type { ClientCommand, QueueItem, ServerMessage, Snapshot } from "../../shared/protocol.ts";

type Me = { userId: number; username: string };
type SocketError = { id: number; message: string };
type DisconnectedReason = "unauthenticated" | "bad_origin";
export type SearchResults = {
  query: string;
  items: QueueItem[];
  error: string | null;
  pending: boolean;
};

const SEARCH_DEBOUNCE_MS = 400;

function buildUrl(): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${scheme}//${location.host}/ws`;
  // Always forward devUser; the server decides whether to honor it.
  const devUser = new URLSearchParams(location.search).get("devUser");
  return devUser ? `${base}?devUser=${encodeURIComponent(devUser)}` : base;
}

export function useGameSocket(): {
  snapshot: Snapshot | null;
  me: Me | null;
  connected: boolean;
  send: (cmd: ClientCommand) => boolean;
  error: SocketError | null;
  disconnectedReason: DisconnectedReason | null;
  search: (query: string) => void;
  searchResults: SearchResults | null;
  needsPointingLabel: string;
} {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<SocketError | null>(null);
  const [disconnectedReason, setDisconnectedReason] = useState<DisconnectedReason | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  // The default only shows before hello arrives; the server sends the configured label.
  const [needsPointingLabel, setNeedsPointingLabel] = useState(NEEDS_POINTING_LABEL);

  const socketRef = useRef<WebSocket | null>(null);
  const latestQueryRef = useRef<string | null>(null);
  const searchTimerRef = useRef<number | undefined>(undefined);

  const send = useCallback((cmd: ClientCommand): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(cmd));
    return true;
  }, []);

  const search = useCallback(
    (raw: string) => {
      const query = raw.trim();
      window.clearTimeout(searchTimerRef.current);
      if (query.length < MIN_QUERY_LENGTH) {
        latestQueryRef.current = null;
        setSearchResults(null);
        return;
      }
      latestQueryRef.current = query;
      searchTimerRef.current = window.setTimeout(() => {
        if (send({ type: "searchTickets", query })) {
          setSearchResults({ query, items: [], error: null, pending: true });
        }
      }, SEARCH_DEBOUNCE_MS);
    },
    [send],
  );

  // Clear the pending debounce on unmount.
  useEffect(() => () => window.clearTimeout(searchTimerRef.current), []);

  useEffect(() => {
    // Per-mount state lives in this closure so StrictMode's double mount cannot interfere.
    let cancelled = false;
    let terminal = false;
    let attempt = 0;
    let timer: number | undefined;
    const url = buildUrl();

    function connect() {
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onmessage = (event) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case "hello":
            setMe(msg.me);
            setNeedsPointingLabel(msg.needsPointingLabel);
            setConnected(true);
            attempt = 0;
            break;
          case "state":
            setSnapshot(msg.snapshot);
            break;
          case "error":
            // The reason is in the text so users can report it.
            setError({ id: msg.id, message: `${msg.message} (${msg.reason})` });
            break;
          case "searchResults":
            // Drop results for a query the user has already replaced.
            if (msg.query === latestQueryRef.current) {
              setSearchResults({
                query: msg.query,
                items: msg.items,
                error: msg.error,
                pending: false,
              });
            }
            break;
        }
      };

      socket.onclose = (event) => {
        // A wake-up event may already have opened a newer socket; this close is stale then, so
        // leave its ref, connected flag and retry timer alone.
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        setConnected(false);
        if (cancelled) return;
        // 4401 and 1008 are terminal: retrying cannot fix identity or origin.
        if (event.code === 4401) {
          terminal = true;
          setDisconnectedReason("unauthenticated");
          return;
        }
        if (event.code === 1008) {
          terminal = true;
          setDisconnectedReason("bad_origin");
          return;
        }
        const delay = Math.min(10_000, 500 * 2 ** attempt) * (0.5 + Math.random() / 2);
        attempt += 1;
        timer = window.setTimeout(connect, delay);
      };

      // Browsers always follow an error with a close event, which handles retry.
      socket.onerror = null;
    }

    // Wake-ups from sleep, offline or a background tab: reconnect now instead of waiting.
    function reconnectNow() {
      if (cancelled || terminal) return;
      const socket = socketRef.current;
      if (
        socket &&
        (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }
      window.clearTimeout(timer);
      attempt = 0;
      connect();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") reconnectNow();
    }

    connect();
    window.addEventListener("online", reconnectNow);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("online", reconnectNow);
      document.removeEventListener("visibilitychange", onVisibility);
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        // Null the handlers first so a stale socket cannot set state or schedule a retry.
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
    };
  }, []);

  return {
    snapshot,
    me,
    connected,
    send,
    error,
    disconnectedReason,
    search,
    searchResults,
    needsPointingLabel,
  };
}
