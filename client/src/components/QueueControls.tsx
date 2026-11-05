import RefreshIcon from "@mui/icons-material/Refresh";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import { useCallback, useEffect, useId, useState } from "react";
import { sameNames } from "../../../shared/constants.ts";
import type { JiraBoard, JiraProject, QueueSettings } from "../../../shared/protocol.ts";

interface Props {
  settings: QueueSettings;
  projects: JiraProject[];
  boards: JiraBoard[];
  // The project's issue type names (the menu), not the selection in settings.issueTypes.
  issueTypes: string[];
  disabled: boolean;
  // The old Refresh button was also disabled while the queue loaded; the caller passes that in.
  refreshing?: boolean;
  onChangeSettings: (partial: Partial<QueueSettings>) => void;
  onRefresh: () => void;
}

// A default small select is 40px, which pushes its floating label above the top of the 48px
// header and clips it. Trimming the vertical padding gives a 32px control with room for the label.
const SELECT_SX = { "& .MuiSelect-select": { py: 0.5 } };

// An empty selection means all types, so the closed select says so instead of looking blank.
// The select's own nowrap and ellipsis styles truncate a long list at the control's maxWidth.
function renderTypes(selected: string[]): string {
  return selected.length === 0 ? "All types" : selected.join(", ");
}

export function QueueControls({
  settings,
  projects,
  boards,
  issueTypes,
  disabled,
  refreshing = false,
  onChangeSettings,
  onRefresh,
}: Props) {
  const projectLabelId = useId();
  const boardLabelId = useId();
  const typeLabelId = useId();

  // Show the stored selection only if it is a real option; MUI warns on unknown values.
  const projectValue = projects.some((p) => p.key === settings.projectKey)
    ? (settings.projectKey ?? "")
    : "";
  const boardValue = boards.some((b) => b.id === settings.boardId) ? (settings.boardId ?? "") : "";

  const onProjectChange = useCallback(
    (e: SelectChangeEvent<string>) => onChangeSettings({ projectKey: e.target.value || null }),
    [onChangeSettings],
  );
  const onBoardChange = useCallback(
    (e: SelectChangeEvent<number | "">) =>
      onChangeSettings({ boardId: e.target.value === "" ? null : e.target.value }),
    [onChangeSettings],
  );
  // The Type menu edits a local draft and sends it once, on close. Sending on every click made
  // each click a room-wide queue refetch, and a click landing before the previous snapshot came
  // back was computed from the stale selection and undid the earlier click.
  // While open, typesSession remembers the room's selection and project at open, so a change
  // someone else makes meanwhile is never overwritten by this stale draft (see onTypesClose).
  const [typesSession, setTypesSession] = useState<{
    atOpen: string[];
    projectKey: string | null;
  } | null>(null);
  const typesOpen = typesSession !== null;
  const typesDisabled = disabled || issueTypes.length === 0;
  const [typesDraft, setTypesDraft] = useState<string[]>([]);
  const typesValue = typesOpen ? typesDraft : settings.issueTypes;
  const onTypesOpen = useCallback(() => {
    setTypesDraft(settings.issueTypes);
    setTypesSession({ atOpen: settings.issueTypes, projectKey: settings.projectKey });
  }, [settings.issueTypes, settings.projectKey]);
  const onTypesChange = useCallback((e: SelectChangeEvent<string[]>) => {
    const { value } = e.target;
    // MUI types a multiple select's value as string | string[]; the string form only comes
    // from browser autofill, as a comma-joined list.
    setTypesDraft(typeof value === "string" ? value.split(",") : value);
  }, []);
  const onTypesClose = useCallback(() => {
    if (typesSession === null) return;
    setTypesSession(null);
    // Opening and closing without a net change sends nothing, so the room does not refetch.
    // If the room's selection changed while the menu was open (another user's edit), the draft
    // was built on the old selection and sending it would undo that edit, so it is dropped.
    if (
      !sameNames(typesDraft, typesSession.atOpen) &&
      sameNames(settings.issueTypes, typesSession.atOpen)
    ) {
      onChangeSettings({ issueTypes: typesDraft });
    }
  }, [typesSession, typesDraft, settings.issueTypes, onChangeSettings]);
  // A project change (it clears the filter and loads other types) or the select turning disabled
  // makes the draft meaningless, so the menu closes and the draft is discarded. Closing through
  // state does not call onClose, so nothing is sent.
  useEffect(() => {
    if (typesSession && (typesDisabled || settings.projectKey !== typesSession.projectKey)) {
      setTypesSession(null);
    }
  }, [typesSession, typesDisabled, settings.projectKey]);

  // One row from lg, where the header is a fixed 48px tall and a second line would be clipped.
  // Below lg the header grows, and at phone width the three selects (110px each) and Refresh do
  // not fit one line, so they wrap. useFlexGap keeps the spacing right on wrapped lines.
  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      sx={{
        alignItems: "center",
        minWidth: 0,
        flexWrap: { xs: "wrap", lg: "nowrap" },
        // A wrapped line needs room above it for the next select's floating label.
        rowGap: 2,
      }}
    >
      <FormControl
        size="small"
        sx={{ minWidth: { xs: 110, sm: 140 }, maxWidth: 220 }}
        disabled={disabled}
      >
        <InputLabel id={projectLabelId}>Project</InputLabel>
        <Select
          sx={SELECT_SX}
          labelId={projectLabelId}
          label="Project"
          value={projectValue}
          onChange={onProjectChange}
        >
          {projects.map((p) => (
            <MenuItem key={p.key} value={p.key}>
              {p.key} ({p.name})
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl
        size="small"
        sx={{ minWidth: { xs: 110, sm: 140 }, maxWidth: 220 }}
        disabled={disabled || boards.length === 0}
      >
        <InputLabel id={boardLabelId}>Board</InputLabel>
        <Select<number | "">
          sx={SELECT_SX}
          labelId={boardLabelId}
          label="Board"
          value={boardValue}
          onChange={onBoardChange}
        >
          <MenuItem value="">All (no board)</MenuItem>
          {boards.map((b) => (
            <MenuItem key={b.id} value={b.id}>
              {b.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {/* Closed, the value is the room's stored selection, not filtered to the menu: it is what
          the server filters the queue by, so the closed select must show exactly that. Open, it
          is the local draft (see onTypesClose). */}
      <FormControl
        size="small"
        sx={{ minWidth: { xs: 110, sm: 140 }, maxWidth: 220 }}
        disabled={typesDisabled}
      >
        {/* displayEmpty shows "All types" with an empty value. MUI notches the outline for
            displayEmpty but does not shrink the label, which would then sit on the text. */}
        <InputLabel id={typeLabelId} shrink>
          Type
        </InputLabel>
        <Select<string[]>
          sx={SELECT_SX}
          labelId={typeLabelId}
          label="Type"
          multiple
          displayEmpty
          value={typesValue}
          open={typesOpen}
          onOpen={onTypesOpen}
          onClose={onTypesClose}
          onChange={onTypesChange}
          renderValue={renderTypes}
        >
          {issueTypes.map((name) => (
            <MenuItem key={name} value={name} dense>
              <Checkbox size="small" checked={typesValue.includes(name)} sx={{ p: 0.5 }} />
              <ListItemText primary={name} />
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <IconButton
        aria-label="Refresh queue"
        size="small"
        onClick={onRefresh}
        disabled={disabled || refreshing}
      >
        <RefreshIcon />
      </IconButton>
    </Stack>
  );
}
