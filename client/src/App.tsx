import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DECK } from "../../shared/deck.ts";
import type { Card, ClientCommand, QueueSettings } from "../../shared/protocol.ts";
import { ActionBar } from "./components/ActionBar.tsx";
import { Deck } from "./components/Deck.tsx";
import { ErrorSnackbar } from "./components/ErrorSnackbar.tsx";
import { Header } from "./components/Header.tsx";
import { Layout } from "./components/Layout.tsx";
import { LeftPanel } from "./components/LeftPanel.tsx";
import { Players } from "./components/Players.tsx";
import { QueueControls } from "./components/QueueControls.tsx";
import { TicketView } from "./components/TicketView.tsx";
import { useGameSocket } from "./useGameSocket.ts";

type Notice = { id: number; message: string };

export function App() {
  const { snapshot, me, connected, send, error, disconnectedReason, search, searchResults } =
    useGameSocket();
  const [notice, setNotice] = useState<Notice | null>(null);
  // Local ids count down from -1 so they never collide with the server's positive error ids.
  const localNoticeId = useRef(-1);

  useEffect(() => {
    if (error) setNotice(error);
  }, [error]);

  const dispatch = useCallback(
    (cmd: ClientCommand) => {
      if (!send(cmd)) {
        setNotice({
          id: localNoticeId.current--,
          message: "Not connected. Your action was not sent.",
        });
      }
    },
    [send],
  );

  const disabled = !connected;
  // The server shows a player their own vote before reveal, so this works while voting.
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
  const onReset = useCallback(
    ({ clearTicket }: { clearTicket: boolean }) =>
      dispatch(clearTicket ? { type: "reset", clearTicket: true } : { type: "reset" }),
    [dispatch],
  );
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
        main={<TicketView ticket={snapshot.ticket} />}
        bottom={
          <Box
            sx={{
              display: "grid",
              // The auto center column keeps the deck centered whatever width the sides take.
              gridTemplateColumns: { xs: "1fr", lg: "1fr auto 1fr" },
              gap: 2,
              alignItems: "center",
            }}
          >
            {/* minWidth 0 lets a long player list wrap here instead of pushing the deck off-center. */}
            <Box sx={{ minWidth: 0 }}>
              <Players
                players={snapshot.players}
                phase={snapshot.phase}
                meId={me?.userId ?? null}
                stats={snapshot.stats}
              />
            </Box>
            <Deck
              deck={DECK}
              selected={selected}
              disabled={disabled || snapshot.phase !== "voting"}
              onSelect={onSelect}
              onClear={onClear}
            />
            <Box sx={{ justifySelf: { lg: "end" } }}>
              <ActionBar
                phase={snapshot.phase}
                round={snapshot.round}
                stats={snapshot.stats}
                ticket={snapshot.ticket}
                deck={DECK}
                disabled={disabled}
                jiraSave={snapshot.jiraSave}
                onReveal={onReveal}
                onReset={onReset}
                onSave={onSave}
              />
            </Box>
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
              disabled={disabled}
              refreshing={snapshot.queue.loading}
              onChangeSettings={onChangeSettings}
              onRefresh={onRefresh}
            />
          ) : undefined
        }
      />
      {content}
      <ErrorSnackbar error={notice} />
    </>
  );
}
