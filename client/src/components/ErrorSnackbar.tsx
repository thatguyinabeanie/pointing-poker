import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import { useCallback, useEffect, useState } from "react";

interface Props {
  error: { id: number; message: string } | null;
}

export function ErrorSnackbar({ error }: Props) {
  const [open, setOpen] = useState(false);

  // Keyed on the error object, not its message or id. Every event is a new object, so the same
  // message twice re-opens the snackbar. The id is the server's counter, which restarts at 1
  // after a server restart while this component survives the reconnect, so it can repeat.
  useEffect(() => {
    setOpen(error !== null);
  }, [error]);

  const close = useCallback(() => setOpen(false), []);
  const onClose = useCallback((_: unknown, reason?: string) => {
    // A stray click elsewhere shouldn't swallow an error the user hasn't read.
    if (reason === "clickaway") return;
    setOpen(false);
  }, []);

  return (
    <Snackbar open={open} autoHideDuration={6000} onClose={onClose}>
      <Alert severity="error" variant="filled" onClose={close}>
        {error?.message}
      </Alert>
    </Snackbar>
  );
}
