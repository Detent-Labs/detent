/**
 * `reporting-data-tables`: "Editing a filter requests column choices once
 * per pause". A fake timer drives `createDebouncer`, so the test needs no
 * real wait.
 */
import { expect, test } from "bun:test";
import { createDebouncer, type DebounceTimer } from "../src/areas/reporting/screens/debounce.js";

/** A timer that runs only when the test advances it. */
function fakeTimer(): DebounceTimer & { advance: (ms: number) => void; pending: () => number } {
  let now = 0;
  let nextHandle = 1;
  const queue = new Map<number, { at: number; run: () => void }>();
  return {
    set(run, ms) {
      const handle = nextHandle++;
      queue.set(handle, { at: now + ms, run });
      return handle;
    },
    clear(handle) {
      queue.delete(handle as number);
    },
    advance(ms) {
      now += ms;
      for (const [handle, entry] of queue) {
        if (entry.at > now) continue;
        queue.delete(handle);
        entry.run();
      }
    },
    pending: () => queue.size,
  };
}

test("the first call for a group runs at once, with no timer", () => {
  const timer = fakeTimer();
  const calls: string[] = [];
  const debouncer = createDebouncer(300, timer);
  debouncer.schedule("proc_1", () => calls.push("first"));
  expect(calls).toEqual(["first"]);
  expect(timer.pending()).toBe(0);
});

test("five rapid changes send one call, 300 ms after the last", () => {
  const timer = fakeTimer();
  const calls: string[] = [];
  const debouncer = createDebouncer(300, timer);
  debouncer.schedule("proc_1", () => calls.push("open"));
  calls.length = 0;
  for (const key of ["1", "12", "123", "1234", "12345"]) {
    debouncer.schedule("proc_1", () => calls.push(key));
    timer.advance(299);
  }
  expect(calls).toEqual([]);
  timer.advance(1);
  expect(calls).toEqual(["12345"]);
  expect(timer.pending()).toBe(0);
});

test("a new group runs at once and drops the earlier group's pending call", () => {
  const timer = fakeTimer();
  const calls: string[] = [];
  const debouncer = createDebouncer(300, timer);
  debouncer.schedule("proc_1", () => calls.push("proc_1 open"));
  debouncer.schedule("proc_1", () => calls.push("proc_1 edit"));
  debouncer.schedule("proc_2", () => calls.push("proc_2 open"));
  timer.advance(300);
  expect(calls).toEqual(["proc_1 open", "proc_2 open"]);
});

test("cancel drops a pending call", () => {
  const timer = fakeTimer();
  const calls: string[] = [];
  const debouncer = createDebouncer(300, timer);
  debouncer.schedule("proc_1", () => calls.push("open"));
  debouncer.schedule("proc_1", () => calls.push("edit"));
  debouncer.cancel();
  timer.advance(300);
  expect(calls).toEqual(["open"]);
});
