import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { HEADER_HEIGHT } from "./layoutConstants.ts";

interface Props {
  connected: boolean;
  meName?: string;
  controls?: ReactNode;
  // Room switches, shown on the right before the status dot. They moved out of `controls` so
  // the left column holds only the queue selects (decision 50).
  actions?: ReactNode;
}

export function Header({ connected, meName, controls, actions }: Props) {
  const status = connected ? "Connected" : "Reconnecting…";
  return (
    <Box
      component="header"
      sx={{
        // One row needs about 1060px: the queue controls take 484px (three 140px selects and
        // Refresh), the title 132px, and the switches, status dot and name about 380px, plus
        // padding and gaps. Below lg it therefore wraps to two rows: the controls on row 1, the
        // switches, status and name on row 2. Layout only uses HEADER_HEIGHT at lg and up, so
        // the taller header below lg needs nothing else.
        height: { xs: "auto", lg: HEADER_HEIGHT },
        minHeight: HEADER_HEIGHT,
        boxSizing: "border-box",
        px: 2,
        // 8px above and below the auto-height rows, like the fixed row, so floating labels fit.
        py: { xs: 1, lg: 0 },
        display: "grid",
        // From lg the auto center column keeps the title centered whatever width the sides take.
        gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "1fr auto 1fr" },
        alignItems: "center",
        columnGap: 2,
        rowGap: 0.5,
        bgcolor: (theme) => theme.palette.grey[50],
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      {/* minWidth 0 lets the controls shrink instead of widening the grid and pushing the title. */}
      <Box sx={{ minWidth: 0, display: "flex", alignItems: "center", gridRow: 1 }}>{controls}</Box>
      {/* Hidden below lg, where the two rows leave no centered slot for it. */}
      <Typography
        variant="subtitle1"
        component="h1"
        sx={{ fontWeight: 600, display: { xs: "none", lg: "block" } }}
      >
        Pointing Poker
      </Typography>
      <Box
        sx={{
          gridColumn: { xs: 1, lg: 3 },
          gridRow: { xs: 2, lg: 1 },
          minWidth: 0,
          display: "flex",
          // At phone width the two switches and the name do not fit one line.
          flexWrap: { xs: "wrap", lg: "nowrap" },
          alignItems: "center",
          justifyContent: "flex-end",
          columnGap: 1,
        }}
      >
        {actions ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              columnGap: 1,
              flexWrap: { xs: "wrap", lg: "nowrap" },
              flexShrink: { xs: 1, lg: 0 },
            }}
          >
            {actions}
          </Box>
        ) : null}
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
