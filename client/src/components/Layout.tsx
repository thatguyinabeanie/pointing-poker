import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import type { ReactNode } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { readJson, removeItem, writeJson } from "../storage.ts";
import { HEADER_HEIGHT } from "./layoutConstants.ts";
import { ResizeHandle } from "./ResizeHandle.tsx";

interface Props {
  left: ReactNode;
  main: ReactNode;
  bottom: ReactNode;
}

// Heights (px) at lg and up. The header height comes from layoutConstants. The bottom bar sizes to
// its content (so a second row of players is never hidden); Layout measures it into a CSS variable
// that the pane max-height reads, and the bar is capped at about two player rows and scrolls
// beyond that. Below lg everything stacks and the page scrolls.
const BOTTOM_BAR_FALLBACK_HEIGHT = 88;
const BOTTOM_BAR_MAX_HEIGHT = 140;
const BOTTOM_BAR_HEIGHT_VAR = "--bottom-bar-height";
const PAGE_TOP_PADDING = 16;
const BAR_GAP = 16;
const PANE_MAX_HEIGHT = `calc(100vh - ${HEADER_HEIGHT}px - var(${BOTTOM_BAR_HEIGHT_VAR}, ${BOTTOM_BAR_FALLBACK_HEIGHT}px) - ${PAGE_TOP_PADDING + BAR_GAP}px)`;

// The tickets pane (Queue and History) is one third of the row by default (the old lg 4/12 split), never narrower than
// the minimum, never wider than half the row. The viewer's choice is stored in px and clamped
// again on every render, so a stored value from a wider window cannot overflow a narrow one.
const QUEUE_WIDTH_KEY = "pp.layout.queueWidth";
const QUEUE_MIN_WIDTH = 260;
const QUEUE_DEFAULT_FRACTION = 1 / 3;
const QUEUE_MAX_FRACTION = 1 / 2;

function validateWidth(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

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

// Holds only the queue width; no data. The bottom bar is a sibling of the row, not inside it,
// because position: sticky only works inside a parent that is taller than the sticky element.
export function Layout({ left, main, bottom }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [rowWidth, setRowWidth] = useState(0);
  // null means "use the default"; a number is the viewer's saved or in-progress choice.
  const [chosen, setChosen] = useState<number | null>(() =>
    readJson("local", QUEUE_WIDTH_KEY, validateWidth),
  );

  // Layout effect so the first paint already has the measured width and the pane does not jump.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    setRowWidth(row.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setRowWidth(entry.contentRect.width));
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  // Publish the bar's rendered height as a CSS variable on the container so the pane max-height
  // shrinks to match. Written straight to the style so a bar resize does not re-render the tree.
  useLayoutEffect(() => {
    const bar = barRef.current;
    const container = containerRef.current;
    if (!bar || !container) return;
    const publish = () =>
      container.style.setProperty(
        BOTTOM_BAR_HEIGHT_VAR,
        `${Math.round(bar.getBoundingClientRect().height)}px`,
      );
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  // On a very narrow row the max could fall below the min; the min wins.
  const maxWidth = Math.max(QUEUE_MIN_WIDTH, Math.round(rowWidth * QUEUE_MAX_FRACTION));
  const defaultWidth = Math.min(
    maxWidth,
    Math.max(QUEUE_MIN_WIDTH, Math.round(rowWidth * QUEUE_DEFAULT_FRACTION)),
  );
  const queueWidth = Math.min(maxWidth, Math.max(QUEUE_MIN_WIDTH, chosen ?? defaultWidth));

  const commit = useCallback((px: number) => {
    setChosen(px);
    writeJson("local", QUEUE_WIDTH_KEY, px);
  }, []);
  const reset = useCallback(() => {
    setChosen(null);
    removeItem("local", QUEUE_WIDTH_KEY);
  }, []);

  return (
    <Container
      ref={containerRef}
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
      <Box
        ref={rowRef}
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: { xs: "column", lg: "row" },
          alignItems: { lg: "flex-start" },
          // Stacked below lg, where there is no handle to provide the gap.
          gap: { xs: 2, lg: 0 },
        }}
      >
        <Box
          sx={{
            // Before the first measurement fall back to the old 4/12 share so nothing flashes.
            width: { lg: rowWidth > 0 ? queueWidth : "33.333%" },
            flex: { lg: "none" },
            minWidth: 0,
          }}
        >
          <Pane label="Tickets">{left}</Pane>
        </Box>
        <Box sx={{ display: { xs: "none", lg: "flex" }, alignSelf: "stretch" }}>
          <ResizeHandle
            width={queueWidth}
            min={QUEUE_MIN_WIDTH}
            max={maxWidth}
            rowWidth={rowWidth}
            onPreview={setChosen}
            onCommit={commit}
            onReset={reset}
          />
        </Box>
        <Box sx={{ flex: { lg: 1 }, minWidth: 0, width: { xs: "100%", lg: "auto" } }}>
          <Pane label="Ticket">{main}</Pane>
        </Box>
      </Box>
      <Paper
        ref={barRef}
        elevation={4}
        square
        sx={{
          mt: `${BAR_GAP}px`,
          p: 1.5,
          position: { xs: "static", lg: "sticky" },
          bottom: 0,
          zIndex: (theme) => theme.zIndex.appBar,
          boxSizing: "border-box",
          minHeight: { lg: BOTTOM_BAR_FALLBACK_HEIGHT },
          maxHeight: { lg: BOTTOM_BAR_MAX_HEIGHT },
          overflowY: { lg: "auto" },
        }}
      >
        {bottom}
      </Paper>
    </Container>
  );
}
