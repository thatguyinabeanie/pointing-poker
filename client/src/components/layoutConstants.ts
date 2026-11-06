// Shared by more than one component. It lives outside the component files so those files export
// only components (biome useComponentExportOnlyModules, and Fast Refresh).
// Layout reserves this much vertical space for the header, so the two must agree.
export const HEADER_HEIGHT = 48;
// The players strip's height. Players draws it; Layout pads the Ticket pane's focus scrolling by
// it, because the strip is sticky at the top of that pane at lg.
export const STRIP_HEIGHT = 52;
