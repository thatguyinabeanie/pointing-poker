import Box from "@mui/material/Box";
import type { KeyboardEvent, PointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

// Arrow keys move the divider by this many px, matching the brief.
const KEY_STEP = 16;

interface Props {
  // Current queue width, and the bounds it may take, all in px.
  width: number;
  min: number;
  max: number;
  // The full row width, only used to report aria values as percentages.
  rowWidth: number;
  // Called on every pointermove. The caller keeps this in memory only.
  onPreview: (px: number) => void;
  // Called once when a drag ends or a key changes the width. The caller persists it.
  onCommit: (px: number) => void;
  onReset: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// A vertical divider with a grip. The 9px box is the hit area; the 1px line and the grip are
// drawn inside it so the target is easy to grab without a heavy visual gap.
export function ResizeHandle({ width, min, max, rowWidth, onPreview, onCommit, onReset }: Props) {
  const [dragging, setDragging] = useState(false);
  // Drag start and the latest value live in a ref: pointermove fires far faster than renders,
  // and pointerup needs the final value without waiting for state.
  const drag = useRef<{ startX: number; startWidth: number; latest: number } | null>(null);

  // Text selection would otherwise follow the pointer while dragging.
  useEffect(() => {
    if (!dragging) return;
    const previous = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.userSelect = previous;
    };
  }, [dragging]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      // Left button only for mouse; touch and pen report button 0 as well.
      if (event.button !== 0) return;
      // Capture keeps move/up events coming even when the pointer leaves the 9px strip.
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { startX: event.clientX, startWidth: width, latest: width };
      setDragging(true);
    },
    [width],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const state = drag.current;
      if (!state) return;
      state.latest = clamp(state.startWidth + event.clientX - state.startX, min, max);
      onPreview(state.latest);
    },
    [min, max, onPreview],
  );

  const endDrag = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const state = drag.current;
      if (!state) return;
      drag.current = null;
      setDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      // A plain click (or the first half of a double-click) never moved; do not write for it.
      if (state.latest !== state.startWidth) onCommit(state.latest);
    },
    [onCommit],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      let next: number;
      switch (event.key) {
        case "ArrowLeft":
          next = width - KEY_STEP;
          break;
        case "ArrowRight":
          next = width + KEY_STEP;
          break;
        case "Home":
          next = min;
          break;
        case "End":
          next = max;
          break;
        default:
          return;
      }
      event.preventDefault();
      onCommit(clamp(next, min, max));
    },
    [width, min, max, onCommit],
  );

  const percent = (px: number) => (rowWidth > 0 ? Math.round((px / rowWidth) * 100) : 0);

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize ticket queue"
      aria-valuenow={percent(width)}
      aria-valuemin={percent(min)}
      aria-valuemax={percent(max)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      sx={{
        position: "relative",
        flex: "none",
        width: 9,
        mx: 0.5,
        cursor: "col-resize",
        // Without this the browser claims horizontal touch moves for scrolling and cancels the drag.
        touchAction: "none",
        outline: "none",
        // The line and grip are children so one hover/focus rule can recolor the line.
        "& .resize-line": {
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "50%",
          width: dragging ? 2 : 1,
          transform: "translateX(-50%)",
          bgcolor: dragging ? "primary.main" : "divider",
        },
        "&:hover .resize-line, &:focus-visible .resize-line": {
          width: 2,
          bgcolor: "primary.main",
        },
      }}
    >
      <Box className="resize-line" />
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 7,
          height: 28,
          boxSizing: "border-box",
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
          borderRadius: "4px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "2px",
        }}
      >
        {[0, 1, 2].map((dot) => (
          <Box
            key={dot}
            sx={{ width: 3, height: 3, borderRadius: "50%", bgcolor: "text.disabled" }}
          />
        ))}
      </Box>
    </Box>
  );
}
