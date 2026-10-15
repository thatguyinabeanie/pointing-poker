import { createTheme } from "@mui/material/styles";

// Stock MUI theme with Lato; Roboto is the fallback if Google Fonts is unreachable.
export const theme = createTheme({
  typography: { fontFamily: "Lato, Roboto, sans-serif" },
});
