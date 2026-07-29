<!-- antislop: allow-file all -->

## MODIFIED Requirements

### Requirement: The canvas supports pan and zoom over the process graph

The canvas SHALL support panning by dragging empty canvas space and zooming
via scroll/wheel input, and SHALL offer a "fit to view" control that frames
every step. This SHALL reuse `@panzoom/panzoom`, the same library
`packages/editor`'s read-only graph view used for the same purpose before
`packages/editor` was deleted.

#### Scenario: Fit to view frames all steps

- **WHEN** "fit to view" is activated
- **THEN** every step in the current draft is within the visible canvas area
