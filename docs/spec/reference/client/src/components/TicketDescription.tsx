import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Ticket } from "../../../shared/protocol.ts";
import { HtmlBody } from "./HtmlBody.tsx";

interface Props {
  ticket: Ticket | null;
}

// Display only. QueuePanel owns picking and loading tickets.
export function TicketDescription({ ticket }: Props) {
  if (!ticket) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography color="text.secondary">
          Pick a ticket from the queue or search to start pointing.
        </Typography>
      </Paper>
    );
  }
  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack
          direction="row"
          useFlexGap
          spacing={1}
          sx={{ alignItems: "baseline", flexWrap: "wrap" }}
        >
          <Link
            href={ticket.url}
            target="_blank"
            rel="noopener noreferrer"
            variant="h6"
            sx={{ whiteSpace: "nowrap" }}
          >
            {ticket.key}
          </Link>
          <Typography variant="h6" component="h2" sx={{ overflowWrap: "anywhere" }}>
            {ticket.summary}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<OpenInNewIcon />}
            component="a"
            href={ticket.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Jira
          </Button>
        </Stack>

        <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }}>
          <Chip size="small" label={ticket.issueType} />
          <Chip size="small" label={ticket.status} />
          {ticket.priority && <Chip size="small" label={ticket.priority} />}
          <Chip size="small" label={ticket.assignee ?? "Unassigned"} />
          <Chip size="small" label={`Current: ${ticket.currentPoints ?? "unset"} pts`} />
          {ticket.labels.map((label) => (
            <Chip key={label} size="small" variant="outlined" label={label} />
          ))}
        </Stack>

        <Divider />

        <div>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, mb: 1 }}>
            Description
          </Typography>
          {ticket.descriptionHtml ? (
            <HtmlBody html={ticket.descriptionHtml} />
          ) : (
            <Typography color="text.secondary">No description</Typography>
          )}
        </div>
      </Stack>
    </Paper>
  );
}
