import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import Stack from "@mui/material/Stack";
import { alpha } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { type MouseEvent, type ReactNode, useCallback } from "react";
import type { QueueEpic } from "../../../shared/protocol.ts";
import { epicHex } from "../lib/epicColors.ts";
import { IssueTypeIcon } from "./IssueTypeIcon.tsx";

interface Props {
  issueType: string;
  ticketKey: string;
  url: string;
  isCurrent: boolean;
  disabled: boolean;
  onPick: (key: string) => void;
  badge: ReactNode;
  epic?: QueueEpic | null;
  secondLine: ReactNode;
}

// Shared by the queue rows and the session history rows so both look and behave the same.
// The root is an `li` (ListItem) because both callers render it inside a `List` (`ul`); the
// ListItemButton inside it is the interactive row. Without the `li`, assistive technology
// would not announce the entries as list items or give their position.
export function TicketRowFrame({
  issueType,
  ticketKey,
  url,
  isCurrent,
  disabled,
  onPick,
  badge,
  epic,
  secondLine,
}: Props) {
  const onClick = useCallback(() => onPick(ticketKey), [onPick, ticketKey]);
  // Computed for every row, but only read when there is an epic. A null epic gives the gray.
  const epicColor = epicHex(epic?.color ?? null);
  return (
    <ListItem disablePadding>
      <ListItemButton
        divider
        selected={isCurrent}
        // The current ticket is already loaded, so its row is not an action.
        disabled={disabled && !isCurrent}
        onClick={isCurrent ? undefined : onClick}
        aria-current={isCurrent ? "true" : undefined}
        sx={{
          display: "block",
          py: 0.75,
          borderLeft: 3,
          borderLeftColor: isCurrent ? "primary.main" : "transparent",
          cursor: isCurrent ? "default" : undefined,
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography
            component="span"
            color="text.secondary"
            sx={{ display: "flex", fontSize: 18 }}
          >
            <IssueTypeIcon type={issueType} />
          </Typography>
          {/* Stop propagation so opening Jira does not also point the ticket. */}
          <Link
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stopPropagation}
            variant="body2"
            sx={{ fontWeight: 600 }}
          >
            {ticketKey}
          </Link>
          {epic ? (
            // No click handler: a click loads the ticket like the rest of the row. minWidth 0
            // plus maxWidth let a long name truncate so the key and the status badge stay visible.
            <Stack
              direction="row"
              title={epic.name || epic.key}
              sx={{
                alignItems: "center",
                gap: 0.5,
                minWidth: 0,
                maxWidth: "50%",
                px: 0.75,
                // The tint keeps the chip visible on the white row. The outline is an inset
                // shadow, not a border, so a row with a chip stays as tall as one without (a real
                // border made it 2px taller).
                bgcolor: alpha(epicColor, 0.12),
                boxShadow: `inset 0 0 0 1px ${alpha(epicColor, 0.5)}`,
                borderRadius: 1,
              }}
            >
              <Box
                component="span"
                sx={{
                  flexShrink: 0,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: epicColor,
                }}
              />
              <Typography variant="caption" noWrap sx={{ minWidth: 0 }}>
                {epic.name || epic.key}
              </Typography>
            </Stack>
          ) : null}
          <Typography
            component="span"
            variant="caption"
            sx={{
              ml: "auto !important",
              px: 0.75,
              borderRadius: 1,
              bgcolor: "action.hover",
              color: "text.secondary",
              whiteSpace: "nowrap",
            }}
          >
            {badge}
          </Typography>
        </Stack>
        <Typography variant="body2" noWrap sx={{ mt: 0.25 }}>
          {secondLine}
        </Typography>
      </ListItemButton>
    </ListItem>
  );
}

function stopPropagation(e: MouseEvent<HTMLElement>): void {
  e.stopPropagation();
}
