import RefreshIcon from "@mui/icons-material/Refresh";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import { useCallback, useId, useMemo } from "react";
import type { JiraBoard, JiraProject, QueueEpic, QueueSettings } from "../../../shared/protocol.ts";
import { epicHex } from "../lib/epicColors.ts";
import { useRoomMultiSelect } from "../useRoomMultiSelect.ts";

interface Props {
  settings: QueueSettings;
  projects: JiraProject[];
  boards: JiraBoard[];
  // The project's issue type names (the menu), not the selection in settings.issueTypes.
  issueTypes: string[];
  // The project's open epics, the Epic menu.
  epics: QueueEpic[];
  disabled: boolean;
  // The old Refresh button was also disabled while the queue loaded; the caller passes that in.
  refreshing?: boolean;
  onChangeSettings: (partial: Partial<QueueSettings>) => void;
  onRefresh: () => void;
}

// A default small select is 40px, which pushes its floating label above the top of the 48px
// header and clips it. Trimming the vertical padding gives a 32px control with room for the label.
const SELECT_SX = { "& .MuiSelect-select": { py: 0.5 } };

// Shared by Project, Board, Type and Epic. At lg the header's left column is about 500px at a
// 1200px layout, and selects growing to 220px with a long project or board name or a list of
// values pushed toward the centered title, so they stop at 130px until xl. 130px was chosen to
// fit four selects in one row and is checked in the browser; change it there if it does not fit.
// The select's own nowrap and ellipsis styles truncate a longer value; its title attribute has
// the full text.
const SELECT_FORM_SX = {
  minWidth: { xs: 110, sm: 140 },
  maxWidth: { xs: 220, lg: 130, xl: 220 },
} as const;

// The Epic menu can list up to 100 epics (MAX_EPICS on the server), so it scrolls instead of
// running off the screen.
const EPIC_MENU_PROPS = { slotProps: { paper: { sx: { maxHeight: 360 } } } } as const;

// An empty selection means all types, so the closed select says so instead of looking blank.
// Two or more show a count: the joined names ("Story, Bug") were the widest value in the header.
// The full list stays in the menu and in the select's title attribute (typesTitle).
function renderTypes(selected: string[]): string {
  if (selected.length === 0) return "All types";
  if (selected.length === 1) return selected[0];
  return `${selected.length} types`;
}

function typesTitle(selected: string[]): string {
  return selected.length === 0 ? "All types" : selected.join(", ");
}

export function QueueControls({
  settings,
  projects,
  boards,
  issueTypes,
  epics,
  disabled,
  refreshing = false,
  onChangeSettings,
  onRefresh,
}: Props) {
  const projectLabelId = useId();
  const boardLabelId = useId();
  const typeLabelId = useId();
  const epicLabelId = useId();

  // Show the stored selection only if it is a real option; MUI warns on unknown values.
  const projectValue = projects.some((p) => p.key === settings.projectKey)
    ? (settings.projectKey ?? "")
    : "";
  const boardValue = boards.some((b) => b.id === settings.boardId) ? (settings.boardId ?? "") : "";
  // Full names for the title attribute, since the closed selects truncate at their maxWidth.
  const selectedProject = projects.find((p) => p.key === projectValue);
  const boardTitle = boards.find((b) => b.id === boardValue)?.name;

  const onProjectChange = useCallback(
    (e: SelectChangeEvent<string>) => onChangeSettings({ projectKey: e.target.value || null }),
    [onChangeSettings],
  );
  const onBoardChange = useCallback(
    (e: SelectChangeEvent<number | "">) =>
      onChangeSettings({ boardId: e.target.value === "" ? null : e.target.value }),
    [onChangeSettings],
  );
  const typesDisabled = disabled || issueTypes.length === 0;
  const onSendTypes = useCallback(
    (next: string[]) => onChangeSettings({ issueTypes: next }),
    [onChangeSettings],
  );
  const types = useRoomMultiSelect({
    roomValue: settings.issueTypes,
    resetKey: settings.projectKey,
    disabled: typesDisabled,
    onSend: onSendTypes,
  });

  const epicsDisabled = disabled || epics.length === 0;
  const onSendEpics = useCallback(
    (next: string[]) => onChangeSettings({ epicKeys: next }),
    [onChangeSettings],
  );
  const epicSelect = useRoomMultiSelect({
    roomValue: settings.epicKeys,
    resetKey: settings.projectKey,
    disabled: epicsDisabled,
    onSend: onSendEpics,
  });
  // A key that is not in the list (a closed epic still stored in the room) shows as the key.
  const epicNames = useMemo(() => new Map(epics.map((e) => [e.key, e.name])), [epics]);
  const epicLabel = useCallback((key: string) => epicNames.get(key) ?? key, [epicNames]);
  const renderEpics = useCallback(
    (selected: string[]): string => {
      if (selected.length === 0) return "All epics";
      if (selected.length === 1) return epicLabel(selected[0]);
      return `${selected.length} epics`;
    },
    [epicLabel],
  );

  // One row from lg, where the header is a fixed 48px tall and a second line would be clipped.
  // Below lg the header grows, and at phone width the four selects (110px each) and Refresh do
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
      <FormControl size="small" sx={SELECT_FORM_SX} disabled={disabled}>
        <InputLabel id={projectLabelId}>Project</InputLabel>
        <Select
          sx={SELECT_SX}
          labelId={projectLabelId}
          label="Project"
          title={selectedProject ? `${selectedProject.key} (${selectedProject.name})` : undefined}
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
      <FormControl size="small" sx={SELECT_FORM_SX} disabled={disabled || boards.length === 0}>
        <InputLabel id={boardLabelId}>Board</InputLabel>
        <Select<number | "">
          sx={SELECT_SX}
          labelId={boardLabelId}
          label="Board"
          title={boardTitle}
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
          is the local draft (see useRoomMultiSelect). */}
      <FormControl size="small" sx={SELECT_FORM_SX} disabled={typesDisabled}>
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
          value={types.value}
          open={types.open}
          onOpen={types.onOpen}
          onClose={types.onClose}
          onChange={types.onChange}
          renderValue={renderTypes}
          title={typesTitle(types.value)}
        >
          {issueTypes.map((name) => (
            <MenuItem key={name} value={name} dense>
              <Checkbox size="small" checked={types.value.includes(name)} sx={{ p: 0.5 }} />
              <ListItemText primary={name} />
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {/* Same structure as Type. An empty selection means all epics. A key in the room's
          selection that is not in the menu still shows, by its key. */}
      <FormControl size="small" sx={SELECT_FORM_SX} disabled={epicsDisabled}>
        <InputLabel id={epicLabelId} shrink>
          Epic
        </InputLabel>
        <Select<string[]>
          sx={SELECT_SX}
          labelId={epicLabelId}
          label="Epic"
          multiple
          displayEmpty
          value={epicSelect.value}
          open={epicSelect.open}
          onOpen={epicSelect.onOpen}
          onClose={epicSelect.onClose}
          onChange={epicSelect.onChange}
          renderValue={renderEpics}
          title={
            epicSelect.value.length === 0 ? "All epics" : epicSelect.value.map(epicLabel).join(", ")
          }
          MenuProps={EPIC_MENU_PROPS}
        >
          {epics.map((epic) => (
            <MenuItem key={epic.key} value={epic.key} dense>
              <Checkbox
                size="small"
                checked={epicSelect.value.includes(epic.key)}
                sx={{ p: 0.5 }}
              />
              <Box
                aria-hidden
                sx={{
                  width: 10,
                  height: 10,
                  mr: 1,
                  flexShrink: 0,
                  borderRadius: "50%",
                  bgcolor: epicHex(epic.color),
                }}
              />
              <ListItemText primary={epic.name} secondary={epic.key} />
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
