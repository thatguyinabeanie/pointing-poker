import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import type { ReactNode } from "react";
import { HEADER_HEIGHT } from "./layoutConstants.ts";

interface Props {
  left: ReactNode;
  main: ReactNode;
  bottom: ReactNode;
}

// Fixed heights (px) at lg and up. The header height comes from layoutConstants. The bottom bar is
// fixed so the pane height is a plain calc() with no measuring; the bar scrolls inside itself
// if its content outgrows it. Below lg everything stacks and the page scrolls.
const BOTTOM_BAR_HEIGHT = 88;
const PAGE_TOP_PADDING = 16;
const BAR_GAP = 16;
const PANE_MAX_HEIGHT = `calc(100vh - ${HEADER_HEIGHT}px - ${BOTTOM_BAR_HEIGHT}px - ${PAGE_TOP_PADDING + BAR_GAP}px)`;

// Below lg the pane simply grows. At lg+ each pane scrolls on its own.
function Pane({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box
      component="section"
      aria-label={label}
      sx={{ maxHeight: { lg: PANE_MAX_HEIGHT }, overflowY: { lg: "auto" } }}
    >
      {children}
    </Box>
  );
}

// Pure layout: no state, no data. The bottom bar is a sibling of the Grid, not a Grid item,
// because position: sticky only works inside a parent that is taller than the sticky element.
export function Layout({ left, main, bottom }: Props) {
  return (
    <Container
      maxWidth={false}
      sx={{
        px: { xs: 2, lg: 3 },
        pt: `${PAGE_TOP_PADDING}px`,
        pb: { xs: 2, lg: 0 },
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        // Fills the viewport under the header so the sticky bar rests at the bottom edge
        // even when the panes are short.
        minHeight: { lg: `calc(100vh - ${HEADER_HEIGHT}px)` },
      }}
    >
      <Grid container spacing={2} sx={{ flexGrow: 1, alignContent: "flex-start" }}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Pane label="Ticket queue">{left}</Pane>
        </Grid>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Pane label="Ticket">{main}</Pane>
        </Grid>
      </Grid>
      <Paper
        elevation={4}
        square
        sx={{
          mt: `${BAR_GAP}px`,
          p: 1.5,
          position: { xs: "static", lg: "sticky" },
          bottom: 0,
          zIndex: (theme) => theme.zIndex.appBar,
          boxSizing: "border-box",
          height: { lg: BOTTOM_BAR_HEIGHT },
          overflowY: { lg: "auto" },
        }}
      >
        {bottom}
      </Paper>
    </Container>
  );
}
