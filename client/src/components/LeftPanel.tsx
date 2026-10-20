import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { type ComponentProps, type SyntheticEvent, useCallback, useState } from "react";
import type { SessionHistoryEntry } from "../../../shared/protocol.ts";
import { readJson, writeJson } from "../storage.ts";
import { QueuePanel } from "./QueuePanel.tsx";
import { SessionHistory } from "./SessionHistory.tsx";

type LeftTab = "queue" | "history";

// sessionStorage (per tab), like the other per-tab view choices.
const TAB_KEY = "pp.left.tab";

function readTab(): LeftTab {
  return (
    readJson("session", TAB_KEY, (v) => (v === "queue" || v === "history" ? v : null)) ?? "queue"
  );
}

type Props = ComponentProps<typeof QueuePanel> & { history: SessionHistoryEntry[] };

export function LeftPanel({ history, ...queueProps }: Props) {
  const [tab, setTab] = useState<LeftTab>(readTab);
  const onTabChange = useCallback((_e: SyntheticEvent, value: LeftTab) => {
    setTab(value);
    writeJson("session", TAB_KEY, value);
  }, []);

  return (
    <Paper>
      <Tabs
        value={tab}
        onChange={onTabChange}
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          // Layout's pane scrolls, so the tabs stay put above a long list.
          position: "sticky",
          top: 0,
          zIndex: 1,
          bgcolor: "background.paper",
        }}
      >
        <Tab value="queue" label="Queue" />
        <Tab
          value="history"
          label={
            <Badge
              badgeContent={history.length}
              color="primary"
              showZero
              sx={{ "& .MuiBadge-badge": { right: -16 } }}
            >
              History
            </Badge>
          }
          sx={{ pr: 4 }}
        />
      </Tabs>
      {/* Both stay mounted: remounting QueuePanel would re-send its restored search query. */}
      <Box sx={{ p: 2 }} hidden={tab !== "queue"}>
        <QueuePanel {...queueProps} />
      </Box>
      <Box sx={{ p: 2 }} hidden={tab !== "history"}>
        <SessionHistory
          history={history}
          currentKey={queueProps.currentKey}
          disabled={queueProps.disabled}
          onPick={queueProps.onPick}
        />
      </Box>
    </Paper>
  );
}
