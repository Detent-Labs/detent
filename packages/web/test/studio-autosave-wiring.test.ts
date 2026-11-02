import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

/**
 * `useDraftToolbarActions` runs the autosave's decisions, and a logic test sees
 * none of the wiring: the timer effect's inputs, the flush, the failure's clears,
 * the unmount and the save point acts. Each passes the type check when deleted.
 *
 * A source test in the idiom `studio-stash-wiring.test.ts` uses: no harness in
 * this package can run an effect. `scan` returns one name per violation. The first
 * test asserts the real files have none. The rest apply one in-memory mutation to
 * the real source and assert the matching violation appears, so each pin is proved
 * to fire. The working tree is never touched.
 */

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function read(path: string): string {
  return stripComments(readFileSync(new URL(`../src/areas/studio/${path}`, import.meta.url).pathname, "utf8"));
}

function braced(code: string, open: number): string | undefined {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return code.slice(open + 1, i);
  }
  return undefined;
}

/** The body of the first brace pair after `const name =`. */
function bodyAfter(code: string, name: string): string {
  const m = new RegExp(`\\bconst\\s+${name}\\s*=`).exec(code);
  if (!m) return "";
  return braced(code, code.indexOf("{", m.index)) ?? "";
}

/** The callback a save point act hands `savePointRequest`. */
function actBody(code: string, act: string): string {
  const m = new RegExp(`"${act}",\\s*async \\(\\) => \\{`).exec(code);
  return m ? (braced(code, m.index + m[0].length - 1) ?? "") : "";
}

/** The text of the call whose opening parenthesis follows `start`. */
function callText(code: string, start: number): string {
  let depth = 0;
  for (let i = code.indexOf("(", start); i >= 0 && i < code.length; i++) {
    if (code[i] === "(") depth++;
    else if (code[i] === ")" && --depth === 0) return code.slice(start, i + 1);
  }
  return "";
}

/** The whole `useEffect(...)` call that holds `marker`. */
function effectHolding(code: string, marker: string): string {
  const at = code.indexOf(marker);
  const start = at < 0 ? -1 : code.lastIndexOf("useEffect(", at);
  return start < 0 ? "" : callText(code, start);
}

/** The dependency list closing an effect call. */
function dependencies(effect: string): string[] {
  const list = /\[([^\]]*)\]\s*,?\s*\)$/.exec(effect)?.[1] ?? "";
  return list.split(",").map((dep) => dep.trim()).filter(Boolean);
}

const TIMER_DEPENDENCIES = ["draft", "saveState.layout", "saveState.revision", "saveState.conflict", "dirty", "saving", "held", "failure", "flushTick", "processId", "token"];
const SETTLE_DEPENDENCIES = ["flushTick", "dirty", "saving", "failure", "saveState.conflict", "saveState.revision"];

interface Sources {
  toolbar: string;
  screen: string;
  header: string;
}

function scan({ toolbar, screen, header }: Sources): string[] {
  const violations: string[] = [];
  const flag = (holds: boolean, name: string) => {
    if (!holds) violations.push(name);
  };

  // The timer (3.2).
  const timer = effectHolding(toolbar, "autosaveWait(");
  flag(/\bconflict:\s*saveState\.conflict\b/.test(timer), "the timer effect does not read the conflict");
  const waitAt = timer.indexOf("autosaveWait(");
  const waitCall = waitAt < 0 ? "" : callText(timer, waitAt);
  flag(/\bdirty,/.test(waitCall) && /\bsaving,/.test(waitCall) && /\bheld,/.test(waitCall), "the timer effect drops dirty, saving or held");
  flag(/\bflushAsked:\s*flushWaiters\.current\.length\s*>\s*0/.test(timer), "the timer effect does not read the waiting flushes");
  flag(/\bnextDirtySince\(/.test(timer), "the timer effect does not advance dirtySince");
  flag(/draft !== lastSent\.current\.draft\s*\|\|\s*saveState\.layout !== lastSent\.current\.layout/.test(timer), "dirtySince does not compare with the last sent pair");
  flag(/draft !== failure\.draft\s*\|\|\s*saveState\.layout !== failure\.layout/.test(timer), "changedSinceFailure does not compare with the failed pair");
  flag(/setTimeout\([^;]*\bdoSave\(\)[^;]*,\s*wait\s*\)/.test(timer) && /\bclearTimeout\(timer\)/.test(timer), "the timer effect does not arm and clear its timer");
  const timerDeps = dependencies(timer);
  for (const dep of TIMER_DEPENDENCIES) flag(timerDeps.includes(dep), `the timer effect does not rerun on ${dep}`);
  flag(/\bif\s*\(\s*dropped\.current\s*\)\s*return;/.test(timer), "the timer effect arms on a dropped draft");

  // `held` names its four cases (3.2, 3.7).
  const held = /\bconst\s+held\s*=\s*([^;]*);/.exec(toolbar)?.[1] ?? "";
  flag(/\bnoticeStands\b/.test(held), "held does not read the restore notice");
  flag(/\bholdSaves\b/.test(held), "held does not read holdSaves");
  flag(/\bpendingDialog === "discard"/.test(held), "held does not read the discard dialog");
  flag(/\bsavePointActs > 0/.test(held), "held does not read a save point request");

  // `doSave` (3.2, 3.3, 3.4).
  const save = bodyAfter(toolbar, "doSave");
  flag(/\bif\s*\(\s*running\.current !== undefined\s*\)\s*return running\.current;/.test(save), "a second save can leave beside a running one");
  flag(/\bdirtySince\.current = undefined;[\s\S]*\blastSent\.current = sent;/.test(save), "a send does not clear dirtySince and record the sent pair");
  flag(!/\bclearError\s*\(/.test(save), "a save clears a banner another act raised");
  flag(/\bsetFailure\(undefined\);/.test(save), "a save's answer does not clear the failure");
  flag(/\bsetFailure\(\(prior\) => nextFailure\(prior, sent, e\)\)/.test(save), "a failed save does not record its failure");
  flag(/\bsetFailure\(\(prior\) => [\s\S]*\bfinally\s*\{[\s\S]*\bsetSaving\(false\)/.test(save), "the failure does not land ahead of the finally");
  flag(/\bis401\(e\)[\s\S]*\bfail\(e\)/.test(save), "a 401 on a save does not end the session");
  flag(/\bonSavedBodyChange\(landed\.draft\)/.test(save), "savedBody does not take the landed entry's draft");
  flag(/\bgetDraft\(processId, token, AbortSignal\.timeout\(SAVE_TIMEOUT_MS\)\)/.test(save), "the 409's stored read carries no timeout");
  flag(/\bunconfirmed\.current\.length > 0[\s\S]*\bgetDraft\(/.test(save) && /\blandedEntry\(/.test(save), "a 409 does not read the stored draft for a lost send");
  flag(/"lost" : "failed"/.test(save), "a failed send does not sort itself into lost or failed");

  // The failure's other clears (3.3).
  flag(/\bif\s*\(\s*failure !== undefined && !dirty\s*\)\s*setFailure\(undefined\);/.test(toolbar), "a clean draft keeps its failure");
  flag(/\bsetFailure\(undefined\);/.test(bodyAfter(toolbar, "reload")), "reload keeps the failure");

  // `flush` and its settling (3.2, 3.4).
  const flushAt = /\bconst\s+flush\s*=\s*useCallback\(/.exec(toolbar);
  const flush = flushAt ? callText(toolbar, flushAt.index) : "";
  flag(/\[\s*\],?\s*\)$/.test(flush), "flush is not a useCallback over no dependency");
  flag(/\bsetFailure\(undefined\);/.test(flush), "a flush does not clear a standing failure first");
  flag(/\bsetFlushTick\(/.test(flush), "a flush does not bump its counter");
  flag(!/\bunconfirmed\b/.test(flush), "a flush touches the unconfirmed list");
  const settle = effectHolding(toolbar, "flushAnswer(");
  flag(/\bflushWaiters\.current = \[\];/.test(settle), "the settling effect keeps its waiters");
  const settleDeps = dependencies(settle);
  for (const dep of SETTLE_DEPENDENCIES) flag(settleDeps.includes(dep), `the settling effect does not rerun on ${dep}`);
  flag(toolbar.indexOf("flushAnswer(") < toolbar.indexOf("autosaveWait(") && toolbar.indexOf("flushAnswer(") > 0, "the settling effect runs after the timer effect");

  // `retry` keeps the failure (D2).
  const retry = bodyAfter(toolbar, "retry");
  flag(/\bif\s*\(\s*!saving\s*\)\s*void doSave\(\);/.test(retry) && !/\bflush\b|\bsetFailure\b/.test(retry), "retry does not send at once and keep the failure");

  // The unmount (3.5).
  const unmount = effectHolding(toolbar, "unmountPlan(");
  flag(/\[\s*\],?\s*\)$/.test(unmount), "the unmount effect has dependencies");
  flag(/\bdropped:\s*dropped\.current\b/.test(unmount), "the unmount does not read dropped");
  flag(/\brunning:\s*request !== undefined/.test(unmount), "the unmount does not read the running request");
  flag(/\bnoticeStands:\s*last\.noticeStands\b/.test(unmount), "the unmount does not read the notice");
  flag(/\.catch\(\(\) => keep\(revision\)\)/.test(unmount), "a rejected last save keeps no copy");
  flag(/\bif\s*\(\s*result === undefined\s*\)\s*keep\(revision\)/.test(unmount), "a last save answering 409 keeps no copy");
  flag(/\brequest\?\.then\([\s\S]*\bif\s*\(\s*dropped\.current\s*\)\s*return;[\s\S]*\bafterRunningSave\(answer, last\)[\s\S]*\blastSave\(answer\.revision\)/.test(unmount), "the chain does not send at the answer's revision");
  flag(/\bdropped\.current = true;[\s\S]*\bdeleteDraft\(/.test(bodyAfter(toolbar, "runDiscard")), "a discard leaves the draft undropped");
  flag(/\bactions\.drop\(\);/.test(bodyAfter(screen, "stashOnUnauthorized")), "a 401 leaves the draft undropped");

  // `EditScreen`'s inputs (3.2, 3.5, 3.8).
  const call = /\buseDraftToolbarActions\s*\(\s*\{/.exec(screen);
  const options = call ? (braced(screen, call.index + call[0].length - 1) ?? "") : "";
  flag(/\bnoticeStands:\s*stash !== undefined/.test(options), "the hook does not read the stash");
  flag(/\bkeepCopy:[\s\S]*\bif\s*\(\s*stash === undefined\s*\)\s*stashDraft\(/.test(options), "keepCopy overwrites a copy that stands");
  flag(/\bonRestored:[\s\S]*\bsetJustPublished\(false\)/.test(options), "a restore keeps the Versions offer");
  flag(/\bonRestored:[\s\S]*\bselectionAfterRestore\(selected, record\.body\)/.test(options), "a restore keeps the selection unfiltered");
  flag(/\bonRestored:[\s\S]*\bsetSelectedPathId\(undefined\)/.test(options), "a restore keeps the selected path");

  // Publish (3.6).
  const publish = bodyAfter(toolbar, "publish");
  flag(/\bsetPendingDialog\("publish"\)/.test(publish), "publish opens no dialog");
  flag(/\bif\s*\(\s*!result\.saved\s*\)\s*setPendingDialog\(\(open\) => \(open === "publish" \? null : open\)\)/.test(publish), "a failed flush does not close the publish dialog alone");
  flag(/\bif\s*\(\s*!dirty && !saving\s*\)\s*void runPublish\(\)/.test(bodyAfter(toolbar, "resolveDialog")), "a press on a waiting confirm publishes");

  // Publish under a conflict (4.4): no dialog, and the focus lands on what resolves it.
  flag(/^\s*if\s*\(\s*saveState\.conflict\s*\)\s*return "conflict";/.test(publish), "publish under a conflict opens the dialog");
  const publishControl = /<PublishNavControl\b[\s\S]*?onPublish=\{\(\) => \{([^}]*)\}\}/.exec(header)?.[1] ?? "";
  flag(/\bif\s*\(\s*actions\.publish\(\) === "conflict"\s*\)\s*reloadRef\.current\?\.focus\(\);/.test(publishControl), "Publish under a conflict does not move the focus to Reload");
  flag(/<button ref=\{reloadRef\}[^>]*onClick=\{actions\.reload\}/.test(header), "the focus target is not the conflict banner's Reload");

  // The state line (4.2): one re-render at the minute, armed once per save.
  const passMinute = effectHolding(header, "savedJustNowLeft(");
  flag(/\bsetTimeout\(\(\) => passMinute\(/.test(passMinute), "no timer turns Saved just now into Saved at");
  flag(/\breturn \(\) => clearTimeout\(timer\)/.test(passMinute), "the minute's timer outlives the save it counts from");
  flag(/\[lastSavedAt\]\s*,?\s*\)$/.test(passMinute), "the minute's timer does not rearm per save");
  flag(/\bconst line = headerStateLine\(\{[^}]*\bnow: Date\.now\(\)/.test(header), "the state line reads a stale clock");
  flag(/\bstateWordsHeld:\s*\{\s*"::after":\s*\{\s*content:\s*"attr\(data-held-width\)"/.test(header), "the state's words hold no width");
  flag(/\bstateWords:\s*\{\s*display:\s*"inline-block",?\s*\}/.test(header), "the state's words take a minimum at rest");
  flag(/\bchangedOnce && styles\.stateWordsHeld\b/.test(header), "the words' width does not wait for the first change");
  flag(/\bif\s*\(\s*line\.state !== "saved" && !changedOnce\s*\)\s*setChangedOnce\(true\);/.test(header), "the words' width does not stay after the first change");
  flag(/\bdata-held-width=\{changedOnce \? t\("headerBar\.savedJustNow"\) : undefined\}/.test(header), "the words' width is not that of Saved just now");
  flag(/\bconst line = headerStateLine\(\{[^}]*\bnoticeStands, jsonUnapplied, lastSavedAt\b/.test(header), "the state line does not read unapplied JSON");
  flag(/\bjsonUnapplied=\{jsonUnapplied\}/.test(screen), "the header bar does not hear of unapplied JSON");
  flag(/\bfailed=\{actions\.saveFailed !== null\}/.test(header), "the state line does not read the failed save");
  const announced = effectHolding(header, "stateAnnouncement(");
  flag(/\[line\.state\]\s*,?\s*\)$/.test(announced) && /\bheardUnsaved\.current = heard\b/.test(announced), "the hidden status does not follow the state");
  flag(/role="status"[^>]*>\s*\{announcement\}/.test(header), "the hidden status prints no announcement");

  // Try again (4.3).
  const banner = /<button[^>]*?aria-disabled=\{actions\.saving \? true : undefined\}[\s\S]*?<\/button>/.exec(header)?.[0] ?? "";
  flag(/\bif\s*\(\s*!actions\.saving\s*\)\s*actions\.retry\(\);/.test(banner), "a press during a save passes Try again's guard");
  flag(/\bonFocus=\{[^}]*\{\s*tryAgainHeld\.current = true;/.test(banner) && /\bonBlur=\{[^}]*\{\s*tryAgainHeld\.current = false;/.test(banner), "the ref does not follow Try again's focus");
  flag(/!dialogOpen && actions\.saveFailed !== null/.test(header), "the failed save's banner stands behind a dialog");

  // What the exits read (4.5).
  flag(/\bconst changeNotLanded = dirtyNow \|\| actions\.saving;/.test(screen), "an exit does not wait on a running save");
  flag(/\bonDirtyChange\?\.\(changeNotLanded\)/.test(screen), "the screen reports no running save upward");
  flag(/\bonFlushChange\?\.\(\{ flush, drop \}\)/.test(screen), "the screen does not report flush and drop upward");
  flag(/\bonFlushChange\?\.\(undefined\)/.test(screen), "an unmount leaves a stale flush upward");
  flag(/\bholdSaves,/.test(options), "the leave dialog's hold does not reach the hook");

  // The two dialogs' props (3.6, 3.7).
  flag(/\bwaiting=\{isDirty \|\| actions\.saving\}/.test(header), "the publish confirm does not wait on the save");
  flag(/\bbusy=\{actions\.publishing\}/.test(header), "the publish dialog's busy reads a request it did not start");
  flag(/\bbusy=\{actions\.discarding \|\| actions\.saving\}/.test(header), "the discard dialog's busy does not wait on a running save");

  // The unmount's commit (final review I1): a render that crashed writes nothing.
  flag(/\buseLayoutEffect\(\(\) => \{\s*latest\.current = commit;\s*\}\);/.test(toolbar), "the unmount does not read the last commit");

  // A restore's lost answer (final review I2).
  const lostRestore = actBody(toolbar, "restore");
  flag(/\bclassifySaveFailure\(e\)\.lost\b/.test(lostRestore), "a restore does not sort out a lost answer");
  flag(/\bgetDraft\(processId, token, AbortSignal\.timeout\(SAVE_TIMEOUT_MS\)\)/.test(lostRestore), "a restore's stored read carries no timeout");
  flag(/\bis401\(readError\)\) throw readError/.test(lostRestore), "a 401 on a restore's stored read does not end the session");
  flag(/\bif \(!restoreLanded\(stored, flushed\.revision\)\) throw e;\s*record = stored;/.test(lostRestore), "a restore that landed unseen is not adopted");

  // Reload over a draft that went (final review M8), and what a restore moves (M4).
  flag(/\bif \(!record\) \{\s*setError\(t\("error\.notFound"\)\)/.test(bodyAfter(toolbar, "reload")), "a reload of a draft that went says nothing");
  flag(/\bclearError\(\);/.test(bodyAfter(toolbar, "reload")), "a reload keeps a banner it resolved");
  flag(/\bonRestored:\s*\(record\) => \{\s*setLastSavedAt\(new Date\(\)\);/.test(options), "a restore does not move Saved at");

  // The save point acts (3.8).
  const adopt = bodyAfter(toolbar, "adoptDraft");
  flag(/\breplace\(body\)/.test(adopt) && /\bonSavedBodyChange\(body\)/.test(adopt), "adoptDraft does not leave the draft clean");
  flag(!/\bonCanPublishChange\b/.test(adopt), "adoptDraft reports a permission");
  flag(!/\bdoSave\b|\bflush\b|\bonSaved\b/.test(adopt), "adoptDraft starts a save");
  const reload = bodyAfter(toolbar, "reload");
  flag(/\badoptDraft\(record\)/.test(reload) && /\bonCanPublishChange\?\.\(record\.canPublish\)/.test(reload), "reload does not adopt and report the permission");
  const create = actBody(toolbar, "create");
  flag(/\bawait flush\(\)[\s\S]*\brequestCreateSavePoint\(processId, \{ name, revision: flushed\.revision \}/.test(create), "a create does not flush first and carry the answer's revision");
  const restore = actBody(toolbar, "restore");
  flag(/\bawait flush\(\)[\s\S]*\brequestRestoreSavePoint\([^;]*revision: flushed\.revision/.test(restore), "a restore does not flush first and carry the answer's revision");
  flag(/\bkeptPointName\(point\.name\)/.test(restore), "a restore does not name its kept point");
  flag(/\badoptDraft\(record\);\s*onRestored\?\.\(record\);/.test(restore), "a restore does not adopt its answer and report it");
  flag(!/\breload\(/.test(restore), "a restore runs the whole reload");
  flag(/\bif\s*\(\s*!flushed\.saved\s*\)\s*return \{ kind: "unsaved" \}/.test(create) && /\bif\s*\(\s*!flushed\.saved\s*\)\s*return \{ kind: "unsaved" \}/.test(restore), "a false flush does not stop the act");
  const remove = actBody(toolbar, "remove");
  flag(/\brequestRemoveSavePoint\(/.test(remove) && !/\bflush\b/.test(remove), "a remove flushes first");
  const request = bodyAfter(toolbar, "savePointRequest");
  flag(/\bsetSavePointActs\(\(count\) => count \+ 1\)[\s\S]*\bfinally\s*\{\s*setSavePointActs\(\(count\) => count - 1\)/.test(request), "a save point request does not hold the saves");
  flag(/\bis401\(e\)[\s\S]*\bfail\(e\)/.test(request), "a 401 on a save point request does not end the session");
  flag(/\braiseConflict\(\)/.test(request) && /\braiseConflict\(\)/.test(create) && /\braiseConflict\(\)/.test(restore), "a save point 409 raises no conflict");

  return violations;
}

const real: Sources = {
  toolbar: read("panels/DraftToolbar.tsx"),
  screen: read("screens/EditScreen.tsx"),
  header: read("panels/ProcessHeaderBar.tsx"),
};

/** Replaces the first match. It fails when nothing matches, so a mutation that
 * drifted from the source cannot pass as a clean scan. */
function mutate(file: keyof Sources, from: RegExp | string, to: string): Sources {
  const out = real[file].replace(from, to);
  expect(out, `the mutation ${String(from)} matched nothing in ${file}`).not.toBe(real[file]);
  return { ...real, [file]: out };
}

describe("the autosave's wiring", () => {
  it("the real sources have no violation", () => {
    expect(scan(real)).toEqual([]);
  });

  it("an effect without its conflict guard is flagged", () => {
    expect(scan(mutate("toolbar", "conflict: saveState.conflict,\n      held,", "conflict: false,\n      held,"))).toEqual(["the timer effect does not read the conflict"]);
  });

  it("a timer that does not clear is flagged, since the debounce is that clear", () => {
    expect(scan(mutate("toolbar", "return () => clearTimeout(timer);", "return undefined;"))).toEqual(["the timer effect does not arm and clear its timer"]);
  });

  it("a timer effect that misses any dependency is flagged", () => {
    const list = dependencies(effectHolding(real.toolbar, "autosaveWait(")).join(", ");
    for (const dep of TIMER_DEPENDENCIES) {
      const kept = TIMER_DEPENDENCIES.filter((other) => other !== dep).join(", ");
      expect(scan(mutate("toolbar", list, kept))).toEqual([`the timer effect does not rerun on ${dep}`]);
    }
  });

  it("a settling effect that misses any dependency is flagged", () => {
    const list = dependencies(effectHolding(real.toolbar, "flushAnswer(")).join(", ");
    for (const dep of SETTLE_DEPENDENCIES) {
      const kept = SETTLE_DEPENDENCIES.filter((other) => other !== dep).join(", ");
      expect(scan(mutate("toolbar", list, kept))).toEqual([`the settling effect does not rerun on ${dep}`]);
    }
  });

  it("a wait that drops dirty, saving or held is flagged, and nextDirtySince's own dirty does not hide it", () => {
    for (const [from, to] of [["dirty,\n      saving,", "dirty: true,\n      saving,"], ["saving,\n      conflict:", "saving: false,\n      conflict:"], ["held,\n      flushAsked:", "held: false,\n      flushAsked:"]] as const) {
      expect(scan(mutate("toolbar", from, to))).toEqual(["the timer effect drops dirty, saving or held"]);
    }
  });

  it("a timer effect that ignores the waiting flushes is flagged", () => {
    expect(scan(mutate("toolbar", "flushAsked: flushWaiters.current.length > 0,", "flushAsked: false,"))).toEqual(["the timer effect does not read the waiting flushes"]);
  });

  it("a timer effect that does not advance dirtySince is flagged", () => {
    expect(scan(mutate("toolbar", "nextDirtySince(dirtySince.current, {", "((_c: unknown, _s: unknown) => undefined)(dirtySince.current, {"))).toEqual(["the timer effect does not advance dirtySince"]);
  });

  it("a later change that does not read as one is flagged", () => {
    expect(scan(mutate("toolbar", "(draft !== failure.draft || saveState.layout !== failure.layout)", "false"))).toEqual(["changedSinceFailure does not compare with the failed pair"]);
  });

  it("a timer armed on a dropped draft is flagged", () => {
    expect(scan(mutate("toolbar", /if \(dropped\.current\) return;\s*const now/, "const now"))).toEqual(["the timer effect arms on a dropped draft"]);
  });

  it("an answer that keeps the failure is flagged", () => {
    expect(scan(mutate("toolbar", /setFailure\(undefined\);\s*onSaveState\(\(current\)/, "onSaveState((current)"))).toEqual(["a save's answer does not clear the failure"]);
  });

  it("a failure that does not record what was thrown is flagged", () => {
    expect(scan(mutate("toolbar", "nextFailure(prior, sent, e)", "nextFailure(prior, sent, undefined)"))).toEqual(["a failed save does not record its failure"]);
  });

  it("a 401 on a save that does not end the session is flagged", () => {
    expect(scan(mutate("toolbar", /fail\(e\);\s*return \{ saved: false \};/, "return { saved: false };"))).toEqual(["a 401 on a save does not end the session"]);
  });

  it("a send that does not sort itself into lost or failed is flagged", () => {
    expect(scan(mutate("toolbar", 'classifySaveFailure(e).lost ? "lost" : "failed"', '"failed"'))).toEqual(["a failed send does not sort itself into lost or failed"]);
  });

  it("a 409 read with no timeout is flagged, since it would hold saving for good", () => {
    expect(scan(mutate("toolbar", "getDraft(processId, token, AbortSignal.timeout(SAVE_TIMEOUT_MS))", "getDraft(processId, token)"))).toEqual(["the 409's stored read carries no timeout"]);
  });

  it("a flush that bumps no counter is flagged", () => {
    expect(scan(mutate("toolbar", "setFlushTick((tick) => tick + 1);", ""))).toEqual(["a flush does not bump its counter"]);
  });

  it("a settling effect that keeps its waiters is flagged", () => {
    expect(scan(mutate("toolbar", "flushWaiters.current = [];", ""))).toEqual(["the settling effect keeps its waiters"]);
  });

  it("a settling effect placed after the timer effect is flagged", () => {
    const settling = effectHolding(real.toolbar, "flushAnswer(");
    const moved = real.toolbar.replace(`${settling};`, "").replace("const commit =", `${settling};\nconst commit =`);
    expect(moved).not.toBe(real.toolbar);
    expect(scan({ ...real, toolbar: moved })).toEqual(["the settling effect runs after the timer effect"]);
  });

  it("an unmount that ignores the running request is flagged", () => {
    expect(scan(mutate("toolbar", "running: request !== undefined,", "running: false,"))).toEqual(["the unmount does not read the running request"]);
  });

  it("a publish that opens no dialog is flagged", () => {
    expect(scan(mutate("toolbar", 'setPendingDialog("publish");', ""))).toEqual(["publish opens no dialog"]);
  });

  it("an adopted draft that does not read clean is flagged", () => {
    expect(scan(mutate("toolbar", "onSavedBodyChange(body);", ""))).toEqual(["adoptDraft does not leave the draft clean"]);
    expect(scan(mutate("toolbar", "replace(body);", ""))).toEqual(["adoptDraft does not leave the draft clean"]);
  });

  it("an adopted draft that starts a save is flagged", () => {
    expect(scan(mutate("toolbar", "replace(body);", "replace(body);\nvoid doSave();"))).toEqual(["adoptDraft starts a save"]);
  });

  it("a restore that does not name its kept point is flagged", () => {
    expect(scan(mutate("toolbar", "keptPointName(point.name)", "point.name"))).toEqual(["a restore does not name its kept point"]);
  });

  it("a false flush that does not stop the act is flagged", () => {
    expect(scan(mutate("toolbar", /("create", async \(\) => \{\s*const flushed = await flush\(\);)\s*if \(!flushed\.saved\) return \{ kind: "unsaved" \};/, "$1"))).toEqual(["a false flush does not stop the act"]);
    expect(scan(mutate("toolbar", /("restore", async \(\) => \{\s*const flushed = await flush\(\);)\s*if \(!flushed\.saved\) return \{ kind: "unsaved" \};/, "$1"))).toEqual(["a false flush does not stop the act"]);
  });

  it("a 401 on a save point request that does not end the session is flagged", () => {
    expect(scan(mutate("toolbar", /fail\(e\);\s*return \{ kind: "ended" \};/, 'return { kind: "ended" };'))).toEqual(["a 401 on a save point request does not end the session"]);
  });

  it("a save point 409 that raises no conflict is flagged, at each of its three sites", () => {
    expect(scan(mutate("toolbar", 'if (outcome.kind === "conflict") raiseConflict();', ""))).toEqual(["a save point 409 raises no conflict"]);
    expect(scan(mutate("toolbar", /(if \(point === undefined\) \{)\s*raiseConflict\(\);/, "$1"))).toEqual(["a save point 409 raises no conflict"]);
    expect(scan(mutate("toolbar", /(if \(record === undefined\) \{)\s*raiseConflict\(\);/, "$1"))).toEqual(["a save point 409 raises no conflict"]);
  });

  it("dirtySince measured from any commit is flagged", () => {
    expect(scan(mutate("toolbar", "changed: draft !== lastSent.current.draft || saveState.layout !== lastSent.current.layout,", "changed: true,"))).toEqual(["dirtySince does not compare with the last sent pair"]);
  });

  it("a send that keeps dirtySince is flagged, since the debounce would drop", () => {
    expect(scan(mutate("toolbar", "dirtySince.current = undefined;\n", "\n"))).toEqual(["a send does not clear dirtySince and record the sent pair"]);
  });

  it("each case of held is flagged when it goes", () => {
    expect(scan(mutate("toolbar", "noticeStands || holdSaves", "holdSaves"))).toEqual(["held does not read the restore notice"]);
    expect(scan(mutate("toolbar", "noticeStands || holdSaves ||", "noticeStands ||"))).toEqual(["held does not read holdSaves"]);
    expect(scan(mutate("toolbar", ' || pendingDialog === "discard"', ""))).toEqual(["held does not read the discard dialog"]);
    expect(scan(mutate("toolbar", " || savePointActs > 0", ""))).toEqual(["held does not read a save point request"]);
  });

  it("a second send beside a running one is flagged", () => {
    expect(scan(mutate("toolbar", "if (running.current !== undefined) return running.current;", ""))).toEqual(["a second save can leave beside a running one"]);
  });

  it("a plain clearError on a successful save is flagged", () => {
    expect(scan(mutate("toolbar", "        setFailure(undefined);\n        onSaveState((current)", "        clearError();\n        setFailure(undefined);\n        onSaveState((current)"))).toEqual(["a save clears a banner another act raised"]);
  });

  it("a lost clean-draft clear is flagged", () => {
    expect(scan(mutate("toolbar", "if (failure !== undefined && !dirty) setFailure(undefined);", ""))).toEqual(["a clean draft keeps its failure"]);
  });

  it("a reload that keeps the failure is flagged", () => {
    expect(scan(mutate("toolbar", "adoptDraft(record);\n      setFailure(undefined);", "adoptDraft(record);"))).toEqual(["reload keeps the failure"]);
  });

  it("a failure landing after the finally is flagged", () => {
    const moved = mutate("toolbar", /setFailure\(\(prior\) => nextFailure\(prior, sent, e\)\);\s*return \{ saved: false \};\s*\} finally \{/, "return { saved: false };\n} finally {\nvoid (() => setFailure((prior) => nextFailure(prior, sent, e)));");
    expect(scan(moved)).toEqual(["the failure does not land ahead of the finally"]);
  });

  it("a savedBody that takes the record's body is flagged", () => {
    expect(scan(mutate("toolbar", "onSavedBodyChange(landed.draft);", "onSavedBodyChange(result.body as Draft);"))).toEqual(["savedBody does not take the landed entry's draft"]);
  });

  it("a 409 that reads no stored draft is flagged", () => {
    expect(scan(mutate("toolbar", "const entry = stored && landedEntry(unconfirmed.current, stored);", "const entry = stored && undefined;"))).toEqual(["a 409 does not read the stored draft for a lost send"]);
  });

  it("a flush that keeps a standing failure is flagged", () => {
    expect(scan(mutate("toolbar", /(flushWaiters\.current\.push\(resolve\);)\s*setFailure\(undefined\);/, "$1"))).toEqual(["a flush does not clear a standing failure first"]);
  });

  it("a flush with dependencies is flagged, since root holds it in a ref", () => {
    expect(scan(mutate("toolbar", /(setFlushTick\(\(tick\) => tick \+ 1\);\s*\}\),\s*)\[\]/, "$1[draft]"))).toContain("flush is not a useCallback over no dependency");
  });

  it("a flush that touches the unconfirmed list is flagged", () => {
    expect(scan(mutate("toolbar", "flushWaiters.current.push(resolve);", "flushWaiters.current.push(resolve);\nunconfirmed.current = [];"))).toEqual(["a flush touches the unconfirmed list"]);
  });

  it("a retry that clears the failure is flagged", () => {
    expect(scan(mutate("toolbar", /const retry = \(\) => \{\s*if \(!saving\) void doSave\(\);\s*\};/, "const retry = () => { void flush(); };"))).toEqual(["retry does not send at once and keep the failure"]);
  });

  it("a retry that clears the failure before it sends is flagged", () => {
    expect(scan(mutate("toolbar", /(const retry = \(\) => \{)/, "$1 setFailure(undefined);"))).toEqual(["retry does not send at once and keep the failure"]);
  });

  it("a Publish under a standing conflict that opens the dialog is flagged", () => {
    expect(scan(mutate("toolbar", /if \(saveState\.conflict\) return "conflict";/, ""))).toEqual(["publish under a conflict opens the dialog"]);
  });

  it("a Publish under a standing conflict that leaves the focus behind is flagged", () => {
    expect(scan(mutate("header", /if \(actions\.publish\(\) === "conflict"\) reloadRef\.current\?\.focus\(\);/, "actions.publish();"))).toEqual(["Publish under a conflict does not move the focus to Reload"]);
  });

  it("a focus target other than the conflict banner's Reload is flagged", () => {
    expect(scan(mutate("header", "<button ref={reloadRef} ", "<button "))).toEqual(["the focus target is not the conflict banner's Reload"]);
  });

  it("a state line that never turns Saved at at the minute is flagged", () => {
    expect(scan(mutate("header", /setTimeout\(\(\) => passMinute\(\(minutes\) => minutes \+ 1\), left \+ 1\)/, "setTimeout(() => {}, left + 1)"))).toEqual(["no timer turns Saved just now into Saved at"]);
  });

  it("a minute's timer that survives its save is flagged", () => {
    expect(scan(mutate("header", /return \(\) => clearTimeout\(timer\);(\s*\}, \[lastSavedAt\])/, "$1"))).toEqual(["the minute's timer outlives the save it counts from"]);
  });

  it("a minute's timer armed once a mount is flagged, since a later save would keep the first deadline", () => {
    expect(scan(mutate("header", "}, [lastSavedAt]);", "}, []);"))).toEqual(["the minute's timer does not rearm per save"]);
  });

  it("a state line that holds its first clock is flagged", () => {
    expect(scan(mutate("header", "now: Date.now(), baseVersion", "now: 0, baseVersion"))).toEqual(["the state line reads a stale clock"]);
  });

  it("state words that hold no width are flagged, since what follows them would move", () => {
    expect(scan(mutate("header", /content: "attr\(data-held-width\)"/, 'content: \'""\''))).toEqual(["the state's words hold no width"]);
    expect(scan(mutate("header", /data-held-width=\{changedOnce \? t\("headerBar\.savedJustNow"\) : undefined\}/, 'data-held-width={changedOnce ? t("headerBar.saved") : undefined}'))).toEqual(["the words' width is not that of Saved just now"]);
  });

  it("a minimum at rest is flagged, since Saved would leave a hole", () => {
    expect(scan(mutate("header", /(stateWords: \{\s*display: "inline-block",)/, '$1\n    minWidth: "14ch",'))).toEqual(["the state's words take a minimum at rest"]);
    expect(scan(mutate("header", /changedOnce && styles\.stateWordsHeld/, "styles.stateWordsHeld"))).toEqual(["the words' width does not wait for the first change"]);
  });

  it("a width that lets go after the first change is flagged", () => {
    expect(scan(mutate("header", /if \(line\.state !== "saved" && !changedOnce\) setChangedOnce\(true\);/, ""))).toEqual(["the words' width does not stay after the first change"]);
  });

  it("a state line blind to unapplied JSON is flagged", () => {
    expect(scan(mutate("header", /noticeStands, jsonUnapplied, lastSavedAt, now/, "noticeStands, jsonUnapplied: false, lastSavedAt, now"))).toEqual(["the state line does not read unapplied JSON"]);
    expect(scan(mutate("screen", /\bjsonUnapplied=\{jsonUnapplied\}/, "jsonUnapplied={false}"))).toEqual(["the header bar does not hear of unapplied JSON"]);
  });

  it("an unmount that reads a render, not a commit, is flagged, since a render crash would save the draft that crashed", () => {
    expect(scan(mutate("toolbar", /useLayoutEffect\(\(\) => \{\s*latest\.current = commit;\s*\}\);/, "latest.current = commit;"))).toEqual(["the unmount does not read the last commit"]);
  });

  it("a restore whose lost answer is not followed up is flagged, at each step", () => {
    expect(scan(mutate("toolbar", /if \(!classifySaveFailure\(e\)\.lost\) throw e;/, "throw e;"))).toEqual(["a restore does not sort out a lost answer"]);
    expect(scan(mutate("toolbar", /await getDraft\(processId, token, AbortSignal\.timeout\(SAVE_TIMEOUT_MS\)\)\.catch/, "await getDraft(processId, token).catch"))).toEqual(["a restore's stored read carries no timeout"]);
    expect(scan(mutate("toolbar", /if \(is401\(readError\)\) throw readError;/, ""))).toEqual(["a 401 on a restore's stored read does not end the session"]);
    expect(scan(mutate("toolbar", /if \(!restoreLanded\(stored, flushed\.revision\)\) throw e;\s*record = stored;/, "throw e;"))).toEqual(["a restore that landed unseen is not adopted"]);
  });

  it("a reload of a draft that went, in silence, is flagged", () => {
    expect(scan(mutate("toolbar", /setError\(t\("error\.notFound"\)\);/, ""))).toEqual(["a reload of a draft that went says nothing"]);
  });

  it("a restore that leaves Saved at behind is flagged", () => {
    expect(scan(mutate("screen", /(onRestored: \(record\) => \{\s*)setLastSavedAt\(new Date\(\)\);/, "$1"))).toEqual(["a restore does not move Saved at"]);
  });

  it("a state line blind to the failed save is flagged", () => {
    expect(scan(mutate("header", "failed={actions.saveFailed !== null}", "failed={false}"))).toEqual(["the state line does not read the failed save"]);
  });

  it("a hidden status that stops following the state is flagged", () => {
    expect(scan(mutate("header", "}, [line.state]);", "}, []);"))).toEqual(["the hidden status does not follow the state"]);
    expect(scan(mutate("header", "{announcement}", "{words}"))).toEqual(["the hidden status prints no announcement"]);
  });

  it("a press that passes a running retry's guard is flagged", () => {
    expect(scan(mutate("header", "if (!actions.saving) actions.retry();", "actions.retry();"))).toEqual(["a press during a save passes Try again's guard"]);
  });

  it("a ref that does not follow Try again's focus is flagged", () => {
    expect(scan(mutate("header", /onFocus=\{\(\) => \{\s*tryAgainHeld\.current = true;\s*\}\}/, ""))).toEqual(["the ref does not follow Try again's focus"]);
    expect(scan(mutate("header", /onBlur=\{\(\) => \{\s*tryAgainHeld\.current = false;\s*\}\}/, ""))).toEqual(["the ref does not follow Try again's focus"]);
  });

  it("a failed save's banner behind an open dialog is flagged", () => {
    expect(scan(mutate("header", "!dialogOpen && actions.saveFailed !== null", "actions.saveFailed !== null"))).toEqual(["the failed save's banner stands behind a dialog"]);
  });

  it("a report upward that drops the running save is flagged", () => {
    expect(scan(mutate("screen", "const changeNotLanded = dirtyNow || actions.saving;", "const changeNotLanded = dirtyNow;"))).toEqual(["an exit does not wait on a running save"]);
    expect(scan(mutate("screen", "onDirtyChange?.(changeNotLanded)", "onDirtyChange?.(dirtyNow)"))).toEqual(["the screen reports no running save upward"]);
  });

  it("a flush that does not reach root.tsx, or stays after the unmount, is flagged", () => {
    expect(scan(mutate("screen", "onFlushChange?.({ flush, drop });", ""))).toEqual(["the screen does not report flush and drop upward"]);
    expect(scan(mutate("screen", "return () => onFlushChange?.(undefined);", ""))).toEqual(["an unmount leaves a stale flush upward"]);
  });

  it("a leave dialog's hold that does not reach the hook is flagged", () => {
    expect(scan(mutate("screen", /\n\s*holdSaves,/, ""))).toEqual(["the leave dialog's hold does not reach the hook"]);
  });

  it("an unmount effect with dependencies is flagged, since it would act on each change", () => {
    expect(scan(mutate("toolbar", /(lastSave\(answer\.revision\);\s*\}\);\s*\}\s*\},\s*)\[\]/, "$1[draft]"))).toEqual(["the unmount effect has dependencies"]);
  });

  it("an unmount that ignores dropped is flagged", () => {
    expect(scan(mutate("toolbar", "dropped: dropped.current,", "dropped: false,"))).toEqual(["the unmount does not read dropped"]);
  });

  it("an unmount that ignores the notice is flagged", () => {
    expect(scan(mutate("toolbar", "noticeStands: last.noticeStands,", "noticeStands: false,"))).toEqual(["the unmount does not read the notice"]);
  });

  it("a rejected last save that keeps no copy is flagged", () => {
    expect(scan(mutate("toolbar", ".catch(() => keep(revision));", ".catch(() => undefined);"))).toEqual(["a rejected last save keeps no copy"]);
  });

  it("a last save answering 409 that keeps no copy is flagged", () => {
    expect(scan(mutate("toolbar", "if (result === undefined) keep(revision);", ""))).toEqual(["a last save answering 409 keeps no copy"]);
  });

  it("a chain at the old revision is flagged", () => {
    expect(scan(mutate("toolbar", "lastSave(answer.revision);", "lastSave(last.revision);"))).toEqual(["the chain does not send at the answer's revision"]);
  });

  it("a discard that leaves the draft undropped is flagged", () => {
    expect(scan(mutate("toolbar", /dropped\.current = true;\s*try \{\s*await deleteDraft/, "try {\nawait deleteDraft"))).toContain("a discard leaves the draft undropped");
  });

  it("a 401 that leaves the draft undropped is flagged", () => {
    expect(scan(mutate("screen", "actions.drop();", ""))).toEqual(["a 401 leaves the draft undropped"]);
  });

  it("a keepCopy that overwrites a standing copy is flagged", () => {
    expect(scan(mutate("screen", "if (stash === undefined) stashDraft(tabStorage(), actorId, processId, copy);", "stashDraft(tabStorage(), actorId, processId, copy);"))).toEqual(["keepCopy overwrites a copy that stands"]);
  });

  it("a hook that does not read the stash is flagged", () => {
    expect(scan(mutate("screen", "noticeStands: stash !== undefined,", "noticeStands: false,"))).toEqual(["the hook does not read the stash"]);
  });

  it("each of a restore's retirements is flagged when it goes", () => {
    expect(scan(mutate("screen", /setJustPublished\(false\);(\s*setSelectedStepIds)/, "$1"))).toEqual(["a restore keeps the Versions offer"]);
    expect(scan(mutate("screen", /setSelectedStepIds\(\(selected\) => selectionAfterRestore\(selected, record\.body\)\);/, ""))).toEqual(["a restore keeps the selection unfiltered"]);
    expect(scan(mutate("screen", /(selectionAfterRestore\(selected, record\.body\)\);\s*)setSelectedPathId\(undefined\);/, "$1"))).toEqual(["a restore keeps the selected path"]);
  });

  it("a failed flush that closes any dialog is flagged", () => {
    expect(scan(mutate("toolbar", 'setPendingDialog((open) => (open === "publish" ? null : open))', "setPendingDialog(null)"))).toEqual(["a failed flush does not close the publish dialog alone"]);
  });

  it("a waiting confirm that a press can pass is flagged", () => {
    expect(scan(mutate("toolbar", "if (!dirty && !saving) void runPublish();", "void runPublish();"))).toEqual(["a press on a waiting confirm publishes"]);
  });

  it("each dialog's busy is flagged when it reads the wrong request", () => {
    expect(scan(mutate("header", "waiting={isDirty || actions.saving}", "waiting={false}"))).toEqual(["the publish confirm does not wait on the save"]);
    expect(scan(mutate("header", "busy={actions.publishing}", "busy={actions.saving || actions.publishing}"))).toEqual(["the publish dialog's busy reads a request it did not start"]);
    expect(scan(mutate("header", "busy={actions.discarding || actions.saving}", "busy={actions.discarding}"))).toEqual(["the discard dialog's busy does not wait on a running save"]);
  });

  it("an adopted draft that wipes a re-read permission is flagged", () => {
    expect(scan(mutate("toolbar", "unconfirmed.current = [];\n    onSaveState(applyReload", "onCanPublishChange?.(false);\n    onSaveState(applyReload"))).toEqual(["adoptDraft reports a permission"]);
  });

  it("a reload that stops reporting the permission is flagged", () => {
    expect(scan(mutate("toolbar", "onCanPublishChange?.(record.canPublish);", ""))).toEqual(["reload does not adopt and report the permission"]);
  });

  it("a save point act with no flush is flagged", () => {
    expect(scan(mutate("toolbar", /const createSavePoint = \(name: string\) =>\s*savePointRequest<SavePointSummary>\("create", async \(\) => \{\s*const flushed = await flush\(\);/, 'const createSavePoint = (name: string) =>\nsavePointRequest<SavePointSummary>("create", async () => {\nconst flushed = { saved: true as const, revision: saveState.revision };'))).toContain("a create does not flush first and carry the answer's revision");
    expect(scan(mutate("toolbar", /savePointRequest<\{ kept: string \}>\("restore", async \(\) => \{\s*const flushed = await flush\(\);/, 'savePointRequest<{ kept: string }>("restore", async () => {\nconst flushed = { saved: true as const, revision: saveState.revision };'))).toContain("a restore does not flush first and carry the answer's revision");
  });

  it("a remove that flushes first is flagged", () => {
    expect(scan(mutate("toolbar", "await requestRemoveSavePoint(", "await flush();\nawait requestRemoveSavePoint("))).toEqual(["a remove flushes first"]);
  });

  it("a restore that reloads whole is flagged", () => {
    expect(scan(mutate("toolbar", "adoptDraft(record);\n      onRestored?.(record);", "reload();\n      onRestored?.(record);"))).toEqual(["a restore does not adopt its answer and report it", "a restore runs the whole reload"]);
  });

  it("a save point request outside held is flagged", () => {
    expect(scan(mutate("toolbar", "setSavePointActs((count) => count + 1);", ""))).toEqual(["a save point request does not hold the saves"]);
  });
});
