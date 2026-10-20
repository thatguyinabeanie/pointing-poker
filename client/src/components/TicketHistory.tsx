import Avatar from "@mui/material/Avatar";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { TicketHistoryChange, TicketHistoryEntry } from "../../../shared/protocol.ts";
import { initials } from "../lib/initials.ts";
import { relativeTime } from "../lib/relativeTime.ts";

// Jira values are plain text and can be long (summaries, labels), so they wrap instead of
// stretching the pane. They are React text children only, never HTML.
function ChangeLine({ change }: { change: TicketHistoryChange }) {
  return (
    <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
      <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
        {change.field}
      </Typography>
      {change.edited ? (
        <Typography component="span" variant="body2" color="text.secondary">
          {" "}
          edited
        </Typography>
      ) : (
        <>
          {" "}
          <Typography
            component="span"
            variant="body2"
            color="text.secondary"
            sx={{ textDecoration: change.from === null ? "none" : "line-through" }}
          >
            {change.from ?? "–"}
          </Typography>{" "}
          →{" "}
          <Typography component="span" variant="body2">
            {change.to ?? "–"}
          </Typography>
        </>
      )}
    </Typography>
  );
}

// List only. TicketView owns the surrounding Paper and the tab heading.
export function TicketHistory({
  history,
  truncated,
}: {
  history: TicketHistoryEntry[];
  truncated: boolean;
}) {
  if (history.length === 0) {
    return <Typography color="text.secondary">No history</Typography>;
  }
  // Array order is display order; the server sends newest first.
  return (
    <>
      <List disablePadding>
        {history.map((entry) => (
          <ListItem
            key={entry.id}
            disableGutters
            sx={{ display: "block", borderTop: 1, borderColor: "divider", py: 1.5 }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
              <Avatar sx={{ width: 24, height: 24, fontSize: "0.7rem" }}>
                {initials(entry.author)}
              </Avatar>
              <Typography variant="subtitle2" component="span">
                {entry.author}
              </Typography>
              <Tooltip title={new Date(entry.createdAt).toLocaleString()}>
                <Typography
                  variant="caption"
                  component="time"
                  dateTime={entry.createdAt}
                  color="text.secondary"
                >
                  {relativeTime(entry.createdAt)}
                </Typography>
              </Tooltip>
            </Stack>
            <Stack spacing={0.25}>
              {entry.changes.map((change, i) => (
                // Changes have no id of their own; they never reorder within an entry.
                // biome-ignore lint/suspicious/noArrayIndexKey: stable, static list
                <ChangeLine key={`${change.field}-${i}`} change={change} />
              ))}
            </Stack>
          </ListItem>
        ))}
      </List>
      {truncated ? (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ pt: 1 }}>
          Showing the latest 100 changes
        </Typography>
      ) : null}
    </>
  );
}
