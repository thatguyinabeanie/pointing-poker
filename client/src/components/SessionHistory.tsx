import List from "@mui/material/List";
import Typography from "@mui/material/Typography";
import type { SessionHistoryEntry } from "../../../shared/protocol.ts";
import { relativeTime } from "../lib/relativeTime.ts";
import { TicketRowFrame } from "./TicketRowFrame.tsx";

interface Props {
  history: SessionHistoryEntry[];
  currentKey: string | null;
  disabled: boolean;
  onPick: (key: string) => void;
}

export function SessionHistory({ history, currentKey, disabled, onPick }: Props) {
  if (history.length === 0) {
    return <Typography color="text.secondary">Nothing pointed yet in this room.</Typography>;
  }
  return (
    <List dense disablePadding>
      {history.map((entry) => (
        <TicketRowFrame
          key={entry.key}
          issueType={entry.issueType}
          ticketKey={entry.key}
          url={entry.url}
          isCurrent={entry.key === currentKey}
          disabled={disabled}
          onPick={onPick}
          badge={entry.savedPoints ?? "–"}
          // The row shows no summary, so it goes in the hover title with the (possibly clipped) detail.
          secondLine={
            <span title={`${entry.summary}\n${detailLine(entry)}`}>{detailLine(entry)}</span>
          }
        />
      ))}
    </List>
  );
}

function detailLine(entry: SessionHistoryEntry): string {
  const parts: string[] = [];
  // A null average means only non-numeric votes, so there are no numbers to show.
  if (entry.average !== null) {
    parts.push(`avg ${entry.average}`);
    if (entry.consensus) parts.push("consensus");
    else if (entry.min !== null && entry.max !== null) parts.push(`${entry.min}–${entry.max}`);
  }
  if (entry.revoted) parts.push("re-voted");
  if (entry.savedPoints !== null) parts.push("✓ saved");
  parts.push(relativeTime(entry.revealedAt));
  return parts.join(" · ");
}
