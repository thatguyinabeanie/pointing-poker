import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Ticket } from "../../../shared/protocol.ts";
import { HtmlBody } from "./HtmlBody.tsx";

interface Props {
  ticket: Ticket | null;
}

export function TicketComments({ ticket }: Props) {
  if (!ticket) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography color="text.secondary">Comments appear here once a ticket is loaded.</Typography>
      </Paper>
    );
  }
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        Comments ({ticket.comments.length})
      </Typography>
      {ticket.comments.length === 0 ? (
        <Typography color="text.secondary">No comments</Typography>
      ) : (
        // Array order is display order; the server sends oldest first.
        <List disablePadding>
          {ticket.comments.map((c) => (
            <ListItem
              key={c.id}
              disableGutters
              sx={{ display: "block", borderTop: 1, borderColor: "divider", py: 1.5 }}
            >
              <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap", mb: 0.5 }}>
                <Typography variant="subtitle2" component="span">
                  {c.author}
                </Typography>
                <Typography
                  variant="caption"
                  component="time"
                  dateTime={c.createdAt}
                  color="text.secondary"
                >
                  {new Date(c.createdAt).toLocaleString()}
                </Typography>
              </Stack>
              <HtmlBody html={c.bodyHtml} />
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
}
