import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { theme } from "./theme.ts";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("index.html is missing #root");

// TODO(step 3): render <App /> once the game UI exists.
createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Typography variant="h4" component="h1">
        Pointing Poker
      </Typography>
    </ThemeProvider>
  </StrictMode>,
);
