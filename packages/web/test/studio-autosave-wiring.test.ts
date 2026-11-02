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
  flag(/\bdirty,/.test(timer) && /\bsaving,/.test(timer) && /\bheld,/.test(timer), "the timer effect drops dirty, saving or held");
  flag(/\bflushAsked:\s*flushWaiters\.current\.length\s*>\s*0/.test(timer), "the timer effect does not read the waiting flushes");
  flag(/\bnextDirtySince\(/.test(timer), "the timer effect does not advance dirtySince");
  flag(/draft !== lastSent\.current\.draft\s*\|\|\s*saveState\.layout !== lastSent\.current\.layout/.test(timer), "dirtySince does not compare with the last sent pair");
  flag(/draft !== failure\.draft\s*\|\|\s*saveState\.layout !== failure\.layout/.test(timer), "changedSinceFailure does not compare with the failed pair");
  flag(/setTimeout\([^;]*\bdoSave\(\)[^;]*,\s*wait\s*\)/.test(timer) && /\bclearTimeout\(timer\)/.test(timer), "the timer effect does not arm and clear its timer");
  flag(/\[[^\]]*\bdraft\b[^\]]*\bsaveState\.layout\b[^\]]*\bflushTick\b[^\]]*\]/.test(timer), "the timer effect does not rerun on the draft, the layout and a flush");
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
  flag(toolbar.indexOf("flushAnswer(") < toolbar.indexOf("autosaveWait(") && toolbar.indexOf("flushAnswer(") > 0, "the settling effect runs after the timer effect");

  // `retry` keeps the failure (D2).
  const retry = /\bconst\s+retry\s*=\s*(\w+);/.exec(toolbar)?.[1];
  flag(retry === "save" && /\bif\s*\(\s*!saving\s*\)\s*void doSave\(\);/.test(bodyAfter(toolbar, "save")), "retry does not send at once and keep the failure");

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

  // The two dialogs' props (3.6, 3.7).
  flag(/\bwaiting=\{isDirty \|\| actions\.saving\}/.test(header), "the publish confirm does not wait on the save");
  flag(/\bbusy=\{actions\.publishing\}/.test(header), "the publish dialog's busy reads a request it did not start");
  flag(/\bbusy=\{actions\.discarding \|\| actions\.saving\}/.test(header), "the discard dialog's busy does not wait on a running save");

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

  it("a timer effect that misses a flush's counter is flagged", () => {
    expect(scan(mutate("toolbar", "failure, flushTick, processId", "failure, processId"))).toEqual(["the timer effect does not rerun on the draft, the layout and a flush"]);
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
    expect(scan(mutate("toolbar", "const retry = save;", "const retry = () => flush();"))).toEqual(["retry does not send at once and keep the failure"]);
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
    expect(scan(mutate("screen", /(onRestored: \(record\) => \{\s*)setJustPublished\(false\);/, "$1"))).toEqual(["a restore keeps the Versions offer"]);
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
