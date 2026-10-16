import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { HEADER_HEIGHT } from "./layoutConstants.ts";

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
        // Below sm the controls need about 270px, which does not fit beside the status in one
        // row at 320px, so the header grows to two rows (status above, controls below).
        // From sm up it is the fixed single row. Layout only uses HEADER_HEIGHT at lg and up.
        height: { xs: "auto", sm: HEADER_HEIGHT },
        minHeight: HEADER_HEIGHT,
        boxSizing: "border-box",
        px: 2,
        py: { xs: 0.5, sm: 0 },
        display: "grid",
        // Below md the title is hidden, so the controls take all the free width. From md the
        // auto center column keeps the title centered whatever width the side columns take.
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          sm: "minmax(0, 1fr) auto",
          md: "1fr auto 1fr",
        },
        alignItems: "center",
        columnGap: 2,
        rowGap: 0.5,
        bgcolor: (theme) => theme.palette.grey[50],
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      {/* minWidth 0 lets the controls shrink instead of widening the grid and pushing the title. */}
      <Box
        sx={{
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gridRow: { xs: 2, sm: 1 },
        }}
      >
        {controls}
      </Box>
      <Typography
        variant="subtitle1"
        component="h1"
        sx={{ fontWeight: 600, display: { xs: "none", md: "block" } }}
      >
        Pointing Poker
      </Typography>
      <Box
        sx={{
          gridColumn: { xs: 1, sm: 2, md: 3 },
          gridRow: 1,
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
