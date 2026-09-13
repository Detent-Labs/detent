import type { CSSProperties } from "react";
import { useDraft } from "../../draft/store";
import { mergeLocalizedTextEntry, type DraftLocalizedText } from "../../draft/localized-text";

interface Props {
  value: DraftLocalizedText;
  onChange: (next: DraftLocalizedText) => void;
  placeholder?: string;
  disabled?: boolean;
  /** A caller's own compiled style, spread from `stylex.props(...)`.
   * `panels/ProcessHeaderBar.tsx` is the only caller that needs one: its
   * process-label mount reads as heading text until focused, a look no
   * other mount site shares. Every other caller omits this and gets the
   * platform default, unchanged. */
  className?: string;
  style?: CSSProperties;
  /** Lets a caller put focus on this input from elsewhere, e.g. `fieldCatalogLogic.ts`'s
   * `fieldLabelInputId`, which `FieldEditor`'s label input carries so the tab
   * can focus a new field's label after an add. Every other caller omits it. */
  id?: string;
}

/** Edits one locale entry of a LocalizedText value at a time, bound to the
 * Draft's current content locale — independent of the app's own
 * UI-chrome locale. Writes only the
 * current locale's key, leaving every other locale entry untouched. */
export function LocalizedTextInput({ value, onChange, placeholder, disabled, className, style, id }: Props) {
  const { contentLocale } = useDraft();

  return (
    <input
      type="text"
      id={id}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      style={style}
      value={value?.[contentLocale] ?? ""}
      onChange={(e) => onChange(mergeLocalizedTextEntry(value, contentLocale, e.target.value))}
    />
  );
}
