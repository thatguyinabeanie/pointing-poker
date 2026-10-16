import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import { alpha } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { isNumericCard } from "../../../shared/deck.ts";
import type { Phase, PlayerView, Snapshot } from "../../../shared/protocol.ts";
import { initials } from "../lib/initials.ts";

interface Props {
  players: PlayerView[];
  phase: Phase;
  meId: number | null;
  stats: Snapshot["stats"];
}

type Outlier = "highest" | "lowest";

// Highest and lowest numeric votes, only when at least two distinct values exist.
// Gated on phase, not on p.vote: the UI must never leak a vote before reveal even if
// a buggy or stale snapshot carries one.
function findOutliers(players: PlayerView[], revealed: boolean): Map<number, Outlier> {
  const result = new Map<number, Outlier>();
  if (!revealed) return result;
  const numeric = players.flatMap((p) =>
    p.connected && p.vote !== null && isNumericCard(p.vote)
      ? [{ id: p.userId, v: Number(p.vote) }]
      : [],
  );
  const values = numeric.map((n) => n.v);
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (numeric.length < 2 || max === min) return result;
  for (const n of numeric) {
    if (n.v === max) result.set(n.id, "highest");
    else if (n.v === min) result.set(n.id, "lowest");
  }
  return result;
}

// Avatars holding small cards, for the left of the bottom bar. During voting a count
// follows; after reveal the stats (average, distribution, consensus) follow instead.
export function Players({ players, phase, meId, stats }: Props) {
  const revealed = phase === "revealed";
  const outliers = findOutliers(players, revealed);
  const connected = players.filter((p) => p.connected);
  const votedCount = connected.filter((p) => p.hasVoted).length;
  return (
    <Stack direction="row" useFlexGap spacing={2} sx={{ alignItems: "center" }}>
      <Stack
        component="ul"
        direction="row"
        useFlexGap
        spacing={1.5}
        aria-label="Participants"
        sx={{ flex: "0 1 auto", minWidth: 0, flexWrap: "wrap", listStyle: "none", m: 0, p: 0 }}
      >
        {players.map((p) => (
          <Player
            key={p.userId}
            player={p}
            isMe={p.userId === meId}
            revealed={revealed}
            outlier={outliers.get(p.userId)}
          />
        ))}
      </Stack>
      {revealed ? (
        stats ? (
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
        ) : null
      ) : (
        <Typography variant="body2" sx={{ flexShrink: 0 }}>
          {votedCount} of {connected.length} voted
        </Typography>
      )}
    </Stack>
  );
}

interface PlayerProps {
  player: PlayerView;
  isMe: boolean;
  revealed: boolean;
  outlier: Outlier | undefined;
}

function Player({ player: p, isMe, revealed, outlier }: PlayerProps) {
  const faceUp = revealed && p.vote !== null;
  return (
    <Box
      component="li"
      sx={{
        width: 44,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: p.connected ? 1 : 0.35,
      }}
    >
      <Box sx={{ position: "relative", width: 26, height: 26 }}>
        <Avatar
          aria-label={p.username}
          title={p.username}
          sx={{
            width: 26,
            height: 26,
            fontSize: 11,
            // Ring is an outline so the avatar keeps its size; the name is also bold, so
            // the viewer marker never relies on the ring alone.
            ...(isMe && { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 }),
          }}
        >
          {initials(p.username)}
        </Avatar>
        {p.connected ? (
          <Card
            name={p.username}
            faceUp={faceUp}
            vote={p.vote}
            voted={p.hasVoted}
            outlier={outlier}
          />
        ) : null}
      </Box>
      <Typography
        variant="caption"
        title={p.username}
        sx={{
          maxWidth: 44,
          mt: 0.5,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontWeight: isMe ? 700 : 400,
        }}
      >
        {p.username}
      </Typography>
    </Box>
  );
}

interface CardProps {
  name: string;
  faceUp: boolean;
  vote: string | null;
  voted: boolean;
  outlier: Outlier | undefined;
}

function Card({ name, faceUp, vote, voted, outlier }: CardProps) {
  const label = outlier
    ? `${name} voted ${vote}, ${outlier}`
    : faceUp
      ? `${name} voted ${vote}`
      : voted
        ? `${name} has voted`
        : `${name} has not voted`;
  return (
    <Box
      role="img"
      aria-label={label}
      sx={[
        {
          position: "absolute",
          top: -6,
          right: -10,
          width: 14,
          height: 20,
          borderRadius: "3px",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          fontWeight: 700,
          lineHeight: 1,
        },
        faceUp
          ? {
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: outlier ? "warning.main" : "divider",
              color: outlier ? "warning.main" : "text.primary",
              ...(outlier && { bgcolor: (t) => alpha(t.palette.warning.main, 0.12) }),
            }
          : voted
            ? {
                border: "1px solid",
                borderColor: "primary.main",
                backgroundImage: (t) =>
                  `repeating-linear-gradient(45deg, ${t.palette.primary.main} 0 2px, ${alpha(t.palette.primary.main, 0.55)} 2px 4px)`,
              }
            : { border: "1px dashed", borderColor: "text.disabled" },
      ]}
    >
      {faceUp ? vote : null}
    </Box>
  );
}
