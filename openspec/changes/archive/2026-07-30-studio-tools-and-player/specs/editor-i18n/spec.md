<!-- antislop: allow-file all -->

## REMOVED Requirements

### Requirement: Editor UI-chrome text renders through a shared catalog lookup

**Reason**: `packages/editor` is deleted. `packages/studio` never carried a
locale-switcher forward — its UI chrome has been fixed English since
`2026-07-24-collapse-editor-i18n` decided that for the whole Studio/editor
line, so there is nothing left for this requirement to govern.

**Migration**: None. `packages/studio`'s UI-chrome text is plain fixed
English strings, not a lookup mechanism.

### Requirement: Non-component code receives translated text as a parameter

**Reason**: `packages/editor` is deleted along with the `t()` lookup
function this requirement governed.

**Migration**: None. `packages/studio`'s non-component code has no
translation parameter to receive, since there is no lookup to call.
