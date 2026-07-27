import { useDraft } from "../../draft/store";
import { mergeLocalizedTextEntry, type DraftLocalizedText } from "../../draft/localized-text";

interface Props {
  value: DraftLocalizedText;
  onChange: (next: DraftLocalizedText) => void;
  placeholder?: string;
  disabled?: boolean;
}

/** Edits one locale entry of a LocalizedText value at a time, bound to the
 * Draft's current content locale — independent of the editor's own
 * UI-chrome locale (editor-structural-panels spec). Writes only the
 * current locale's key, leaving every other locale entry untouched. */
export function LocalizedTextInput({ value, onChange, placeholder, disabled }: Props) {
  const { contentLocale } = useDraft();

  return (
    <input
      type="text"
      placeholder={placeholder}
      disabled={disabled}
      value={value?.[contentLocale] ?? ""}
      onChange={(e) => onChange(mergeLocalizedTextEntry(value, contentLocale, e.target.value))}
    />
  );
}
