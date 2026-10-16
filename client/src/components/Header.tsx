import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

// Layout reserves this much vertical space for the header, so the two must agree.
export const HEADER_HEIGHT = 48;

interface Props {
  connected: boolean;
  meName?: string;
  controls?: ReactNode;
}

export function Header({ connected, meName, controls }: Props) {
  const status = connected ? "Connected" : "Reconnecting…";
  return (
    <Box
      component="header"
      sx={{
        height: HEADER_HEIGHT,
        boxSizing: "border-box",
        px: 2,
        display: "grid",
        // The auto center column keeps the title centered whatever width the side columns take.
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: 2,
        bgcolor: (theme) => theme.palette.grey[50],
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      {/* minWidth 0 lets the controls shrink instead of widening the grid and pushing the title. */}
      <Box sx={{ minWidth: 0, display: "flex", alignItems: "center" }}>{controls}</Box>
      <Typography
        variant="subtitle1"
        component="h1"
        sx={{ fontWeight: 600, display: { xs: "none", md: "block" } }}
      >
        Pointing Poker
      </Typography>
      <Box
        sx={{
          gridColumn: 3,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 1,
        }}
      >
        <Tooltip title={status}>
          <Box
            role="img"
            aria-label={status}
            sx={{
              width: 8,
              height: 8,
              flexShrink: 0,
              borderRadius: "50%",
              bgcolor: connected ? "success.main" : "warning.main",
            }}
          />
        </Tooltip>
        {/* The dot's color is never the only signal: the disconnected state also says so in text. */}
        {connected ? null : (
          <Typography variant="body2" color="text.secondary" noWrap>
            Reconnecting…
          </Typography>
        )}
        {meName ? (
          <Typography variant="body2" noWrap>
            {meName}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}
