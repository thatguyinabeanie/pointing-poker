import Link from "@mui/material/Link";
import ListItemButton from "@mui/material/ListItemButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { type MouseEvent, type ReactNode, useCallback } from "react";
import { IssueTypeIcon } from "./IssueTypeIcon.tsx";

interface Props {
  issueType: string;
  ticketKey: string;
  url: string;
  isCurrent: boolean;
  disabled: boolean;
  onPick: (key: string) => void;
  badge: ReactNode;
  secondLine: ReactNode;
}

// Shared by the queue rows and the session history rows so both look and behave the same.
export function TicketRowFrame({
  issueType,
  ticketKey,
  url,
  isCurrent,
  disabled,
  onPick,
  badge,
  secondLine,
}: Props) {
  const onClick = useCallback(() => onPick(ticketKey), [onPick, ticketKey]);
  return (
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
        <Typography component="span" color="text.secondary" sx={{ display: "flex", fontSize: 18 }}>
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
  );
}

function stopPropagation(e: MouseEvent<HTMLElement>): void {
  e.stopPropagation();
}
