import type { EpicColor } from "../../../shared/protocol.ts";

// Jira's epic palette, darkened where needed so every dot reads on the white card
// (at least 3:1 against #FFFFFF, checked for each value).
const EPIC_HEX: Record<EpicColor, string> = {
  purple: "#6554C0",
  blue: "#0065FF",
  green: "#1F845A",
  teal: "#1D7F8C",
  yellow: "#946F00",
  orange: "#C25100",
  grey: "#626F86",
  dark_purple: "#403294",
  dark_blue: "#0747A6",
  dark_green: "#216E4E",
  dark_teal: "#206B74",
  dark_yellow: "#7F5F01",
  dark_orange: "#A54800",
  dark_grey: "#44546F",
};

// Decorative gray for an epic Jira gave no color; exempt from the 3:1 rule.
const NO_COLOR_HEX = "#8590A2";

export function epicHex(color: EpicColor | null): string {
  return color === null ? NO_COLOR_HEX : EPIC_HEX[color];
}
