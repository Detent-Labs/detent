import type { RefObject } from "react";
import { t, type CatalogKey } from "../catalog.js";
import type { FieldRemovalReach } from "../draft/field-removal.js";
import { DestructiveConfirm, DialogCount, DialogFacts, DialogNames, DialogNote, StudioDialog } from "./shared/StudioDialog.js";

/** One fact row of names: its term, and the author's words for each place. */
export interface RemovalNameRow {
  term: string;
  names: readonly string[];
}

interface Props {
  /**
   * The removed field's resolved label, with the rail's own fallback for an
   * unnamed field already applied by the caller (`FieldsTab`'s `fieldWord`,
   * `t("panelsScreen.unnamedField")`). `removalAnnouncement` names the same
   * field the same way, so the dialog and the announcement never disagree.
   */
  label: string;
  /** The removal's reach, measured on the draft before any write. */
  reach: FieldRemovalReach;
  /**
   * Rows of names, one per kind of reach, in place of the count rows. A
   * caller without them gets the counts.
   */
  names?: readonly RemovalNameRow[];
  /** The Remove field control that opened this dialog, for the focus return on a decline. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** Handles Cancel and the native `cancel` event (Escape). */
  onCancel: () => void;
  /** Handles the confirming control. */
  onConfirm: () => void;
}

/**
 * The removal confirmation (studio-app: "Removing a field that reaches past
 * the field catalog confirms first"). The heading names the field, so the
 * facts print neither its label nor its key. Each fact row gates on its own
 * `FieldRemovalReach` count: a caller renders this dialog only when `hasReach`
 * holds, but a removal with reach can still carry only some of the seven kinds.
 */
export function RemoveFieldDialog({ label, reach, names, triggerRef, onCancel, onConfirm }: Props) {
  const isGroup = reach.field.type === "group";
  const hasCelOrSettings = reach.celReads > 0 || reach.pluginSettings > 0;

  const counts: [CatalogKey, number][] = [
    ["fieldCatalog.removeDialogFieldsInsideTerm", reach.fieldsInside],
    ["fieldCatalog.removeDialogStepsTerm", reach.steps],
    ["fieldCatalog.removeDialogWritersTerm", reach.writers],
    ["fieldCatalog.removeDialogContractEntriesTerm", reach.contractEntries],
    ["fieldCatalog.removeDialogColumnMappingsTerm", reach.columnMappings],
    ["fieldCatalog.removeDialogCelReadsTerm", reach.celReads],
    ["fieldCatalog.removeDialogPluginSettingsTerm", reach.pluginSettings],
  ];

  return (
    <StudioDialog
      // A replacer function, so a label holding a `$` pattern such as `$&`
      // fills in as the author typed it.
      heading={t(isGroup ? "fieldCatalog.removeDialogHeadingGroup" : "fieldCatalog.removeDialogHeadingField").replace(
        "{field}",
        () => label,
      )}
      triggerRef={triggerRef}
      onCancel={onCancel}
      confirm={
        <DestructiveConfirm onClick={onConfirm}>
          {t(isGroup ? "fieldCatalog.removeDialogConfirmGroup" : "fieldCatalog.removeDialogConfirmField")}
        </DestructiveConfirm>
      }
    >
      <DialogFacts>
        {names
          ? names.map((row) => <DialogNames key={row.term} term={row.term} names={row.names} />)
          : counts.map(([term, count]) => <DialogCount key={term} term={t(term)} count={count} />)}
      </DialogFacts>
      <DialogNote>{t("fieldCatalog.removeDialogNoteAlways")}</DialogNote>
      {isGroup && <DialogNote>{t("fieldCatalog.removeDialogNoteGroup")}</DialogNote>}
      {hasCelOrSettings && (
        <>
          <DialogNote>{t("fieldCatalog.removeDialogNoteCelKept")}</DialogNote>
          <DialogNote>{t("fieldCatalog.removeDialogNoteCheckPublish")}</DialogNote>
        </>
      )}
    </StudioDialog>
  );
}
