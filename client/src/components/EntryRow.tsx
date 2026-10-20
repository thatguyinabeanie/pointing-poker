import Avatar from "@mui/material/Avatar";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { initials } from "../lib/initials.ts";
import { relativeTime } from "../lib/relativeTime.ts";

// Shared by the comments and history lists so the two look alike.
export function EntryRow({
  author,
  createdAt,
  children,
}: {
  author: string;
  createdAt: string;
  children: ReactNode;
}) {
  return (
    <ListItem
      disableGutters
      sx={{ display: "block", borderTop: 1, borderColor: "divider", py: 1.5 }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
        <Avatar sx={{ width: 24, height: 24, fontSize: "0.7rem" }}>{initials(author)}</Avatar>
        <Typography variant="subtitle2" component="span">
          {author}
        </Typography>
        <Tooltip title={new Date(createdAt).toLocaleString()}>
          <Typography
            variant="caption"
            component="time"
            dateTime={createdAt}
            color="text.secondary"
          >
            {relativeTime(createdAt)}
          </Typography>
        </Tooltip>
      </Stack>
      {children}
    </ListItem>
  );
}
