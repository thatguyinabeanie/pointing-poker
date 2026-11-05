import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { type ChangeEvent, useCallback } from "react";

interface Props {
  label: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
}

// mr 0 drops the label's default 16px right margin; the header's gap spaces the switches.
// ml 0 replaces the default -11px, which would pull a switch into the item before it.
const LABEL_SX = { ml: 0, mr: 0, flexShrink: 0, whiteSpace: "nowrap" } as const;

// A room-wide switch in the header (Auto-reveal, Auto-advance). The room state is the source of
// truth: the switch shows the snapshot's value and sends the new one, it keeps no local state.
export function RoomSwitch({ label, checked, disabled, onToggle }: Props) {
  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => onToggle(e.target.checked),
    [onToggle],
  );
  return (
    <FormControlLabel
      label={label}
      disabled={disabled}
      sx={LABEL_SX}
      control={<Switch size="small" checked={checked} onChange={onChange} />}
    />
  );
}
