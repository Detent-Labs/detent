import type { RefObject } from "react";
import { t } from "../catalog.js";
import { DestructiveConfirm, DialogCount, DialogFacts, DialogNote, StudioDialog } from "./shared/StudioDialog.js";

/**
 * The confirmations that hold one or two sentences: each a small named
 * component, so a static-markup test can read its words (`studio-app`: "Each
 * confirmation names its act"). A caller mounts one only while its act waits.
 */

interface ConfirmationProps {
  /** The control that opened this dialog, for the focus return. */
  triggerRef: RefObject<HTMLElement | null>;
  /** Handles Cancel and the native `cancel` event (Escape). */
  onCancel: () => void;
  /** Handles the confirming control. */
  onConfirm: () => void;
}

export function LeaveDraftDialog({ triggerRef, onCancel, onConfirm }: ConfirmationProps) {
  return (
    <StudioDialog
      heading={t("leaveDialog.heading")}
      triggerRef={triggerRef}
      onCancel={onCancel}
      confirm={<DestructiveConfirm onClick={onConfirm}>{t("leaveDialog.confirm")}</DestructiveConfirm>}
    >
      <DialogNote>{t("leaveDialog.body")}</DialogNote>
    </StudioDialog>
  );
}

export function ArrangeDialog({ triggerRef, onCancel, onConfirm }: ConfirmationProps) {
  return (
    <StudioDialog
      heading={t("arrangeDialog.heading")}
      triggerRef={triggerRef}
      onCancel={onCancel}
      confirm={<DestructiveConfirm onClick={onConfirm}>{t("arrangeDialog.confirm")}</DestructiveConfirm>}
    >
      <DialogNote>{t("arrangeDialog.body")}</DialogNote>
      <DialogNote>{t("dialog.noUndo")}</DialogNote>
    </StudioDialog>
  );
}

export function RestoreOverChangesDialog({ triggerRef, onCancel, onConfirm }: ConfirmationProps) {
  return (
    <StudioDialog
      heading={t("restoreDialog.heading")}
      triggerRef={triggerRef}
      onCancel={onCancel}
      confirm={<DestructiveConfirm onClick={onConfirm}>{t("restoreDialog.confirm")}</DestructiveConfirm>}
    >
      <DialogNote>{t("restoreDialog.body")}</DialogNote>
      <DialogNote>{t("dialog.noUndo")}</DialogNote>
    </StudioDialog>
  );
}

interface KindDropDialogProps extends ConfirmationProps {
  /** The field's resolved label, or the unnamed-field text. */
  label: string;
  /** What the new kind cannot keep. Never empty: a change that drops nothing asks nothing. */
  dropped: readonly ("format" | "control")[];
}

export function KindDropDialog({ label, dropped, triggerRef, onCancel, onConfirm }: KindDropDialogProps) {
  const body =
    dropped.length === 2
      ? t("kindDropDialog.bodyBoth")
      : dropped[0] === "format"
        ? t("kindDropDialog.bodyFormat")
        : t("kindDropDialog.bodyControl");
  return (
    <StudioDialog
      // A replacer function, so a label holding a `$` pattern fills in as written.
      heading={t("kindDropDialog.heading").replace("{field}", () => label)}
      triggerRef={triggerRef}
      onCancel={onCancel}
      confirm={<DestructiveConfirm onClick={onConfirm}>{t("kindDropDialog.confirm")}</DestructiveConfirm>}
    >
      <DialogNote>{body}</DialogNote>
      <DialogNote>{t("dialog.noUndo")}</DialogNote>
    </StudioDialog>
  );
}

interface TechnicalClearDialogProps extends ConfirmationProps {
  /** The field's resolved label, or the unnamed-field text. */
  label: string;
  /** The required and read-only settings the marker clears across the draft's steps. */
  count: number;
}

export function TechnicalClearDialog({ label, count, triggerRef, onCancel, onConfirm }: TechnicalClearDialogProps) {
  return (
    <StudioDialog
      heading={t("technicalDialog.heading").replace("{field}", () => label)}
      triggerRef={triggerRef}
      onCancel={onCancel}
      confirm={<DestructiveConfirm onClick={onConfirm}>{t("technicalDialog.confirm")}</DestructiveConfirm>}
    >
      <DialogFacts>
        <DialogCount term={t("technicalDialog.clearsTerm")} count={count} />
      </DialogFacts>
      <DialogNote>{t("technicalDialog.body")}</DialogNote>
      <DialogNote>{t("dialog.noUndo")}</DialogNote>
    </StudioDialog>
  );
}

interface TemplateDialogProps extends ConfirmationProps {
  /** The template's display name, its key where it has no label. */
  name: string;
}

export function DeleteTemplateDialog({ name, triggerRef, onCancel, onConfirm }: TemplateDialogProps) {
  return (
    <StudioDialog
      heading={t("templateDeleteDialog.heading").replace("{name}", () => name)}
      triggerRef={triggerRef}
      onCancel={onCancel}
      confirm={<DestructiveConfirm onClick={onConfirm}>{t("templateDeleteDialog.confirm")}</DestructiveConfirm>}
    >
      <DialogNote>{t("templateDeleteDialog.body")}</DialogNote>
      <DialogNote>{t("dialog.noUndo")}</DialogNote>
    </StudioDialog>
  );
}

export function ReplaceTemplateDialog({ name, triggerRef, onCancel, onConfirm }: TemplateDialogProps) {
  return (
    <StudioDialog
      heading={t("templateReplaceDialog.heading").replace("{name}", () => name)}
      triggerRef={triggerRef}
      onCancel={onCancel}
      confirm={<DestructiveConfirm onClick={onConfirm}>{t("templateReplaceDialog.confirm")}</DestructiveConfirm>}
    >
      <DialogNote>{t("templateReplaceDialog.body")}</DialogNote>
    </StudioDialog>
  );
}
