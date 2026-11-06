import RefreshIcon from "@mui/icons-material/Refresh";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
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

// The Epic menu can be long (every open epic in the project), so it scrolls instead of running off
// the screen.
const EPIC_MENU_PAPER_SX = { maxHeight: 360 } as const;

// Group headers scroll away with their rows. Only the search field is pinned: two sticky
// headers at top 0 would sit on top of each other.
const EPIC_GROUP_HEADER_SX = { lineHeight: "32px", fontSize: 12 } as const;

// The search field sits in a ListSubheader, which Select treats as a child with no value, so a
// click on it is not an option click. The opaque background keeps rows from showing through it
// while they scroll under it.
const EPIC_SEARCH_HEADER_SX = {
  top: 0,
  zIndex: 2,
  px: 1.5,
  py: 1,
  bgcolor: "background.paper",
  lineHeight: "normal",
} as const;

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

  // The search text is local to this client and cleared on close, so it is not part of the hook's
  // draft. Reopening starts from the full list.
  const [epicSearch, setEpicSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const onSearchChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setEpicSearch(e.target.value),
    [],
  );
  const { onClose: closeEpicDraft } = epicSelect;
  const onEpicClose = useCallback(() => {
    setEpicSearch("");
    closeEpicDraft();
  }, [closeEpicDraft]);
  // Select's type-ahead and the menu's arrow handling listen for keydown on the list, which holds
  // the field, so every key but Escape stays in the field. Escape must still reach the Modal to
  // close the menu, and Tab to reach the Menu, which closes on it. ArrowDown is handed to the
  // first row by hand, because the menu's arrow navigation never sees it. Rows are the elements
  // with a data-value: Select drops that attribute from the headers.
  const onSearchKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape" || e.key === "Tab") return;
    e.stopPropagation();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.currentTarget.closest("ul")?.querySelector<HTMLElement>("li[data-value]")?.focus();
    }
  }, []);
  // Selected epics stay listed while filtering, so a hidden checked row cannot be sent by surprise.
  const epicGroups = useMemo(() => {
    const q = epicSearch.trim().toLowerCase();
    const matches = (e: QueueEpic) =>
      q === "" || e.name.toLowerCase().includes(q) || e.key.toLowerCase().includes(q);
    const isShown = (e: QueueEpic) => epicSelect.value.includes(e.key) || matches(e);
    return {
      inQueue: epics.filter((e) => e.inQueue && isShown(e)),
      other: epics.filter((e) => !e.inQueue && isShown(e)),
      anyMatch: epics.some(matches),
    };
  }, [epics, epicSearch, epicSelect.value]);
  const epicRow = (epic: QueueEpic): ReactNode => (
    <MenuItem key={epic.key} value={epic.key} dense>
      <Checkbox size="small" checked={epicSelect.value.includes(epic.key)} sx={{ p: 0.5 }} />
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
  );
  // Select accepts an array of children, not a Fragment. Headers have no value, so a click on
  // one selects nothing.
  const epicMenuItems: ReactNode[] = [
    <ListSubheader key="search" sx={EPIC_SEARCH_HEADER_SX}>
      <TextField
        size="small"
        fullWidth
        autoFocus
        placeholder="Search epics"
        value={epicSearch}
        inputRef={searchRef}
        onChange={onSearchChange}
        onKeyDown={onSearchKeyDown}
        slotProps={{ htmlInput: { "aria-label": "Search epics", autoComplete: "off" } }}
      />
    </ListSubheader>,
  ];
  if (epicGroups.inQueue.length > 0) {
    epicMenuItems.push(
      <ListSubheader key="h-queue" disableSticky sx={EPIC_GROUP_HEADER_SX}>
        In the queue
      </ListSubheader>,
      ...epicGroups.inQueue.map(epicRow),
    );
  }
  if (epicGroups.other.length > 0) {
    epicMenuItems.push(
      <ListSubheader key="h-other" disableSticky sx={EPIC_GROUP_HEADER_SX}>
        Other open epics
      </ListSubheader>,
      ...epicGroups.other.map(epicRow),
    );
  }
  if (!epicGroups.anyMatch) {
    epicMenuItems.push(
      <ListSubheader key="empty" disableSticky sx={EPIC_GROUP_HEADER_SX}>
        No epics match
      </ListSubheader>,
    );
  }

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
          onClose={onEpicClose}
          onChange={epicSelect.onChange}
          renderValue={renderEpics}
          title={
            epicSelect.value.length === 0 ? "All epics" : epicSelect.value.map(epicLabel).join(", ")
          }
          MenuProps={{
            // The field takes focus, not the first row, or the first typed letter would be
            // type-ahead. onEntered covers a focus trap that moves focus after the field mounts.
            autoFocus: false,
            slotProps: {
              paper: { sx: EPIC_MENU_PAPER_SX },
              transition: { onEntered: () => searchRef.current?.focus() },
            },
          }}
        >
          {epicMenuItems}
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
