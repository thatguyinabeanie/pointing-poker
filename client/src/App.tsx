import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import { useCallback, useEffect, useRef, useState } from "react";
import { DECK } from "../../shared/deck.ts";
import type { Card, ClientCommand, QueueSettings } from "../../shared/protocol.ts";
import { ActionBar } from "./components/ActionBar.tsx";
import { Deck } from "./components/Deck.tsx";
import { ErrorSnackbar } from "./components/ErrorSnackbar.tsx";
import { Layout } from "./components/Layout.tsx";
import { ParticipantChips } from "./components/ParticipantChips.tsx";
import { QueuePanel } from "./components/QueuePanel.tsx";
import { TicketComments } from "./components/TicketComments.tsx";
import { TicketDescription } from "./components/TicketDescription.tsx";
import { TopBar } from "./components/TopBar.tsx";
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
  const projectCount = snapshot?.projects.length ?? 0;
  const onRefresh = useCallback(() => {
    dispatch({ type: "refreshQueue" });
    // An empty project list means the server's fetch failed; this is the retry without a
    // reconnect. Not sent otherwise, since the server caches the list anyway.
    // Plain send: if the socket is down, the dispatch above already showed the notice.
    if (projectCount === 0) send({ type: "refreshProjects" });
  }, [dispatch, send, projectCount]);
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
          <QueuePanel
            settings={snapshot.queueSettings}
            projects={snapshot.projects}
            boards={snapshot.boards}
            queue={snapshot.queue}
            searchResults={searchResults}
            currentKey={snapshot.ticket?.key ?? null}
            disabled={disabled}
            onChangeSettings={onChangeSettings}
            onRefresh={onRefresh}
            onPick={onPick}
            onSearch={search}
          />
        }
        center={<TicketDescription ticket={snapshot.ticket} />}
        right={<TicketComments ticket={snapshot.ticket} />}
        bottom={
          <Stack
            direction={{ xs: "column", lg: "row" }}
            spacing={2}
            sx={{ alignItems: { lg: "center" } }}
          >
            <Box sx={{ flex: { lg: "1 1 0" }, minWidth: 0 }}>
              <ParticipantChips
                players={snapshot.players}
                phase={snapshot.phase}
                meId={me?.userId ?? null}
                stats={snapshot.stats}
              />
            </Box>
            <Box sx={{ flexShrink: { lg: 0 } }}>
              <Deck
                deck={DECK}
                selected={selected}
                disabled={disabled || snapshot.phase !== "voting"}
                onSelect={onSelect}
                onClear={onClear}
              />
            </Box>
            <Box sx={{ flexShrink: { lg: 0 } }}>
              <ActionBar
                phase={snapshot.phase}
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
          </Stack>
        }
      />
    );
  }

  return (
    <>
      <TopBar connected={connected} meName={me?.username} />
      {content}
      <ErrorSnackbar error={notice} />
    </>
  );
}
