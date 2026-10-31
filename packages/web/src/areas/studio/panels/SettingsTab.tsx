import * as stylex from "@stylexjs/stylex";
import { Users2 } from "lucide-react";
import { focus, space } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import type { SettingsView, TabView } from "../routing.js";
import { areaHref, type NavigateOptions } from "../../../shell/routing.js";
import { AccessPanel } from "./AccessPanel.js";
import { ContractPanel } from "./ContractPanel.js";
import { DataSourcesTab } from "./EntityTabs.js";
import { ProcessSettingsPanel } from "./ProcessSettingsPanel.js";
import { SubRow, subTabDomId, subTabPanelDomId } from "./SubRow.js";

const styles = stylex.create({
  // The sub-row, then one view body growing into the height the tab body
  // leaves.
  column: {
    display: "flex",
    flexDirection: "column",
    flex: "1 1 auto",
    minHeight: 0,
  },
  // A view body: a column flex that scrolls on its own. The data sources grid
  // declares `height: 100%`, and this body's own height is what it fills.
  // A scroll box clips at its padding edge, so it pads the focus ring's reach
  // and keeps that room when a focus scroll stops short of either end
  // (`studio-focus-ring-clipping`).
  view: {
    display: "flex",
    flexDirection: "column",
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: focus.reach,
    scrollPadding: focus.reach,
  },
  // `hidden` alone loses against the compiled `display` above, since an
  // author sheet beats the UA one, so the hidden state picks its own style.
  viewHidden: {
    display: "none",
  },
  // The assignment-groups link under the access lists: icon and label flush
  // left, at the width of its own text.
  groupsLink: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    alignSelf: "flex-start",
    gap: space.s2,
    textAlign: "left",
  },
});

interface Props {
  view: SettingsView;
  onOpenView: (view: TabView) => void;
  token: string;
  /** The calling actor's own roles, for the access lists' add and delete
   * gating. */
  roles: readonly string[];
  processId: string;
  /** Cross-area navigation, for the assignment-groups link. */
  go: (href: string, opts?: NavigateOptions) => void;
  /** True while the Settings tab stands open and the JSON surface does not. */
  visible: boolean;
  onUnauthorized: () => void;
}

/**
 * The Settings tab: a sub-row over the process's own settings, its data
 * sources, its contract and its access lists (`studio-process-tabs`: "The
 * Settings tab gathers the process-wide settings"). Every view body stays
 * mounted, and `hidden` reveals one, so the contract editor keeps a
 * half-typed outcome name across a switch.
 */
export function SettingsTab({ view, onOpenView, token, roles, processId, go, visible, onUnauthorized }: Props) {
  const groupsLinkProps = stylex.props(styles.groupsLink);
  const body = (id: SettingsView) => {
    const hide = view !== id;
    return {
      id: subTabPanelDomId("settings", id),
      role: "tabpanel",
      "aria-labelledby": subTabDomId("settings", id),
      hidden: hide,
      ...stylex.props(styles.view, hide && styles.viewHidden),
    };
  };
  return (
    <div {...stylex.props(styles.column)}>
      <SubRow
        tab="settings"
        views={[
          { id: "process", label: t("settings.process") },
          { id: "sources", label: t("settings.sources") },
          { id: "contract", label: t("settings.contract") },
          { id: "access", label: t("settings.access") },
        ]}
        open={view}
        onOpen={onOpenView}
        label={t("settings.rowLabel")}
      />
      <div {...body("process")}>
        <ProcessSettingsPanel processId={processId} />
      </div>
      <div {...body("sources")}>
        <DataSourcesTab token={token} visible={visible && view === "sources"} />
      </div>
      <div {...body("contract")}>
        <ContractPanel />
      </div>
      <div {...body("access")}>
        <AccessPanel processId={processId} token={token} roles={roles} onUnauthorized={onUnauthorized} />
        {/* Pure navigation: it writes nothing to the draft. Following it
            without `system:admin` is the admin area's own gate to decide. */}
        <button
          type="button"
          className={`btn btn-secondary ${groupsLinkProps.className ?? ""}`}
          style={groupsLinkProps.style}
          onClick={() => go(`${areaHref("admin", "/groups")}?processId=${encodeURIComponent(processId)}`)}
        >
          <Users2 size={18} strokeWidth={1.75} aria-hidden="true" />
          {t("settings.manageGroups")}
        </button>
      </div>
    </div>
  );
}
