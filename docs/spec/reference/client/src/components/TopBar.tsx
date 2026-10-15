import AppBar from "@mui/material/AppBar";
import Chip from "@mui/material/Chip";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";

interface Props {
  connected: boolean;
  meName?: string;
}

export function TopBar({ connected, meName }: Props) {
  return (
    <AppBar position="static">
      <Toolbar sx={{ gap: 2 }}>
        <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
          Pointing Poker
        </Typography>
        <Chip
          label={connected ? "Connected" : "Reconnecting…"}
          color={connected ? "success" : "warning"}
          size="small"
        />
        {meName && (
          <Typography sx={{ display: { xs: "none", sm: "block" } }}>You are {meName}</Typography>
        )}
      </Toolbar>
    </AppBar>
  );
}
