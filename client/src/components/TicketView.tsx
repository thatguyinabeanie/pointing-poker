import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { type ReactNode, type SyntheticEvent, useCallback, useEffect, useState } from "react";
import type { Ticket } from "../../../shared/protocol.ts";
import { HtmlBody } from "./HtmlBody.tsx";
import { IssueTypeIcon } from "./IssueTypeIcon.tsx";
import { TicketComments } from "./TicketComments.tsx";
import { TicketHistory } from "./TicketHistory.tsx";

type TabId = "description" | "comments" | "history";

const STEPS = [
  "Pick a ticket from the queue",
  "Everyone picks a card",
  "Reveal and save points to Jira",
];

function EmptyGuide() {
  return (
    <Stack
      spacing={3}
      sx={{ alignItems: "center", justifyContent: "center", textAlign: "center", py: 8, px: 2 }}
    >
      <Typography variant="h5" component="h2">
        Pick a ticket to start
      </Typography>
      <Stack component="ol" spacing={1.5} sx={{ listStyle: "none", m: 0, p: 0 }}>
        {STEPS.map((step, i) => (
          <Stack
            component="li"
            key={step}
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "center" }}
          >
            <Box
              aria-hidden
              sx={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                bgcolor: "primary.main",
                color: "primary.contrastText",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: "0.875rem",
                flexShrink: 0,
              }}
            >
              {i + 1}
            </Box>
            <Typography>{step}</Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
        {children}
      </Typography>
    </Box>
  );
}

// Display only. QueuePanel owns picking and loading tickets.
export function TicketView({ ticket }: { ticket: Ticket | null }) {
  const [tab, setTab] = useState<TabId>("description");
  const key = ticket?.key;

  // A new ticket should open on its description, not on whichever tab the last one was left on.
  // biome-ignore lint/correctness/useExhaustiveDependencies: key is the trigger, not a value read
  useEffect(() => {
    setTab("description");
  }, [key]);

  const onTabChange = useCallback((_: SyntheticEvent, value: TabId) => setTab(value), []);

  if (!ticket) {
    return (
      <Paper sx={{ p: 2 }}>
        <EmptyGuide />
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
          <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
            <Stack
              direction="row"
              spacing={0.75}
              sx={{ alignItems: "center", color: "text.secondary", flexWrap: "wrap" }}
              useFlexGap
            >
              <IssueTypeIcon type={ticket.issueType} />
              <Typography variant="body2" color="text.secondary">
                {ticket.issueType}
              </Typography>
              <Link
                href={ticket.url}
                target="_blank"
                rel="noopener noreferrer"
                variant="body2"
                sx={{ whiteSpace: "nowrap" }}
              >
                {ticket.key}
              </Link>
              <IconButton
                size="small"
                component="a"
                href={ticket.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open in Jira"
              >
                <OpenInNewIcon fontSize="inherit" />
              </IconButton>
            </Stack>
            <Typography variant="h5" component="h2" sx={{ overflowWrap: "anywhere" }}>
              {ticket.summary}
            </Typography>
          </Stack>
          <Box
            sx={{
              textAlign: "right",
              flexShrink: 0,
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              px: 1.5,
              py: 0.5,
            }}
          >
            <Typography variant="caption" color="text.secondary" component="div">
              Current points
            </Typography>
            <Typography variant="h5" component="div">
              {ticket.currentPoints ?? "–"}
              <Typography variant="caption" color="text.secondary" component="span">
                {" "}
                pts
              </Typography>
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={4} useFlexGap sx={{ flexWrap: "wrap" }}>
          <Field label="Status">{ticket.status}</Field>
          {ticket.priority ? <Field label="Priority">{ticket.priority}</Field> : null}
          <Field label="Assignee">{ticket.assignee ?? "Unassigned"}</Field>
          {ticket.labels.length > 0 ? (
            <Field label="Labels">{ticket.labels.join(", ")}</Field>
          ) : null}
        </Stack>

        <Tabs value={tab} onChange={onTabChange} sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tab value="description" label="Description" />
          <Tab
            value="comments"
            label={
              <Badge
                badgeContent={ticket.comments.length}
                color="primary"
                showZero
                sx={{ "& .MuiBadge-badge": { right: -16 } }}
              >
                Comments
              </Badge>
            }
            sx={{ pr: 4 }}
          />
          <Tab value="history" label="History" />
        </Tabs>

        {tab === "description" ? (
          ticket.descriptionHtml ? (
            <HtmlBody html={ticket.descriptionHtml} />
          ) : (
            <Typography color="text.secondary">No description</Typography>
          )
        ) : tab === "comments" ? (
          <TicketComments comments={ticket.comments} />
        ) : (
          <TicketHistory history={ticket.history} truncated={ticket.historyTruncated} />
        )}
      </Stack>
    </Paper>
  );
}
