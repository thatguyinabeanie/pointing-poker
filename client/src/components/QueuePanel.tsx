import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import LinearProgress from "@mui/material/LinearProgress";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { type ChangeEvent, type ReactNode, useCallback, useId, useMemo, useState } from "react";
import type {
  JiraBoard,
  JiraProject,
  QueueItem,
  QueueSection,
  QueueSettings,
  QueueState,
} from "../../../shared/protocol.ts";

export interface SearchResults {
  query: string;
  items: QueueItem[];
  error: string | null;
  pending: boolean;
}

const COLLAPSED_KEY = "pp.queue.collapsed";

// Collapse state is a per-viewer convenience, so storage failures are ignored.
function readCollapsed(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeCollapsed(ids: string[]): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be blocked or full; the in-memory state still works.
  }
}

interface Props {
  settings: QueueSettings;
  projects: JiraProject[];
  boards: JiraBoard[];
  queue: QueueState;
  searchResults: SearchResults | null;
  currentKey: string | null;
  disabled: boolean;
  onChangeSettings: (partial: Partial<QueueSettings>) => void;
  onRefresh: () => void;
  onPick: (key: string) => void;
  onSearch: (query: string) => void;
}

export function QueuePanel({
  settings,
  projects,
  boards,
  queue,
  searchResults,
  currentKey,
  disabled,
  onChangeSettings,
  onRefresh,
  onPick,
  onSearch,
}: Props) {
  const projectLabelId = useId();
  const boardLabelId = useId();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed);

  const onToggleSection = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id];
      writeCollapsed(next);
      return next;
    });
  }, []);

  const totalTickets = queue.sections.reduce((sum, section) => sum + section.total, 0);
  // The Jira base URL is only known from ticket links, so derive the origin from the first one.
  const jiraBase = useMemo(() => {
    const first = queue.sections.find((section) => section.items.length > 0)?.items[0];
    if (!first) return null;
    try {
      return new URL(first.url).origin;
    } catch {
      return null;
    }
  }, [queue.sections]);
  const boardUrl =
    jiraBase !== null && settings.projectKey !== null && settings.boardId !== null
      ? `${jiraBase}/jira/software/c/projects/${encodeURIComponent(settings.projectKey)}/boards/${settings.boardId}/backlog`
      : null;

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
  const onNeedsPointingChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => onChangeSettings({ needsPointingOnly: e.target.checked }),
    [onChangeSettings],
  );
  const onClearLabelChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => onChangeSettings({ clearLabelOnSave: e.target.checked }),
    [onChangeSettings],
  );
  const onQueryChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setQuery(e.target.value);
      onSearch(e.target.value);
    },
    [onSearch],
  );

  // Search results area, resolved up front so the JSX has no leaked-render conditions.
  let searchBody: ReactNode = null;
  if (searchResults && !searchResults.pending) {
    if (searchResults.error) {
      searchBody = <Alert severity="warning">{searchResults.error}</Alert>;
    } else if (searchResults.items.length === 0) {
      searchBody = <Typography color="text.secondary">No matches</Typography>;
    } else {
      searchBody = (
        <TicketRows
          items={searchResults.items}
          currentKey={currentKey}
          disabled={disabled}
          onPick={onPick}
        />
      );
    }
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ alignItems: { xs: "stretch", sm: "center" }, flexWrap: "wrap" }}
          useFlexGap
        >
          <FormControl size="small" sx={{ minWidth: 160 }} disabled={disabled}>
            <InputLabel id={projectLabelId}>Project</InputLabel>
            <Select
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
            sx={{ minWidth: 160 }}
            disabled={disabled || boards.length === 0}
          >
            <InputLabel id={boardLabelId}>Board</InputLabel>
            <Select<number | "">
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
          <FormControlLabel
            label={
              <>
                Labeled only
                <Typography variant="caption" color="text.secondary" component="div">
                  Off: labeled or unpointed tickets
                </Typography>
              </>
            }
            control={
              <Switch
                checked={settings.needsPointingOnly}
                disabled={disabled}
                onChange={onNeedsPointingChange}
              />
            }
          />
          <FormControlLabel
            label="Clear label on save"
            control={
              <Switch
                checked={settings.clearLabelOnSave}
                disabled={disabled}
                onChange={onClearLabelChange}
              />
            }
          />
          <IconButton
            aria-label="Refresh queue"
            onClick={onRefresh}
            disabled={disabled || queue.loading}
          >
            <RefreshIcon />
          </IconButton>
        </Stack>

        <Stack spacing={1}>
          <TextField
            label="Search tickets (key or text)"
            size="small"
            value={query}
            disabled={disabled}
            onChange={onQueryChange}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
          {searchResults?.pending ? <LinearProgress aria-label="Searching" /> : null}
          {searchBody}
        </Stack>

        {queue.loading ? (
          <LinearProgress aria-label="Loading queue" />
        ) : queue.error ? (
          <Alert severity="warning">{queue.error}</Alert>
        ) : (
          <Typography variant="caption" color="text.secondary">
            {totalTickets} tickets
            {queue.fetchedAt ? ` · updated ${new Date(queue.fetchedAt).toLocaleTimeString()}` : ""}
          </Typography>
        )}

        {!queue.loading && !queue.error && totalTickets === 0 ? (
          <Typography color="text.secondary">
            No tickets need pointing. Add the needs-pointing label in Jira or change the filters.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {queue.sections.map((section) => (
              <QueueSectionBlock
                key={section.id}
                section={section}
                isCollapsed={collapsed.includes(section.id)}
                boardUrl={boardUrl}
                currentKey={currentKey}
                disabled={disabled}
                onToggle={onToggleSection}
                onPick={onPick}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

interface SectionProps {
  section: QueueSection;
  isCollapsed: boolean;
  boardUrl: string | null;
  currentKey: string | null;
  disabled: boolean;
  onToggle: (id: string) => void;
  onPick: (key: string) => void;
}

function QueueSectionBlock({
  section,
  isCollapsed,
  boardUrl,
  currentKey,
  disabled,
  onToggle,
  onPick,
}: SectionProps) {
  const bodyId = useId();
  const onClick = useCallback(() => onToggle(section.id), [onToggle, section.id]);
  const rows = (
    <TicketRows items={section.items} currentKey={currentKey} disabled={disabled} onPick={onPick} />
  );
  // The no-board list has no sections to fold, so it keeps today's plain look.
  if (section.kind === "all") return rows;

  const isPartial = section.items.length < section.total;
  const count = isPartial ? `${section.items.length} of ${section.total}` : `${section.total}`;
  return (
    <div>
      <ButtonBase
        onClick={onClick}
        aria-expanded={!isCollapsed}
        aria-controls={bodyId}
        sx={{
          width: "100%",
          justifyContent: "flex-start",
          gap: 0.5,
          py: 0.5,
          px: 0.5,
          borderRadius: 1,
          textAlign: "left",
        }}
      >
        {isCollapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
        <Typography variant="subtitle2" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
          {section.name}
        </Typography>
        {section.kind === "backlog" ? null : (
          <Typography variant="caption" color="text.secondary">
            {section.kind}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ ml: "auto", flexShrink: 0 }}>
          {count}
        </Typography>
      </ButtonBase>
      <Collapse in={!isCollapsed}>
        <div id={bodyId}>
          {rows}
          {isPartial && boardUrl !== null ? (
            <Typography variant="body2" sx={{ py: 0.5, px: 2 }}>
              <Link href={boardUrl} target="_blank" rel="noopener noreferrer">
                Open the full board in Jira
              </Link>
            </Typography>
          ) : null}
        </div>
      </Collapse>
    </div>
  );
}

interface RowsProps {
  items: QueueItem[];
  currentKey: string | null;
  disabled: boolean;
  onPick: (key: string) => void;
}

// Shared by the queue list and the search results so both rows look and behave the same.
function TicketRows({ items, currentKey, disabled, onPick }: RowsProps) {
  return (
    <List dense disablePadding>
      {items.map((item) => (
        <TicketRow
          key={item.key}
          item={item}
          isCurrent={item.key === currentKey}
          disabled={disabled}
          onPick={onPick}
        />
      ))}
    </List>
  );
}

interface RowProps {
  item: QueueItem;
  isCurrent: boolean;
  disabled: boolean;
  onPick: (key: string) => void;
}

function TicketRow({ item, isCurrent, disabled, onPick }: RowProps) {
  const onClick = useCallback(() => onPick(item.key), [onPick, item.key]);
  return (
    <ListItem
      divider
      sx={{ bgcolor: isCurrent ? "action.selected" : undefined }}
      secondaryAction={
        <Button size="small" variant="outlined" disabled={disabled || isCurrent} onClick={onClick}>
          {isCurrent ? "Current" : "Point this"}
        </Button>
      }
    >
      <ListItemText
        sx={{ pr: 12 }}
        primary={
          <>
            <Link href={item.url} target="_blank" rel="noopener noreferrer" sx={{ mr: 1 }}>
              {item.key}
            </Link>
            {item.summary}
          </>
        }
        secondary={
          <Stack
            component="span"
            direction="row"
            useFlexGap
            spacing={1}
            sx={{ mt: 0.5, flexWrap: "wrap" }}
          >
            <Chip size="small" label={item.issueType} />
            <Chip size="small" label={item.status} />
          </Stack>
        }
        slotProps={{ secondary: { component: "span" } }}
      />
    </ListItem>
  );
}
