## ADDED Requirements

### Requirement: Navigation can replace the current history entry

The shell's navigation SHALL support a mode that replaces the current
history entry instead of pushing a new one. A route can carry a
one-shot target and clear that target from its own address on read.
That clearing step SHALL use the replace mode.

Pushing in that case would leave the target's own URL as a live
history entry. A later Back would return to it, and re-trigger
whatever the target consumed. It would then push the cleared address
again, so Back could never reach the screen the navigation came from.

#### Scenario: A one-shot target clears without trapping Back

- **WHEN** a route carries a one-shot target, consumes it, and clears
  it from the address using the replace mode
- **THEN** the browser's Back control returns to the screen the
  navigation came from, not to the now-cleared target's own URL
