import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import Alert from "@mui/material/Alert";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import InputAdornment from "@mui/material/InputAdornment";
import LinearProgress from "@mui/material/LinearProgress";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { type ChangeEvent, type ReactNode, useCallback, useEffect, useId, useState } from "react";
import type { QueueItem, QueueSection, QueueState } from "../../../shared/protocol.ts";
import { readJson, removeItem, writeJson } from "../storage.ts";
import type { SearchResults } from "../useGameSocket.ts";
import { TicketRowFrame } from "./TicketRowFrame.tsx";

// localStorage, so collapse state follows the viewer across tabs and visits.
const COLLAPSED_KEY = "pp.queue.collapsed";
// sessionStorage (per tab), so two open tabs never overwrite each other's search.
const QUERY_KEY = "pp.search.query";

function readCollapsed(): string[] {
  return (
    readJson("local", COLLAPSED_KEY, (v) =>
      Array.isArray(v) ? v.filter((id): id is string => typeof id === "string") : null,
    ) ?? []
  );
}

function readQuery(): string {
  return readJson("session", QUERY_KEY, (v) => (typeof v === "string" ? v : null)) ?? "";
}

function writeQuery(text: string): void {
  if (text === "") removeItem("session", QUERY_KEY);
  else writeJson("session", QUERY_KEY, text);
}

interface Props {
  boardUrl: string | null;
  queue: QueueState;
  searchResults: SearchResults | null;
  currentKey: string | null;
  disabled: boolean;
  onPick: (key: string) => void;
  onSearch: (query: string) => void;
}

export function QueuePanel({
  boardUrl,
  queue,
  searchResults,
  currentKey,
  disabled,
  onPick,
  onSearch,
}: Props) {
  const [query, setQuery] = useState<string>(readQuery);
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed);

  // A search sent while the socket is down is dropped, so a query restored after a refresh is
  // re-sent each time the connection comes up. This also refreshes results after a reconnect.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the connection only; typing already sends its own search
  useEffect(() => {
    if (!disabled && query !== "") onSearch(query);
  }, [disabled]);

  const onToggleSection = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id];
      writeJson("local", COLLAPSED_KEY, next);
      return next;
    });
  }, []);

  const totalTickets = queue.sections.reduce((sum, section) => sum + section.total, 0);
  const onQueryChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setQuery(e.target.value);
      writeQuery(e.target.value);
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
    <Stack spacing={2}>
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
          No unpointed tickets. Change the project or board, or refresh.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {queue.sections.map((section) => (
            <QueueSectionBlock
              boardUrl={boardUrl}
              key={section.id}
              section={section}
              isCollapsed={collapsed.includes(section.id)}
              currentKey={currentKey}
              disabled={disabled}
              onToggle={onToggleSection}
              onPick={onPick}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

interface SectionProps {
  boardUrl: string | null;
  section: QueueSection;
  isCollapsed: boolean;
  currentKey: string | null;
  disabled: boolean;
  onToggle: (id: string) => void;
  onPick: (key: string) => void;
}

function QueueSectionBlock({
  boardUrl,
  section,
  isCollapsed,
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
  return (
    <TicketRowFrame
      issueType={item.issueType}
      ticketKey={item.key}
      url={item.url}
      isCurrent={isCurrent}
      disabled={disabled}
      onPick={onPick}
      badge={item.status}
      secondLine={<span title={item.summary}>{item.summary}</span>}
    />
  );
}
