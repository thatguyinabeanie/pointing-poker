import type { SvgIconComponent } from "@mui/icons-material";
import Bolt from "@mui/icons-material/Bolt";
import BookmarkBorder from "@mui/icons-material/BookmarkBorder";
import BugReportOutlined from "@mui/icons-material/BugReportOutlined";
import CheckBoxOutlined from "@mui/icons-material/CheckBoxOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import SubdirectoryArrowRight from "@mui/icons-material/SubdirectoryArrowRight";

// Jira type names vary by project and locale, so match case-insensitively. Unknown types fall
// back to a generic document icon rather than rendering nothing, so every ticket keeps an icon.
const ICONS: Record<string, SvgIconComponent> = {
  bug: BugReportOutlined,
  story: BookmarkBorder,
  epic: Bolt,
  research: ScienceOutlined,
  subtask: SubdirectoryArrowRight,
  "sub-task": SubdirectoryArrowRight,
  task: CheckBoxOutlined,
};

// Hues are darkened until each reaches at least 3:1 against white (the WCAG bar for graphical
// objects), so the color never carries the type alone: the icon shape still differs per type.
// Same keys as ICONS. Bug matches the theme's error red.
const COLORS: Record<string, string> = {
  bug: "#C84944",
  story: "#3B7D34",
  epic: "#6B4BA8",
  research: "#0F7C7C",
  subtask: "#1F7AB0",
  "sub-task": "#1F7AB0",
  task: "#2F6DB5",
};

interface Props {
  type: string;
}

export function IssueTypeIcon({ type }: Props) {
  // hasOwn so a type named "constructor" cannot resolve to an Object.prototype member.
  const key = type.toLowerCase();
  const Icon = Object.hasOwn(ICONS, key) ? ICONS[key] : DescriptionOutlined;
  const color = Object.hasOwn(COLORS, key) ? COLORS[key] : "text.secondary";
  // The icon's own color wins over the text.secondary its parents set, which is only inherited.
  return <Icon fontSize="inherit" titleAccess={type} sx={{ color }} />;
}
