/**
 * The change list: the folded register the Changes tab and the Versions
 * screen draw over `describeChanges`' rows (`studio-app`'s Changes-view
 * requirement, `process-version-inspection`).
 *
 * One row per changed entity, under its group's heading. A row is a native
 * `<details>`. Its `<summary>` is the row's one place in the tab order and its
 * disclosure control, so nothing interactive sits inside it: the open command
 * is a separate button inside the open row. A folded row still carries its
 * content in markup, and the browser hides it.
 *
 * The open state is a set of row keys held here. A caller that stays mounted
 * keeps it across a recompute, and a key that leaves the list stops matching.
 */
import { Fragment, useId, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown, ChevronRight } from "lucide-react";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t, type CatalogKey } from "../catalog.js";
import {
  CHANGE_GROUPS,
  type ChangeGroup,
  type ChangeKind,
  type ChangeProperty,
  type ChangeRow,
  type ChangeValue,
} from "../draft/changeSet.js";
import type { DiffEntry } from "../screens/versionDiffLogic.js";

const styles = stylex.create({
  headingLine: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    columnGap: space.s4,
    rowGap: space.s2,
  },
  heading: {
    margin: 0,
  },
  // The authoring command (`DESIGN.md` Buttons): a ghost button in slate,
  // mono at 11px. It composes over `btn btn-ghost`, whose accent it replaces.
  // An open command names a mono key that can outrun a 400px column, so its
  // label wraps anywhere.
  command: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "left",
    overflowWrap: "anywhere",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.surfaceMuted,
      ":active": `color-mix(in srgb, ${colors.text} 14%, transparent)`,
    },
  },
  group: {
    marginBlockStart: space.s6,
  },
  groupHeading: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    margin: 0,
    paddingBlockEnd: space.s2,
    fontSize: "inherit",
    fontWeight: 800,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
  },
  groupCount: {
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: 400,
    fontVariantNumeric: "tabular-nums",
    color: colors.textMuted,
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  item: {
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  // Three columns: the stamp, the identity, the property names. The stamp
  // column's minimum fits "Removed" and grows for a longer override, so no
  // stamp clips. Below 40rem the names move under the identity. The row spans
  // the tab body, whose scroll box clips an outer ring, so the focus ring
  // sits inside it, as a grid cell's does.
  summary: {
    outlineOffset: -2,
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(5.5rem, max-content) minmax(0, 1fr) fit-content(50%)",
      "@media (max-width: 40rem)": "minmax(5.5rem, max-content) minmax(0, 1fr)",
    },
    columnGap: space.s4,
    rowGap: space.s1,
    alignItems: "center",
    paddingBlock: space.s2,
    paddingInlineEnd: space.s1,
    listStyle: "none",
    cursor: "pointer",
    backgroundColor: { default: "transparent", ":hover": colors.surfaceMuted },
    "::-webkit-details-marker": {
      display: "none",
    },
  },
  // `DESIGN.md` The Stamp. It sits straight in a row, and takes no fixed width.
  stamp: {
    justifySelf: "start",
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1.3,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 2,
    paddingInline: 7,
  },
  stampAdded: {
    color: colors.accent,
  },
  stampChanged: {
    color: colors.text,
  },
  stampRemoved: {
    color: colors.dormant,
  },
  // `overflowWrap` inherits, so a long mono label, key or property name
  // wraps anywhere instead of overflowing its column.
  identity: {
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  entityKey: {
    marginInlineStart: space.s1,
    color: colors.textMuted,
  },
  context: {
    display: "block",
    fontSize: 13,
    color: colors.textMuted,
  },
  names: {
    display: "flex",
    alignItems: "center",
    justifyContent: { default: "flex-end", "@media (max-width: 40rem)": "flex-start" },
    gap: space.s2,
    gridColumn: { default: "auto", "@media (max-width: 40rem)": "2" },
    minWidth: 0,
    overflowWrap: "anywhere",
    fontSize: 13,
    color: colors.textMuted,
    textAlign: { default: "right", "@media (max-width: 40rem)": "left" },
  },
  chevron: {
    flex: "none",
  },
  body: {
    paddingBlockEnd: space.s3,
    paddingInlineStart: { default: `calc(5.5rem + ${space.s4})`, "@media (max-width: 40rem)": 0 },
  },
  // Name, before, arrow, after. Below 40rem each property stacks as name,
  // before, then the arrow leading the after value.
  properties: {
    display: { default: "grid", "@media (max-width: 40rem)": "block" },
    gridTemplateColumns: "fit-content(14rem) minmax(0, 1fr) auto minmax(0, 1fr)",
    columnGap: space.s3,
    rowGap: space.s1,
    margin: 0,
    fontSize: 14,
  },
  property: {
    display: { default: "contents", "@media (max-width: 40rem)": "grid" },
    gridTemplateColumns: "auto minmax(0, 1fr)",
    columnGap: space.s2,
    marginBlockStart: { default: 0, "@media (max-width: 40rem)": space.s2 },
  },
  propertyName: {
    gridColumn: { default: "auto", "@media (max-width: 40rem)": "1 / -1" },
    margin: 0,
    minWidth: 0,
    color: colors.textMuted,
    overflowWrap: "anywhere",
  },
  before: {
    gridColumn: { default: "auto", "@media (max-width: 40rem)": "1 / -1" },
    margin: 0,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  arrow: {
    margin: 0,
    color: colors.textMuted,
  },
  after: {
    margin: 0,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  statement: {
    gridColumn: { default: "2 / -1", "@media (max-width: 40rem)": "1 / -1" },
    margin: 0,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  mono: {
    fontFamily: fonts.mono,
    fontSize: 13,
  },
  quiet: {
    color: colors.textMuted,
  },
  openCommand: {
    marginBlockStart: space.s2,
  },
  developer: {
    marginBlockStart: space.s2,
  },
  developerSummary: {
    width: "fit-content",
    paddingBlock: space.s1,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textMuted,
    cursor: "pointer",
  },
  // The Developer view scrolls inside its own box, so a long JSON value never
  // widens the page. A path wraps anywhere. The box positions its visually
  // hidden "Before:" and "After:" text, so that text scrolls with the value
  // instead of widening the page from its place at the end of a long line.
  developerBox: {
    position: "relative",
    overflowX: "auto",
    marginBlockStart: space.s1,
    padding: space.s2,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
  },
  rawEntry: {
    paddingBlock: space.s1,
  },
  // Stated on the `<code>` itself: the element's own `monospace` default
  // would otherwise replace the box's stack and its size.
  rawPath: {
    display: "block",
    fontFamily: fonts.mono,
    fontSize: 12,
    overflowWrap: "anywhere",
  },
  rawValues: {
    display: "block",
    fontFamily: fonts.mono,
    fontSize: 12,
    whiteSpace: "pre",
    paddingInlineStart: space.s3,
  },
  visuallyHidden: {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
});

/** Six headings repeat the tab names, read through the tab row's own keys. */
const GROUP_HEADING: Record<ChangeGroup, CatalogKey> = {
  process: "changeList.group.process",
  fields: "tabs.fields",
  dataSources: "tabs.dataSources",
  steps: "tabs.steps",
  paths: "tabs.paths",
  forms: "tabs.forms",
  contract: "tabs.contract",
};

/** No single tab holds the process's own keys, so the Process row has none. */
const OPEN_COMMAND: Record<ChangeGroup, CatalogKey | undefined> = {
  process: undefined,
  fields: "changeList.open.fields",
  dataSources: "changeList.open.dataSources",
  steps: "changeList.open.steps",
  paths: "changeList.open.paths",
  forms: "changeList.open.forms",
  contract: "changeList.open.contract",
};

const STAMP: Record<ChangeKind, { word: CatalogKey; tone: stylex.StyleXStyles }> = {
  added: { word: "changeList.stamp.added", tone: styles.stampAdded },
  changed: { word: "changeList.stamp.changed", tone: styles.stampChanged },
  removed: { word: "changeList.stamp.removed", tone: styles.stampRemoved },
};

/** A folded row names this many properties, then how many more differ. */
const FOLDED_NAMES = 4;

interface Props {
  rows: ChangeRow[];
  /** The line naming the comparison, its version numbers already filled. */
  heading: string;
  /** What a row's open command does. Without it no row offers one. */
  onOpenRow?: (row: ChangeRow) => void;
}

export function ChangeList({ rows, heading, onOpenRow }: Props) {
  const listId = useId();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const allOpen = rows.length > 0 && rows.every((row) => open.has(row.key));

  // A browser may fire `toggle` when an open row first paints, so the set
  // changes only on a real difference.
  const toggle = (key: string, next: boolean) =>
    setOpen((current) => {
      if (current.has(key) === next) return current;
      const copy = new Set(current);
      if (next) copy.add(key);
      else copy.delete(key);
      return copy;
    });

  return (
    <div>
      <div {...stylex.props(styles.headingLine)}>
        <h2 {...stylex.props(styles.heading)}>{heading}</h2>
        {rows.length > 0 && (
          <button
            type="button"
            {...ghost(styles.command)}
            aria-controls={listId}
            aria-expanded={allOpen}
            onClick={() => setOpen(allOpen ? new Set() : new Set(rows.map((row) => row.key)))}
          >
            {t(allOpen ? "changeList.collapseAll" : "changeList.expandAll")}
          </button>
        )}
      </div>
      <div id={listId}>
        {CHANGE_GROUPS.map((group) => {
          const groupRows = rows.filter((row) => row.group === group);
          if (groupRows.length === 0) return null;
          return (
            <section key={group} {...stylex.props(styles.group)}>
              <h3 {...stylex.props(styles.groupHeading)}>
                {t(GROUP_HEADING[group])}
                <span {...stylex.props(styles.groupCount)}>{groupRows.length}</span>
              </h3>
              <ul {...stylex.props(styles.list)}>
                {groupRows.map((row) => (
                  <li key={row.key} {...stylex.props(styles.item)}>
                    <Row row={row} open={open.has(row.key)} onToggle={(next) => toggle(row.key, next)} onOpenRow={onOpenRow} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

interface RowProps {
  row: ChangeRow;
  open: boolean;
  onToggle: (open: boolean) => void;
  onOpenRow?: (row: ChangeRow) => void;
}

function Row({ row, open, onToggle, onOpenRow }: RowProps) {
  const stamp = STAMP[row.kind];
  const named = row.properties.slice(0, FOLDED_NAMES);
  const more = row.properties.length - named.length;
  const openKey = onOpenRow ? OPEN_COMMAND[row.group] : undefined;
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <details open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary {...stylex.props(styles.summary)}>
        <span {...stylex.props(styles.stamp, stamp.tone)}>{t(stamp.word)}</span>
        <span {...stylex.props(styles.identity)}>
          {/* A data source has no label, so its row names its key, a machine value. */}
          <span {...stylex.props(row.group === "dataSources" && styles.mono)}>{row.label}</span>
          {/* The space keeps the label and the key two words in the summary's accessible name. */}
          {row.entityKey !== undefined && (
            <>
              {" "}
              <code {...stylex.props(styles.mono, styles.entityKey)}>{row.entityKey}</code>
            </>
          )}
          {row.context !== undefined && (
            <span {...stylex.props(styles.context)}>{t("changeList.context.from").replace("{step}", row.context)}</span>
          )}
        </span>
        <span {...stylex.props(styles.names)}>
          <span>
            {/* Names repeat within a row, so a name keys by its position. */}
            {named.map((property, i) => (
              <Fragment key={i}>
                {i > 0 && ", "}
                {property.nameMono ? <code {...stylex.props(styles.mono)}>{property.name}</code> : property.name}
              </Fragment>
            ))}
            {more > 0 && ` ${t("changeList.more").replace("{count}", String(more))}`}
          </span>
          <Chevron size={18} strokeWidth={1.75} aria-hidden="true" {...stylex.props(styles.chevron)} />
        </span>
      </summary>
      <div {...stylex.props(styles.body)}>
        {row.properties.length > 0 && (
          <dl {...stylex.props(styles.properties)}>
            {row.properties.map((property, i) => (
              <PropertyEntry key={i} property={property} />
            ))}
          </dl>
        )}
        {openKey !== undefined && onOpenRow && (
          <div {...stylex.props(styles.openCommand)}>
            <button type="button" {...ghost(styles.command)} onClick={() => onOpenRow(row)}>
              {t(openKey).replace("{label}", row.label)}
            </button>
          </div>
        )}
        <details {...stylex.props(styles.developer)}>
          <summary {...stylex.props(styles.developerSummary)}>{t("changeList.developerView")}</summary>
          <ul {...stylex.props(styles.list, styles.developerBox)}>
            {row.raw.map((entry, i) => (
              <RawEntry key={i} entry={entry} />
            ))}
          </ul>
        </details>
      </div>
    </details>
  );
}

function PropertyEntry({ property }: { property: ChangeProperty }) {
  const name = (
    <dt {...stylex.props(styles.propertyName, property.nameMono && styles.mono)}>{property.name}</dt>
  );
  // A statement ("Reordered", "Added to the form") arrives in `after` alone.
  if (property.before === undefined) {
    return (
      <div {...stylex.props(styles.property)}>
        {name}
        <dd {...stylex.props(styles.statement, styles.quiet)}>{property.after?.text}</dd>
      </div>
    );
  }
  return (
    <div {...stylex.props(styles.property)}>
      {name}
      <dd {...stylex.props(styles.before)}>
        <span {...stylex.props(styles.visuallyHidden)}>{t("changeList.before")} </span>
        <Value value={property.before} />
      </dd>
      <dd {...stylex.props(styles.arrow)} aria-hidden="true">
        →
      </dd>
      <dd {...stylex.props(styles.after)}>
        <span {...stylex.props(styles.visuallyHidden)}>{t("changeList.after")} </span>
        <Value value={property.after} />
      </dd>
    </div>
  );
}

/** A mono value is a machine value. The "none" word reads in slate. */
function Value({ value }: { value: ChangeValue | undefined }) {
  // ponytail: the none word is recognized by its text, since `ChangeValue`
  // carries no flag for it. An authored plain value reading exactly "none"
  // also prints in slate. Upgrade: a `muted` flag on `ChangeValue`, set in
  // `changeSet.ts`'s `none()`.
  const none = t("changeList.value.none");
  if (value === undefined || (!value.mono && value.text === none)) {
    return <span {...stylex.props(styles.quiet)}>{value?.text ?? none}</span>;
  }
  return value.mono ? <code {...stylex.props(styles.mono)}>{value.text}</code> : <span>{value.text}</span>;
}

/** One JSON path with its values before and after. An absent side reads "none". */
function RawEntry({ entry }: { entry: DiffEntry }) {
  const json = (v: unknown) => (v === undefined ? t("changeList.value.none") : JSON.stringify(v));
  return (
    <li {...stylex.props(styles.rawEntry)}>
      <code {...stylex.props(styles.rawPath)}>{entry.path}</code>
      <code {...stylex.props(styles.rawValues)}>
        <span {...stylex.props(styles.visuallyHidden)}>{t("changeList.before")} </span>
        {json(entry.from)}
        <span aria-hidden="true"> → </span>
        <span {...stylex.props(styles.visuallyHidden)}>{t("changeList.after")} </span>
        {json(entry.to)}
      </code>
    </li>
  );
}

/** `btn btn-ghost` plus a compiled style, as one set of props. Spreading
 * `stylex.props(...)` beside a `className` attribute drops whichever of the
 * two the JSX writes first, so the class lists join here, as in
 * `FormTabStrip.tsx`. */
function ghost(style: stylex.StyleXStyles) {
  const compiled = stylex.props(style);
  return { ...compiled, className: `btn btn-ghost ${compiled.className ?? ""}`.trim() };
}
