import sanitizeHtml from "sanitize-html";

// Why this runs on the server and not in the browser:
// - One place. Every viewer receives the same already-clean HTML in the snapshot, so
//   there is no second sanitizer in the client that could drift or be skipped.
// - No DOM dependency in the browser bundle (DOMPurify and friends add weight and
//   need a DOM; this runs in plain Node).
// - The HTML is Jira-authored content (any user who can comment on a ticket wrote it)
//   and it is shown to everyone in the room, so it is untrusted input.

const ALLOWED_TAGS = [
  "p", "br", "div", "span", "ul", "ol", "li", "strong", "b", "em", "i", "u", "s", "del",
  "code", "pre", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "a", "table",
  "thead", "tbody", "tr", "th", "td", "sup", "sub",
];

const ALLOWED_SCHEMES = ["http", "https", "mailto"];

// Resolves against the Jira base URL and returns null for anything that is not an
// allowed scheme (javascript:, data:, vbscript:, and so on) or cannot be parsed.
function absoluteUrl(raw: string | undefined, baseUrl: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim(), baseUrl);
    return ALLOWED_SCHEMES.includes(url.protocol.slice(0, -1)) ? url.href : null;
  } catch {
    return null;
  }
}

function fileName(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(last) || "image";
  } catch {
    return "image";
  }
}

export function sanitizeJiraHtml(html: string, baseUrl: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    // Everything not listed here (class, style, id, on* handlers, data-*) is dropped.
    allowedAttributes: {
      a: ["href", "title", "rel", "target"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ALLOWED_SCHEMES,
    allowProtocolRelative: false,
    // Tags whose text content is discarded along with the tag.
    nonTextTags: ["script", "style", "iframe", "textarea", "noscript", "option"],
    transformTags: {
      a: (tagName, attribs) => {
        const href = absoluteUrl(attribs.href, baseUrl);
        const next: Record<string, string> = { rel: "noopener noreferrer", target: "_blank" };
        if (attribs.title) next.title = attribs.title;
        if (href) next.href = href;
        return { tagName, attribs: next };
      },
      // Jira attachment images need Jira auth, so they cannot load inside this app.
      // A link to the original is the most useful thing we can show instead.
      img: (_tagName, attribs) => {
        const src = absoluteUrl(attribs.src, baseUrl);
        const label = attribs.alt?.trim() || (src ? fileName(src) : "image");
        const text = `[image: ${label}]`;
        if (!src) return { tagName: "span", attribs: {} as Record<string, string>, text };
        return {
          tagName: "a",
          attribs: { href: src, rel: "noopener noreferrer", target: "_blank" },
          text,
        };
      },
    },
  });
}

const TRUNCATED_MARKER = "<p><em>Truncated</em></p>";

// Cuts already-sanitized HTML to at most maxChars (before the marker). A raw slice can
// land inside a tag or attribute, so the cut is run back through the sanitizer, which
// drops the partial tag and closes any open ones, then the marker is appended.
export function capSanitizedHtml(html: string, baseUrl: string, maxChars: number): string {
  if (html.length <= maxChars) return html;
  return sanitizeJiraHtml(html.slice(0, maxChars), baseUrl) + TRUNCATED_MARKER;
}
