import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DECK } from "../../shared/deck.ts";
import type { Card, ClientCommand, QueueSettings } from "../../shared/protocol.ts";
import { Hand } from "./components/Hand.tsx";
import { Header } from "./components/Header.tsx";
import { Layout } from "./components/Layout.tsx";
import { LeftPanel } from "./components/LeftPanel.tsx";
import { type Notice, NoticeSnackbar } from "./components/NoticeSnackbar.tsx";
import { Players } from "./components/Players.tsx";
import { QueueControls } from "./components/QueueControls.tsx";
import { ResultsPill } from "./components/ResultsPill.tsx";
import { RoomSwitch } from "./components/RoomSwitch.tsx";
import { TicketView } from "./components/TicketView.tsx";
import { useGameSocket } from "./useGameSocket.ts";

export function App() {
  const { snapshot, me, connected, send, error, disconnectedReason, search, searchResults } =
    useGameSocket();
  const [notice, setNotice] = useState<Notice | null>(null);
  // Local ids count down from -1 so they never collide with the server's positive error ids.
  const localNoticeId = useRef(-1);

  useEffect(() => {
    if (error) setNotice({ ...error, severity: "error" });
  }, [error]);

  // Remember the previous save status so a toast shows only when this client sees a save finish.
  // Joining, reconnecting or refreshing while jiraSave is already "saved" or "error" must not
  // replay it. Every snapshot is a new object, so the effect cannot tell a new result from the
  // same one arriving again without the previous status.
  const jiraSave = snapshot?.jiraSave;
  const prevSaveStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevSaveStatus.current;
    prevSaveStatus.current = jiraSave?.status;
    if (prev !== "saving" || !jiraSave) return;
    if (jiraSave.status === "saved") {
      setNotice({
        id: localNoticeId.current--,
        message: `Saved ${jiraSave.points} pts by ${jiraSave.by}`,
        severity: "success",
      });
    } else if (jiraSave.status === "error") {
      setNotice({ id: localNoticeId.current--, message: jiraSave.message, severity: "error" });
    }
  }, [jiraSave]);

  const dispatch = useCallback(
    (cmd: ClientCommand) => {
      if (!send(cmd)) {
        setNotice({
          id: localNoticeId.current--,
          message: "Not connected. Your action was not sent.",
          severity: "error",
        });
      }
    },
    [send],
  );

  const disabled = !connected;
  // The server shows a player their own vote before reveal, so this works while voting and after the reveal.
  const selected = snapshot?.players.find((p) => p.userId === me?.userId)?.vote ?? null;

  const onChangeSettings = useCallback(
    (settings: Partial<QueueSettings>) => dispatch({ type: "setQueueSettings", settings }),
    [dispatch],
  );
  const onRefresh = useCallback(() => {
    dispatch({ type: "refreshQueue" });
    // Always sent: the server's refreshProjects retries the projects and the boards, and the
    // two can fail independently (a non-empty project list says nothing about the boards).
    // The server caches successful lists, so this costs nothing when both are fine.
    // Plain send: if the socket is down, the dispatch above already showed the notice.
    send({ type: "refreshProjects" });
  }, [dispatch, send]);
  const onPick = useCallback((key: string) => dispatch({ type: "loadTicket", key }), [dispatch]);
  const onSelect = useCallback(
    (card: string) => dispatch({ type: "vote", card: card as Card }),
    [dispatch],
  );
  // The server toggles, so voting the selected card again clears it.
  const onClear = useCallback(() => {
    if (selected) dispatch({ type: "vote", card: selected });
  }, [dispatch, selected]);
  const onReveal = useCallback(() => dispatch({ type: "reveal" }), [dispatch]);
  const onAutoRevealToggle = useCallback(
    (enabled: boolean) => dispatch({ type: "setAutoReveal", enabled }),
    [dispatch],
  );
  const onAutoAdvanceToggle = useCallback(
    (enabled: boolean) => dispatch({ type: "setAutoAdvance", enabled }),
    [dispatch],
  );
  const onReset = useCallback(
    ({ clearTicket }: { clearTicket: boolean }) =>
      dispatch(clearTicket ? { type: "reset", clearTicket: true } : { type: "reset" }),
    [dispatch],
  );
  const onNext = useCallback(() => onReset({ clearTicket: true }), [onReset]);
  const onSave = useCallback(
    (points: number) => dispatch({ type: "saveEstimate", points }),
    [dispatch],
  );

  // The Jira base URL is only known from ticket links, so derive the origin from the first one.
  const queueSections = snapshot?.queue.sections;
  const jiraBase = useMemo(() => {
    const first = queueSections?.find((section) => section.items.length > 0)?.items[0];
    if (!first) return null;
    try {
      return new URL(first.url).origin;
    } catch {
      return null;
    }
  }, [queueSections]);
  const projectKey = snapshot?.queueSettings.projectKey ?? null;
  const boardId = snapshot?.queueSettings.boardId ?? null;
  const boardUrl =
    jiraBase !== null && projectKey !== null && boardId !== null
      ? `${jiraBase}/jira/software/c/projects/${encodeURIComponent(projectKey)}/boards/${boardId}/backlog`
      : null;

  let content: React.ReactNode;
  if (disconnectedReason !== null) {
    content = (
      <Container maxWidth="md" sx={{ py: 2 }}>
        <Alert severity="warning">
          {disconnectedReason === "unauthenticated"
            ? "Open this app inside the hosting platform. Sign-in is handled by the platform, and this page cannot identify you on its own."
            : "This page was opened from an address the server does not accept. Contact the service owner."}
        </Alert>
      </Container>
    );
  } else if (snapshot === null) {
    content = (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress aria-label="Loading" />
      </Box>
    );
  } else {
    content = (
      <Layout
        left={
          <LeftPanel
            history={snapshot.history}
            queue={snapshot.queue}
            searchResults={searchResults}
            currentKey={snapshot.ticket?.key ?? null}
            disabled={disabled}
            onPick={onPick}
            onSearch={search}
            boardUrl={boardUrl}
          />
        }
        main={
          <>
            <Players
              players={snapshot.players}
              phase={snapshot.phase}
              meId={me?.userId ?? null}
              disabled={disabled}
              onReveal={onReveal}
              onReset={onReset}
            />
            <TicketView ticket={snapshot.ticket} />
          </>
        }
        floating={
          <Box
            sx={{
              display: "flex",
              // Side by side, the hand, the gap and the pill need about 738px. Below md that does
              // not fit, and between md and lg the group centers on the window with the hand at
              // its left end, so the arc squeezed to a step of about 20px at 900px. Below lg the
              // pill stacks above the hand, so the hand stays at the bottom edge, centered. From
              // lg the group centers on the Ticket column, clamped inside the window.
              flexDirection: { xs: "column-reverse", lg: "row" },
              alignItems: { xs: "center", lg: "flex-end" },
              gap: "20px",
              // Layout's wrapper lets clicks through its empty space; this row must too, so the
              // gap and the space above the shorter child do not block the ticket beneath.
              pointerEvents: "none",
              "& > *": { pointerEvents: "auto" },
              // The open arc overlaps the pill's left end, so the pill fades and lets clicks
              // through while you pick.
              "& [data-results]": { transition: "opacity 200ms" },
              "&:has([data-hand-open='true']) [data-results]": {
                opacity: 0.15,
                pointerEvents: "none",
              },
            }}
          >
            <Hand
              deck={DECK}
              selected={selected}
              disabled={disabled || snapshot.phase === "idle"}
              onSelect={onSelect}
              onClear={onClear}
            />
            {snapshot.phase === "revealed" && (
              <ResultsPill
                round={snapshot.round}
                stats={snapshot.stats}
                ticket={snapshot.ticket}
                deck={DECK}
                disabled={disabled}
                jiraSave={snapshot.jiraSave}
                onSave={onSave}
                onNext={onNext}
              />
            )}
          </Box>
        }
      />
    );
  }

  return (
    <>
      <Header
        connected={connected}
        meName={me?.username}
        controls={
          snapshot ? (
            <QueueControls
              settings={snapshot.queueSettings}
              projects={snapshot.projects}
              boards={snapshot.boards}
              issueTypes={snapshot.issueTypes}
              disabled={disabled}
              refreshing={snapshot.queue.loading}
              onChangeSettings={onChangeSettings}
              onRefresh={onRefresh}
            />
          ) : undefined
        }
        actions={
          snapshot ? (
            // Room settings, not queue settings. In the action bar Auto-reveal wrapped "Next
            // ticket" onto a second row after reveal; on the left both switches crowded the
            // Project, Board and Type selects, so they sit on the right (decision 50).
            <>
              <RoomSwitch
                label="Auto-reveal"
                checked={snapshot.autoReveal}
                disabled={disabled}
                onToggle={onAutoRevealToggle}
              />
              <RoomSwitch
                label="Auto-advance"
                checked={snapshot.autoAdvance}
                disabled={disabled}
                onToggle={onAutoAdvanceToggle}
              />
            </>
          ) : undefined
        }
      />
      {content}
      <NoticeSnackbar notice={notice} />
    </>
  );
}
