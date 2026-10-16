import { createTheme } from "@mui/material/styles";

// App palette. Hex values come from the brand guide, except the
// success, warning and error shades, which are text-safe variants of the
// platform feedback tokens (see 07-branding.md).
const palette = {
  navy: "#215470",
  night: "#0A2138",
  nightGray: "#4B5563",
  amber: "#F1A137",
  coolGray200: "#E5E7EB",
  white: "#FFFFFF",
  success: "#32522E",
  successLight: "#64A45C",
  warning: "#B14A1B",
  error: "#C84944",
};

export const theme = createTheme({
  palette: {
    primary: {
      main: palette.navy,
      dark: palette.night,
      contrastText: palette.white,
    },
    secondary: {
      main: palette.amber,
      contrastText: palette.night,
    },
    success: {
      main: palette.success,
      light: palette.successLight,
      contrastText: palette.white,
    },
    warning: {
      main: palette.warning,
      contrastText: palette.white,
    },
    error: {
      main: palette.error,
      contrastText: palette.white,
    },
    info: {
      main: palette.navy,
      contrastText: palette.white,
    },
    text: {
      primary: palette.night,
      secondary: palette.nightGray,
    },
    divider: palette.coolGray200,
    background: {
      default: palette.white,
      paper: palette.white,
    },
  },
  typography: {
    // Lato is loaded from Google Fonts at weights 300, 400 and 700 (the set
    // the platform bootstrap loads). Black (900) is not loaded, so headings use 700.
    fontFamily: '"Lato", Roboto, Helvetica, Arial, sans-serif',
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
    h1: { fontSize: "2rem", fontWeight: 300, lineHeight: 1.2 },
    h2: { fontSize: "1.5rem", fontWeight: 400, lineHeight: 1.3 },
    h3: { fontSize: "1.25rem", fontWeight: 700, lineHeight: 1.3 },
    h4: { fontSize: "1.125rem", fontWeight: 700, lineHeight: 1.3 },
    h5: { fontSize: "1rem", fontWeight: 700, lineHeight: 1.4 },
    h6: { fontSize: "1rem", fontWeight: 700, lineHeight: 1.5 },
    subtitle1: { fontSize: "1rem", fontWeight: 400, lineHeight: 1.5 },
    subtitle2: { fontSize: "0.875rem", fontWeight: 700, lineHeight: 1.43 },
    body1: { fontSize: "1rem", fontWeight: 400, lineHeight: 1.5 },
    body2: { fontSize: "0.875rem", fontWeight: 400, lineHeight: 1.43 },
    caption: { fontSize: "0.75rem", fontWeight: 400, lineHeight: 1.66 },
    overline: {
      fontSize: "0.6875rem",
      fontWeight: 700,
      letterSpacing: "0.2em",
      lineHeight: 1.6,
      textTransform: "uppercase",
    },
    button: {
      // Sentence-case labels such as "Save to Jira" stay as written.
      textTransform: "none",
    },
  },
  components: {
    MuiAppBar: {
      defaultProps: {
        color: "primary",
        elevation: 0,
      },
    },
    MuiButton: {
      styleOverrides: {
        // Matches the height of a small TextField so buttons align with inputs.
        sizeMedium: {
          padding: "7.75px 16px",
        },
      },
    },
    MuiChip: {
      defaultProps: {
        size: "small",
      },
    },
    MuiTextField: {
      defaultProps: {
        size: "small",
      },
    },
    MuiPaper: {
      styleOverrides: {
        outlined: {
          borderColor: palette.coolGray200,
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        "*:focus-visible": {
          outline: `2px solid ${palette.navy}`,
          outlineOffset: 2,
        },
      },
    },
  },
});
