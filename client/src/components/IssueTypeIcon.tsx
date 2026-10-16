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

interface Props {
  type: string;
}

export function IssueTypeIcon({ type }: Props) {
  // hasOwn so a type named "constructor" cannot resolve to an Object.prototype member.
  const key = type.toLowerCase();
  const Icon = Object.hasOwn(ICONS, key) ? ICONS[key] : DescriptionOutlined;
  return <Icon fontSize="inherit" titleAccess={type} />;
}
