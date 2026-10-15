import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
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
import { type ChangeEvent, type ReactNode, useCallback, useId, useState } from "react";
import type {
  JiraBoard,
  JiraProject,
  QueueItem,
  QueueSettings,
  QueueState,
} from "../../../shared/protocol.ts";

export interface SearchResults {
  query: string;
  items: QueueItem[];
  error: string | null;
  pending: boolean;
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
            {queue.items.length} tickets
            {queue.fetchedAt ? ` · updated ${new Date(queue.fetchedAt).toLocaleTimeString()}` : ""}
          </Typography>
        )}

        {!queue.loading && !queue.error && queue.items.length === 0 ? (
          <Typography color="text.secondary">
            No tickets need pointing. Add the needs-pointing label in Jira or change the filters.
          </Typography>
        ) : (
          <TicketRows
            items={queue.items}
            currentKey={currentKey}
            disabled={disabled}
            onPick={onPick}
          />
        )}
      </Stack>
    </Paper>
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
