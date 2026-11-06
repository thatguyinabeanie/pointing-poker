import type { SelectChangeEvent } from "@mui/material/Select";
import { useCallback, useEffect, useRef, useState } from "react";
import { sameNames } from "../../shared/constants.ts";

interface Options {
  // The room's stored selection (settings.issueTypes, settings.epicKeys).
  roomValue: string[];
  // Changing this while the menu is open makes the draft meaningless (the project key).
  resetKey: string | null;
  disabled: boolean;
  onSend: (next: string[]) => void;
}

interface Result {
  value: string[];
  open: boolean;
  onOpen: () => void;
  onChange: (e: SelectChangeEvent<string[]>) => void;
  onClose: () => void;
}

// A multi-select menu (Type, Epic) edits a local draft and sends it once, on close. Sending on
// every click made each click a room-wide queue refetch, and a click landing before the previous
// snapshot came back was computed from the stale selection and undid the earlier click.
// `value` is the draft while the menu is open and the room's selection while it is closed.
export function useRoomMultiSelect({ roomValue, resetKey, disabled, onSend }: Options): Result {
  // While open, session remembers the room's selection and the reset key at open, so a change
  // someone else makes meanwhile is never overwritten by this stale draft (see onClose).
  const [session, setSession] = useState<{
    atOpen: string[];
    resetKey: string | null;
  } | null>(null);
  const open = session !== null;
  const [draft, setDraft] = useState<string[]>([]);
  const value = open ? draft : roomValue;
  // The selection this client last sent (lastSent) and the room's selection at that moment
  // (sentFrom). If the user closes the menu and reopens it before the server answers,
  // roomValue is still the pre-edit selection, so using it as the baseline would make
  // the echo look like someone else's change and silently drop the second edit. Reopening starts
  // from lastSent instead, and the close check accepts the room matching atOpen, lastSent or
  // sentFrom as "nobody else changed anything".
  // Both are cleared on ANY change of the room's selection after a send, not only when it equals
  // lastSent: the server drops values that are not in the project's list, so its answer can
  // differ from what was sent, and a stale lastSent would then make every later close look like
  // someone else's edit and drop the user's edits for good. A rejected send changes nothing, so
  // the refs stay, and sentFrom keeps the unchanged room recognizable on the next close.
  const lastSent = useRef<string[] | null>(null);
  const sentFrom = useRef<string[] | null>(null);
  // The previous room selection, so the effect clears only on a real change: not on the first
  // render and not on a re-render that carries an equal selection.
  const prevRoomValue = useRef(roomValue);
  useEffect(() => {
    if (sameNames(roomValue, prevRoomValue.current)) return;
    prevRoomValue.current = roomValue;
    lastSent.current = null;
    sentFrom.current = null;
  }, [roomValue]);
  const onOpen = useCallback(() => {
    const baseline = lastSent.current ?? roomValue;
    setDraft(baseline);
    setSession({ atOpen: baseline, resetKey });
  }, [roomValue, resetKey]);
  const onChange = useCallback((e: SelectChangeEvent<string[]>) => {
    const { value } = e.target;
    // MUI types a multiple select's value as string | string[]; the string form only comes
    // from browser autofill, as a comma-joined list.
    setDraft(typeof value === "string" ? value.split(",") : value);
  }, []);
  const onClose = useCallback(() => {
    if (session === null) return;
    setSession(null);
    // Opening and closing without a net change sends nothing, so the room does not refetch.
    // If the room's selection changed while the menu was open (another user's edit), the draft
    // was built on the old selection and sending it would undo that edit, so it is dropped.
    // The room matching our own last send (lastSent) is not someone else's edit, and neither is
    // the room still at the selection we sent from (sentFrom: the send was rejected or not yet
    // applied), so those count as unchanged too.
    const room = roomValue;
    const roomUnchanged =
      sameNames(room, session.atOpen) ||
      (lastSent.current !== null && sameNames(room, lastSent.current)) ||
      (sentFrom.current !== null && sameNames(room, sentFrom.current));
    if (!sameNames(draft, session.atOpen) && roomUnchanged) {
      lastSent.current = draft;
      sentFrom.current = room;
      onSend(draft);
    }
  }, [session, draft, roomValue, onSend]);
  // A project change (it clears the filter and loads other options) or the select turning disabled
  // makes the draft meaningless, so the menu closes and the draft is discarded. Closing through
  // state does not call onClose, so nothing is sent.
  useEffect(() => {
    if (session && (disabled || resetKey !== session.resetKey)) {
      setSession(null);
    }
  }, [session, disabled, resetKey]);

  return { value, open, onOpen, onChange, onClose };
}
