import { useEffect, useRef, type RefObject } from "react";

/**
 * Opens a mounted confirmation dialog modally, puts the initial focus on its
 * declining control, and returns focus to whatever the caller's trigger ref
 * holds when the dialog unmounts.
 *
 * The caller owns the trigger ref: it points the ref at the control that
 * opened the dialog, and renders the dialog only while it is pending. A
 * caller that must not get focus back — because the confirming act is about
 * to remount the control the ref pointed at, say — clears the ref before it
 * unmounts the dialog, so the cleanup below finds nothing to focus.
 *
 * Three separate mechanisms hold the initial focus, because none of them
 * alone holds:
 *
 * The `autoFocus` prop on the declining control states the intent and is the
 * property a rendered string carries, so a static-markup test can assert it.
 * On the client it is NOT an attribute: React 19 skips it in `setProp` and
 * calls `.focus()` from `commitMount` instead.
 *
 * That client focus lands before this passive effect runs, and `showModal()`
 * then re-runs the dialog's own focusing steps. Those steps look for the
 * `autofocus` ATTRIBUTE, find none, and fall to the first focusable
 * descendant — which for a dialog whose first control commits an
 * irreversible act would prime that act instead. So the effect focuses the
 * declining control again, after `showModal()`.
 *
 * The cleanup covers every route that unmounts the dialog: Cancel, Escape,
 * and a completed request all end with the caller unmounting it. Without
 * this cleanup, focus drops to `<body>` and a keyboard user restarts their
 * traversal from the top of the screen.
 */
export function useConfirmDialog(triggerRef: RefObject<HTMLButtonElement | null>) {
  const ref = useRef<HTMLDialogElement>(null);
  const declineRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ref.current?.showModal();
    declineRef.current?.focus();
    return () => triggerRef.current?.focus();
  }, [triggerRef]);

  return { ref, declineRef };
}
