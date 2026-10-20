import List from "@mui/material/List";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { TicketHistoryChange, TicketHistoryEntry } from "../../../shared/protocol.ts";
import { EntryRow } from "./EntryRow.tsx";

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
          {/* An empty side is a plain span: <del> or <ins> around the placeholder would make
              screen readers announce a deletion or insertion of nothing. */}
          <Typography
            component={change.from === null ? "span" : "del"}
            variant="body2"
            color="text.secondary"
            sx={{ textDecoration: change.from === null ? "none" : "line-through" }}
          >
            {change.from ?? "–"}
          </Typography>{" "}
          →{" "}
          <Typography
            component={change.to === null ? "span" : "ins"}
            variant="body2"
            sx={{ textDecoration: "none" }}
          >
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
          <EntryRow key={entry.id} author={entry.author} createdAt={entry.createdAt}>
            <Stack spacing={0.25}>
              {entry.changes.map((change, i) => (
                // Changes have no id of their own; they never reorder within an entry.
                // biome-ignore lint/suspicious/noArrayIndexKey: stable, static list
                <ChangeLine key={`${change.field}-${i}`} change={change} />
              ))}
            </Stack>
          </EntryRow>
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
