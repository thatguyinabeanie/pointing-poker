import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";

// Typography for server-provided HTML. Long words wrap and wide blocks scroll sideways
// so nothing can widen its pane.
const richTextSx: SxProps<Theme> = {
  overflowWrap: "anywhere",
  "& > :last-child": { mb: 0 },
  "& p, & ul, & ol, & pre, & table, & blockquote": { mt: 0, mb: 1.5 },
  "& ul, & ol": { pl: 3 },
  "& h1, & h2, & h3, & h4, & h5, & h6": { fontSize: "1rem", fontWeight: 700, mt: 1.5, mb: 1 },
  "& a": { color: "primary.main", overflowWrap: "anywhere" },
  "& code": {
    fontFamily: "monospace",
    fontSize: "0.875em",
    bgcolor: "action.hover",
    px: 0.5,
    borderRadius: 0.5,
  },
  "& pre": { overflowX: "auto", p: 1, bgcolor: "action.hover", borderRadius: 1 },
  "& pre code": { bgcolor: "transparent", p: 0 },
  "& table": { display: "block", overflowX: "auto", maxWidth: "100%", borderCollapse: "collapse" },
  "& th, & td": { border: 1, borderColor: "divider", px: 1, py: 0.5, textAlign: "left" },
  "& blockquote": { ml: 0, pl: 2, borderLeft: 4, borderColor: "divider", color: "text.secondary" },
};

// The only place in the client that renders HTML. Safe only because the server sanitizes
// descriptionHtml and bodyHtml (allowlisted tags, no scripts or styles). Never pass any
// other string here.
export function HtmlBody({ html }: { html: string }) {
  return (
    <Box
      sx={richTextSx}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: server-sanitized HTML only; see spec 03 section 2
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
