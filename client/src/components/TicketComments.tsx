import Avatar from "@mui/material/Avatar";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { TicketComment } from "../../../shared/protocol.ts";
import { initials } from "../lib/initials.ts";
import { HtmlBody } from "./HtmlBody.tsx";

const relative = new Intl.RelativeTimeFormat("en", { style: "narrow" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

// Narrow style renders "2d ago"; the "ago" is dropped so the label stays short beside the author.
// Anything under a minute, or dated in the future by clock skew, reads "just now".
function relativeTime(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(seconds)) return "";
  for (const [unit, size] of UNITS) {
    if (seconds >= size) {
      return relative.format(-Math.floor(seconds / size), unit).replace(/\s*ago$/, "");
    }
  }
  return "just now";
}

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
