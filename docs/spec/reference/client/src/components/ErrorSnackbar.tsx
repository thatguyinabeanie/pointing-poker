import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import { useEffect, useState } from "react";

interface Props {
  error: { id: number; message: string } | null;
}

export function ErrorSnackbar({ error }: Props) {
  const [open, setOpen] = useState(false);

  // Keyed on id, not message, so the same message arriving twice re-opens the snackbar.
  // biome-ignore lint/correctness/useExhaustiveDependencies: error.id is the intended trigger
  useEffect(() => {
    setOpen(error !== null);
  }, [error?.id]);

  return (
    <Snackbar
      open={open}
      autoHideDuration={6000}
      onClose={(_, reason) => {
        // A stray click elsewhere shouldn't swallow an error the user hasn't read.
        if (reason === "clickaway") return;
        setOpen(false);
      }}
    >
      <Alert severity="error" variant="filled" onClose={() => setOpen(false)}>
        {error?.message}
      </Alert>
    </Snackbar>
  );
}
