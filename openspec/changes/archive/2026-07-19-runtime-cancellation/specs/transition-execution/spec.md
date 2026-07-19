## ADDED Requirements

### Requirement: A synthesized transition commits with a null path

The shared commit path SHALL commit a synthesized transition — one with no
authored `Path` — given an explicit `toStepId`, an explicit ordered action list,
and a `cause`. Such a transition SHALL record `pathId: null` in its `HistoryEntry`
and SHALL be subject to the same `transitionSeq` optimistic-concurrency rule and
the same target-step timer arming as an authored-path transition. It SHALL NOT
derive its `toStepId` or trigger list from an authored path.

#### Scenario: Synthesized transition records a null pathId
- **WHEN** a synthesized transition commits to an explicit target step
- **THEN** its `HistoryEntry` has `pathId: null`, `toStepId` equal to the supplied target, and the supplied actions enqueued to the outbox

#### Scenario: Synthesized transition obeys optimistic concurrency
- **WHEN** a synthesized transition is computed from `transitionSeq` N while another transition already committed at N+1
- **THEN** the synthesized transition is rejected as a concurrency conflict and leaves no partial write

#### Scenario: Synthesized transition to a terminal step completes on arm
- **WHEN** a synthesized transition commits to a terminal target step
- **THEN** the target step's timers are (dis)armed exactly as for an authored-path transition and `next_timer_at` reflects the target step
