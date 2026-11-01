import type { RefObject } from "react";
import { t } from "../catalog.js";
import type { DataSourceRemovalReach } from "../draft/data-source-removal.js";
import { DestructiveConfirm, DialogCount, DialogFacts, DialogNote, StudioDialog } from "./shared/StudioDialog.js";

interface Props {
  /**
   * The removed data source's name, with the rail's own fallback for an
   * unnamed source already applied by the caller (`DataSourcesTab`'s
   * `t("panelsScreen.unnamedDataSource")`). It prints in the body face: the
   * engine matches no source by its name.
   */
  label: string;
  /** The removal's reach, measured on the draft before any write. */
  reach: DataSourceRemovalReach;
  /** The Remove data source control that opened this dialog, for the focus return on a decline. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** Handles Cancel and the native `cancel` event (Escape). */
  onCancel: () => void;
  /** Handles the confirming control. */
  onConfirm: () => void;
}

/**
 * The data source removal confirmation (studio-app: "Removing a data source
 * that fields use confirms first"). The heading names the source, and the
 * facts count what the removal clears. A count row prints for a count above
 * zero alone, and the dialog names no field.
 */
export function RemoveDataSourceDialog({ label, reach, triggerRef, onCancel, onConfirm }: Props) {
  return (
    <StudioDialog
      // A replacer function, so a name holding a `$` pattern fills in as written.
      heading={t("dataSources.removeDialogHeading").replace("{source}", () => label)}
      triggerRef={triggerRef}
      onCancel={onCancel}
      confirm={<DestructiveConfirm onClick={onConfirm}>{t("dataSources.removeDataSource")}</DestructiveConfirm>}
    >
      <DialogFacts>
        <DialogCount term={t("dataSources.removeDialogFieldsTerm")} count={reach.fields} />
        <DialogCount term={t("dataSources.removeDialogColumnMappingsTerm")} count={reach.columnMappings} />
      </DialogFacts>
      <DialogNote>{t("dataSources.removeDialogNoteClears")}</DialogNote>
      {reach.columnMappings > 0 && <DialogNote>{t("dataSources.removeDialogNoteClearsMappings")}</DialogNote>}
      <DialogNote>{t("dialog.noUndo")}</DialogNote>
    </StudioDialog>
  );
}
