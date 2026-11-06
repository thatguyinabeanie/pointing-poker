// Shared by more than one component. It lives outside the component files so those files export
// only components (biome useComponentExportOnlyModules, and Fast Refresh).
// Layout reserves this much vertical space for the header, so the two must agree.
export const HEADER_HEIGHT = 48;
// The players strip's height. Players draws it; Layout pads the Ticket pane's focus scrolling by
// it, because the strip is sticky at the top of that pane at lg.
export const STRIP_HEIGHT = 52;
// The resize handle between the panes: its width and its margin on each side, in px. ResizeHandle
// draws it; Layout counts it when it keeps room for the Ticket column.
export const RESIZE_HANDLE_WIDTH = 9;
export const RESIZE_HANDLE_MARGIN = 4;

// The strip's flex gap between the pills and the controls, in px. The strip's columnGap, its
// compact-mode math and Layout's queue clamp all use it, so none of them can disagree.
export const STRIP_COLUMN_GAP = 16;

// The controls width reserved in the strip at lg, whatever the phase, so compact mode does not
// depend on the phase (decision 48, and the user's "stable always" of 11/06/2026): the voting
// controls ("N of M voted", Reveal, Reset) and the revealed ones (the results, then Reset) differ
// in width, and measuring only the current one would let names show in one phase and drop at the
// reveal. It is the CSS min-width of the controls cell, so a wider real layout counts at its real
// width. Layout also keeps the Ticket column wide enough for it (see TICKET_MIN_WIDTH there).
//
// The revealed controls are the widest, so they set it. Measured in Chrome (11/06/2026): 591px with
// a one-bar chart and "Consensus". The widest case, a three-bar chart with "Spread 13–21" and
// Points "0.5", comes to about 640px from that measurement, so 680 keeps about 40px to spare.
// The cost: with many players the names switch to initials sooner than they did with the old
// 260px voting reserve, in both phases, because the reserve holds while voting too.
export const CONTROLS_RESERVED_WIDTH = 680;
