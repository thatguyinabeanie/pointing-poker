import List from "@mui/material/List";
import Typography from "@mui/material/Typography";
import type { TicketComment } from "../../../shared/protocol.ts";
import { EntryRow } from "./EntryRow.tsx";
import { HtmlBody } from "./HtmlBody.tsx";

// List only. TicketView owns the surrounding Paper and the tab heading.
export function TicketComments({ comments }: { comments: TicketComment[] }) {
  if (comments.length === 0) {
    return <Typography color="text.secondary">No comments</Typography>;
  }
  // Array order is display order; the server sends oldest first.
  return (
    <List disablePadding>
      {comments.map((c) => (
        <EntryRow key={c.id} author={c.author} createdAt={c.createdAt}>
          <HtmlBody html={c.bodyHtml} />
        </EntryRow>
      ))}
    </List>
  );
}
