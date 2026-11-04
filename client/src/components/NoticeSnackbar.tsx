import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import { useCallback, useEffect, useState } from "react";

export type Notice = { id: number; message: string; severity: "error" | "success" };

interface Props {
  notice: Notice | null;
}

export function NoticeSnackbar({ notice }: Props) {
  const [open, setOpen] = useState(false);

  // Keyed on the notice object, not its message or id. Every event is a new object, so the same
  // message twice re-opens the snackbar. The id is the server's counter, which restarts at 1
  // after a server restart while this component survives the reconnect, so it can repeat.
  useEffect(() => {
    setOpen(notice !== null);
  }, [notice]);

  const close = useCallback(() => setOpen(false), []);
  const onClose = useCallback((_: unknown, reason?: string) => {
    // A stray click elsewhere shouldn't swallow a notice the user hasn't read.
    if (reason === "clickaway") return;
    setOpen(false);
  }, []);

  return (
    <Snackbar
      open={open}
      autoHideDuration={6000}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
    >
      <Alert severity={notice?.severity} variant="filled" onClose={close}>
        {notice?.message}
      </Alert>
    </Snackbar>
  );
}
