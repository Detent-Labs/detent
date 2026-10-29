/**
 * `openspec/changes/deploy-demo-on-podman`, D1: `deploy/engine.Dockerfile`
 * builds the browser bundle in a `build` stage and the final stage carries
 * only `packages/web/dist`, with `WEB_ROOT` pointing at it. `checkEngineImage`
 * returns one message per broken rule; each rule has a mutated copy of the
 * Dockerfile text that breaks it.
 *
 * No database, so no `skipIf`.
 */
import { test, expect } from "bun:test";

const DOCKERFILE = await Bun.file(new URL("../deploy/engine.Dockerfile", import.meta.url)).text();

const DIST = "/app/packages/web/dist";

function checkEngineImage(text: string): string[] {
  const problems: string[] = [];
  const stages = text.split(/^FROM /m).slice(1);
  if (stages.length !== 2 || !/^\S+ AS build\b/.test(stages[0]!)) {
    problems.push("expected a `build` stage followed by one final stage");
    return problems;
  }
  const [build, final] = stages as [string, string];
  if (!/^RUN bun run --filter "\.\/packages\/web" build$/m.test(build)) {
    problems.push("the build stage does not build packages/web");
  }
  if (/^(ENV NODE_ENV|USER )/m.test(build)) {
    problems.push("the build stage sets NODE_ENV or USER");
  }
  if (!new RegExp(`^COPY --from=build ${DIST} ${DIST}$`, "m").test(final)) {
    problems.push("the final stage does not copy packages/web/dist from the build stage");
  }
  if (!new RegExp(`^ENV WEB_ROOT=${DIST}$`, "m").test(final)) {
    problems.push("the final stage does not set WEB_ROOT to the copied bundle");
  }
  if (!/^RUN bun install --production --frozen-lockfile$/m.test(final)) {
    problems.push("the final stage does not install production dependencies only");
  }
  const webRoot = final.indexOf("ENV WEB_ROOT=");
  const copy = final.indexOf("COPY --from=build");
  const user = final.indexOf("USER bun");
  if (copy === -1 || webRoot === -1 || user === -1 || copy > user || webRoot > user) {
    problems.push("the bundle copy and WEB_ROOT must come before USER bun");
  }
  return problems;
}

test("the shipped engine Dockerfile satisfies every image rule", () => {
  expect(checkEngineImage(DOCKERFILE)).toEqual([]);
});

test("a final stage without the dist copy is rejected", () => {
  const broken = DOCKERFILE.replace(/^COPY --from=build .*\n/m, "");
  expect(checkEngineImage(broken)).toContain(
    "the final stage does not copy packages/web/dist from the build stage",
  );
});

test("a final stage that copies from a stage other than build is rejected", () => {
  const broken = DOCKERFILE.replace("COPY --from=build", "COPY --from=other");
  expect(checkEngineImage(broken)).toContain(
    "the final stage does not copy packages/web/dist from the build stage",
  );
});

test("a final stage without WEB_ROOT is rejected", () => {
  const broken = DOCKERFILE.replace(/^ENV WEB_ROOT=.*\n/m, "");
  expect(checkEngineImage(broken)).toContain(
    "the final stage does not set WEB_ROOT to the copied bundle",
  );
});

test("a WEB_ROOT pointing elsewhere is rejected", () => {
  const broken = DOCKERFILE.replace("ENV WEB_ROOT=/app/packages/web/dist", "ENV WEB_ROOT=/srv/www");
  expect(checkEngineImage(broken)).toContain(
    "the final stage does not set WEB_ROOT to the copied bundle",
  );
});

test("a final stage with a full install is rejected", () => {
  const broken = DOCKERFILE.replace("bun install --production --frozen-lockfile", "bun install --frozen-lockfile");
  expect(checkEngineImage(broken)).toContain(
    "the final stage does not install production dependencies only",
  );
});

test("a single-stage Dockerfile is rejected", () => {
  const broken = DOCKERFILE.replace(" AS build", "").replace(/^FROM .*\n/m, "").replace(/^FROM /m, "FROM ");
  expect(checkEngineImage(broken).length).toBeGreaterThan(0);
});

test("NODE_ENV in the build stage is rejected", () => {
  const broken = DOCKERFILE.replace("WORKDIR /app", "ENV NODE_ENV=production\nWORKDIR /app");
  expect(checkEngineImage(broken)).toContain("the build stage sets NODE_ENV or USER");
});

test("WEB_ROOT after USER bun is rejected", () => {
  const broken = DOCKERFILE.replace(/^ENV WEB_ROOT=.*\n/m, "").replace("USER bun", "USER bun\nENV WEB_ROOT=/app/packages/web/dist");
  expect(checkEngineImage(broken)).toContain("the bundle copy and WEB_ROOT must come before USER bun");
});

test("a build stage that does not build the web package is rejected", () => {
  const broken = DOCKERFILE.replace(/^RUN bun run --filter .*\n/m, "");
  expect(checkEngineImage(broken)).toContain("the build stage does not build packages/web");
});
