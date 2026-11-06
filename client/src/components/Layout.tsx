import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import type { ReactNode } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { readJson, removeItem, writeJson } from "../storage.ts";
import { HEADER_HEIGHT } from "./layoutConstants.ts";
import { ResizeHandle } from "./ResizeHandle.tsx";

interface Props {
  left: ReactNode;
  main: ReactNode;
  floating: ReactNode;
}

// The floating group (the hand and the results pill) is fixed to the bottom of the window, so it
// takes no space in the page. Layout measures it into a CSS variable. Each pane pads its bottom
// by that height, so the last line of a long ticket scrolls clear of the group. The panes' own
// max-height stops at the header and the top padding, because the group floats over their bottom
// edge.
const FLOATING_HEIGHT_VAR = "--floating-height";
// The group's horizontal center, in px from the window's left edge, published at lg and up.
const FLOATING_CENTER_VAR = "--floating-center";
// The least room kept between the floating group and either side of the window.
const FLOATING_EDGE = 16;
const PAGE_TOP_PADDING = 16;
const PANE_MAX_HEIGHT = `calc(100vh - ${HEADER_HEIGHT}px - ${PAGE_TOP_PADDING}px)`;

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
      sx={{
        maxHeight: { lg: PANE_MAX_HEIGHT },
        overflowY: { lg: "auto" },
        // Only at lg, where each pane scrolls alone. Below lg the panes stack, so padding both
        // would leave a gap between them; the page container pads its end instead.
        boxSizing: "border-box",
        paddingBottom: { lg: `var(${FLOATING_HEIGHT_VAR}, 0px)` },
      }}
    >
      {children}
    </Box>
  );
}

// Holds only the queue width; no data.
export function Layout({ left, main, floating }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ticketColumnRef = useRef<HTMLDivElement>(null);
  const floatingRef = useRef<HTMLDivElement>(null);
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

  // Publish the floating group's rendered height so the panes can pad their bottoms to match, and
  // its center. Written straight to the style so a resize does not re-render the tree.
  //
  // At lg the group centers on the Ticket column, not the window. The column's box changes size
  // whenever the resize handle or the window moves it, so observing it keeps the group in place.
  // The center is clamped so the whole group stays FLOATING_EDGE inside the window: centered on a
  // right-hand column at 1300px, the revealed pill ran past the right edge. Below lg the CSS
  // falls back to 50% of the window.
  useLayoutEffect(() => {
    const floatingBox = floatingRef.current;
    const column = ticketColumnRef.current;
    const container = containerRef.current;
    if (!floatingBox || !column || !container) return;
    const publish = () => {
      const group = floatingBox.getBoundingClientRect();
      container.style.setProperty(FLOATING_HEIGHT_VAR, `${Math.round(group.height)}px`);
      const rect = column.getBoundingClientRect();
      const viewport = window.innerWidth;
      const min = group.width / 2 + FLOATING_EDGE;
      const max = viewport - group.width / 2 - FLOATING_EDGE;
      // Wider than the window minus both edges: no center keeps it inside, so use the middle.
      const center =
        min > max ? viewport / 2 : Math.min(max, Math.max(min, rect.left + rect.width / 2));
      container.style.setProperty(FLOATING_CENTER_VAR, `${Math.round(center)}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(floatingBox);
    observer.observe(column);
    window.addEventListener("resize", publish);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
    };
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
        // Below lg the page scrolls, so its end clears the floating group. At lg the panes do it.
        pb: { xs: `calc(16px + var(${FLOATING_HEIGHT_VAR}, 0px))`, lg: 0 },
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
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
        <Box
          ref={ticketColumnRef}
          sx={{ flex: { lg: 1 }, minWidth: 0, width: { xs: "100%", lg: "auto" } }}
        >
          <Pane label="Ticket">{main}</Pane>
        </Box>
      </Box>
      <Box
        ref={floatingRef}
        sx={{
          position: "fixed",
          bottom: 0,
          left: { xs: "50%", lg: `var(${FLOATING_CENTER_VAR}, 50%)` },
          transform: "translateX(-50%)",
          zIndex: (theme) => theme.zIndex.appBar,
          // A fixed box with left and translateX(-50%) shrink-to-fits into only the space to the
          // right of left, so a group centered far right wrapped the deck onto two rows.
          width: "max-content",
          maxWidth: "100vw",
          // The box spans the group's width but is mostly empty; clicks on the empty parts must
          // reach the ticket beneath. The children opt back in.
          pointerEvents: "none",
          "& > *": { pointerEvents: "auto" },
        }}
      >
        {floating}
      </Box>
    </Container>
  );
}
