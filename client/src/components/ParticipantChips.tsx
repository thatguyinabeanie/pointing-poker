import CheckCircle from "@mui/icons-material/CheckCircle";
import HourglassEmpty from "@mui/icons-material/HourglassEmpty";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Phase, PlayerView, Snapshot } from "../../../shared/protocol.ts";

interface Props {
  players: PlayerView[];
  phase: Phase;
  meId: number | null;
  stats: Snapshot["stats"];
}

// Compact participant row for the left of the bottom bar. When revealed, the stats
// (average, distribution, consensus) follow inline; the people wrap first when crowded.
export function ParticipantChips({ players, phase, meId, stats }: Props) {
  const revealed = phase === "revealed";
  return (
    <Stack direction="row" useFlexGap spacing={2} sx={{ alignItems: "center" }}>
      <Stack
        component="ul"
        direction="row"
        useFlexGap
        spacing={0.5}
        aria-label="Participants"
        sx={{ flex: "1 1 auto", minWidth: 0, flexWrap: "wrap", listStyle: "none", m: 0, p: 0 }}
      >
        {players.map((p) => {
          const name = p.userId === meId ? `${p.username} (you)` : p.username;
          // Gated on phase, not on p.vote: the UI must never leak a vote before reveal
          // even if a buggy or stale snapshot carries one.
          const label = revealed ? `${name}: ${p.vote ?? "–"}` : name;
          const icon = revealed ? undefined : p.hasVoted ? (
            <CheckCircle color="success" aria-label="voted" />
          ) : (
            <HourglassEmpty color="disabled" aria-label="not voted" />
          );
          return (
            <Box component="li" key={p.userId} sx={{ opacity: p.connected ? 1 : 0.5 }}>
              <Chip
                size="small"
                variant="outlined"
                avatar={<Avatar>{p.username.charAt(0).toUpperCase()}</Avatar>}
                icon={icon}
                label={p.connected ? label : `${label} (offline)`}
              />
            </Box>
          );
        })}
      </Stack>
      {revealed && stats ? (
        <Stack
          direction="row"
          useFlexGap
          spacing={0.5}
          sx={{ flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}
        >
          <Typography variant="body2">Avg {stats.average ?? "–"}</Typography>
          {Object.entries(stats.counts).map(([card, n]) => (
            <Chip key={card} size="small" label={`${card} ×${n}`} />
          ))}
          <Chip
            size="small"
            variant="outlined"
            color={stats.consensus ? "success" : "default"}
            label={stats.consensus ? "Consensus" : "No consensus"}
          />
        </Stack>
      ) : null}
    </Stack>
  );
}
