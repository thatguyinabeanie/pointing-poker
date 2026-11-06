import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import { alpha, type SxProps, type Theme } from "@mui/material/styles";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { readJson, removeItem, writeJson } from "../storage.ts";
import { HEADER_HEIGHT, STRIP_HEIGHT } from "./layoutConstants.ts";
import { ResizeHandle } from "./ResizeHandle.tsx";

interface Props {
  left: ReactNode;
  main: ReactNode;
  floating: ReactNode;
}

// The floating group (the hand and the results pill) is fixed to the bottom of the window, so it
// takes no space in the page. Layout measures it into a CSS variable. Each pane's card ends in a
// spacer of that height plus the fade, so the last line of a long ticket scrolls clear of the
// group. The panes' height stops at the header and the top padding, because the group floats over
// their bottom edge.
const FLOATING_HEIGHT_VAR = "--floating-height";
// The group's horizontal center, in px from the window's left edge, published at lg and up.
const FLOATING_CENTER_VAR = "--floating-center";
// The Ticket column's left edge and width, published at lg and up for the fade band.
const TICKET_LEFT_VAR = "--ticket-left";
const TICKET_WIDTH_VAR = "--ticket-width";
// The least room kept between the floating group and either side of the window.
const FLOATING_EDGE = 16;
// How far above the floating group the fade band starts. Text fades out over this distance
// instead of running up against the cards and the pill.
const FADE_HEIGHT = 24;
const PAGE_TOP_PADDING = 16;
const PANE_HEIGHT = `calc(100vh - ${HEADER_HEIGHT}px - ${PAGE_TOP_PADDING}px)`;

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
//
// Full height at lg (user ruling, 11/06/2026): a pane that stopped where its content ended left a
// blank page under a short queue or ticket, which the old bottom bar used to hide. So the pane is
// a fixed-height flex column and its last child, the Paper that draws the card's edge (LeftPanel's
// or TicketView's, under the players strip), grows to the bottom of the window.
//
// The room for the floating group is a spacer at the end of that Paper, not padding on the pane.
// Padding on the pane would end the Paper above the group, leaving the blank strip back under it.
// Below lg the panes stack, so a spacer in both would leave a gap between them; the page container
// pads its end instead.
//
// Scroll padding: scrolling a focused element into view stops at the pane's edge, so a focused
// link could land under the floating group at the bottom, or under a sticky header at the top
// (`stickyTop`, the players strip in the Ticket pane), and be hidden (WCAG 2.4.11). The padding
// makes the browser stop short of both.
const PANE_SX: SxProps<Theme> = (theme) => ({
  [theme.breakpoints.up("lg")]: {
    height: PANE_HEIGHT,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    scrollPaddingBottom: `var(${FLOATING_HEIGHT_VAR}, 0px)`,
    // A variable, so this sx is built once for both panes.
    scrollPaddingTop: "var(--sticky-top, 0px)",
    // Grows, never shrinks, so a long ticket still scrolls instead of being squeezed.
    "& > :last-child": { flex: "1 0 auto" },
    "& > :last-child::after": {
      content: '""',
      display: "block",
      height: `calc(var(${FLOATING_HEIGHT_VAR}, 0px) + ${FADE_HEIGHT}px)`,
    },
  },
});

function Pane({
  label,
  stickyTop = 0,
  children,
}: {
  label: string;
  stickyTop?: number;
  children: ReactNode;
}) {
  return (
    <Box
      component="section"
      aria-label={label}
      style={{ "--sticky-top": `${stickyTop}px` } as CSSProperties}
      sx={PANE_SX}
    >
      {children}
    </Box>
  );
}

// The fade band (user ruling, 11/06/2026). With nothing behind them, the hand and the pill floated
// over the ticket text, which ran right up to them and looked cluttered. The band fades the text
// out over FADE_HEIGHT and is solid behind the group. At lg it spans the Ticket column, the one
// the group is centered on; below lg the window. It shares the group's zIndex and comes first in
// the DOM, so it paints above the panes but under the group, and under the app bar's menus. It
// never takes a click.
const FADE_BAND_SX: SxProps<Theme> = (theme) => ({
  position: "fixed",
  bottom: 0,
  left: { xs: 0, lg: `var(${TICKET_LEFT_VAR}, 0px)` },
  width: { xs: "100%", lg: `var(${TICKET_WIDTH_VAR}, 100%)` },
  height: `calc(var(${FLOATING_HEIGHT_VAR}, 0px) + ${FADE_HEIGHT}px)`,
  zIndex: theme.zIndex.appBar,
  pointerEvents: "none",
  background: `linear-gradient(to bottom, ${alpha(theme.palette.background.paper, 0)}, ${theme.palette.background.paper} ${FADE_HEIGHT}px)`,
});

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
      const height = `${Math.round(group.height)}px`;
      container.style.setProperty(FLOATING_HEIGHT_VAR, height);
      // Below lg the page itself scrolls, and html cannot read the Container's variable, so the
      // focus scroll padding (see Pane) is written to html directly.
      document.documentElement.style.scrollPaddingBottom = height;
      const rect = column.getBoundingClientRect();
      container.style.setProperty(TICKET_LEFT_VAR, `${Math.round(rect.left)}px`);
      container.style.setProperty(TICKET_WIDTH_VAR, `${Math.round(rect.width)}px`);
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
      document.documentElement.style.scrollPaddingBottom = "";
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
        // Below lg the page scrolls, so its end clears the floating group and the fade above it.
        // At lg the panes do it.
        pb: { xs: `calc(${FADE_HEIGHT}px + var(${FLOATING_HEIGHT_VAR}, 0px))`, lg: 0 },
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
          <Pane label="Ticket" stickyTop={STRIP_HEIGHT}>
            {main}
          </Pane>
        </Box>
      </Box>
      {/* Before the floating group, so it paints under it (see FADE_BAND_SX). */}
      <Box aria-hidden sx={FADE_BAND_SX} />
      <Box
        ref={floatingRef}
        sx={{
          position: "fixed",
          bottom: 0,
          left: { xs: "50%", lg: `var(${FLOATING_CENTER_VAR}, 50%)` },
          transform: "translateX(-50%)",
          zIndex: (theme) => theme.zIndex.appBar,
          // A fixed box with left and translateX(-50%) shrink-to-fits into only the space to the
          // right of left, so a group centered far right wrapped the deck onto two rows. The cap
          // keeps 16px on each side, so the wrapped pill below lg never touches the window edges.
          width: "max-content",
          maxWidth: `calc(100vw - ${2 * FLOATING_EDGE}px)`,
          display: "flex",
          // Side by side, the hand, the gap and the pill need about 874px. Below md that does
          // not fit, and between md and lg the group centers on the window with the hand at its
          // left end, so the arc squeezed to a step of about 20px at 900px. Below lg the pill
          // stacks above the hand, so the hand stays at the bottom edge, centered. From lg the
          // group centers on the Ticket column, clamped inside the window.
          flexDirection: { xs: "column-reverse", lg: "row" },
          alignItems: { xs: "center", lg: "flex-end" },
          gap: "20px",
          // The box spans the group's width but is mostly empty (the gap, the space above the
          // shorter item); clicks there must reach the ticket beneath. The items opt back in.
          pointerEvents: "none",
          "& > *": { pointerEvents: "auto" },
          // The open arc overlaps the pill's left end, so the pill fades and lets clicks through
          // while you pick. Hand marks itself data-hand-open and ResultsPill data-results.
          "& [data-results]": { transition: "opacity 200ms" },
          "&:has([data-hand-open='true']) [data-results]": {
            opacity: 0.15,
            pointerEvents: "none",
          },
        }}
      >
        {floating}
      </Box>
    </Container>
  );
}
