import Avatar from "@mui/material/Avatar";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { TicketComment } from "../../../shared/protocol.ts";
import { initials } from "../lib/initials.ts";
import { relativeTime } from "../lib/relativeTime.ts";
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
        <ListItem
          key={c.id}
          disableGutters
          sx={{ display: "block", borderTop: 1, borderColor: "divider", py: 1.5 }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
            <Avatar sx={{ width: 24, height: 24, fontSize: "0.7rem" }}>{initials(c.author)}</Avatar>
            <Typography variant="subtitle2" component="span">
              {c.author}
            </Typography>
            <Tooltip title={new Date(c.createdAt).toLocaleString()}>
              <Typography
                variant="caption"
                component="time"
                dateTime={c.createdAt}
                color="text.secondary"
              >
                {relativeTime(c.createdAt)}
              </Typography>
            </Tooltip>
          </Stack>
          <HtmlBody html={c.bodyHtml} />
        </ListItem>
      ))}
    </List>
  );
}
