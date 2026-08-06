/**
 * Content-Security-Policy meta tag injected at build time only
 * (harden-auth-configuration). Verifies the plugin's shape directly instead
 * of running a full `vite build`, so a regression here fails fast in `bun test`.
 */
import { test, expect, afterEach } from "bun:test";
import { contentSecurityPolicy } from "../vite.config.js";

type MetaTag = { tag: string; attrs: Record<string, string>; injectTo: string };

const ORIGINAL_API_URL = process.env.VITE_API_URL;
afterEach(() => {
  if (ORIGINAL_API_URL === undefined) delete process.env.VITE_API_URL;
  else process.env.VITE_API_URL = ORIGINAL_API_URL;
});

function policyOf(): string {
  const plugin = contentSecurityPolicy();
  const transform = plugin.transformIndexHtml as unknown as () => MetaTag[];
  const tags = transform();
  expect(tags).toHaveLength(1);
  const [tag] = tags;
  expect(tag.tag).toBe("meta");
  expect(tag.attrs["http-equiv"]).toBe("Content-Security-Policy");
  expect(tag.injectTo).toBe("head-prepend");
  return tag.attrs.content;
}

test("the plugin applies to the build only, never dev", () => {
  expect(contentSecurityPolicy().apply).toBe("build");
});

test("the policy carries the minimum required directives", () => {
  delete process.env.VITE_API_URL;
  const policy = policyOf();
  expect(policy).toContain("script-src 'self'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("base-uri 'none'");
  expect(policy).toContain("form-action 'self'");
});

/**
 * The rule, not the one directive `deliver-framing-and-sniffing-headers`
 * removed: a browser honors all three of these only in an HTTP response
 * header. A directive here that the browser ignores reads as protection and
 * gives none, so re-adding any of the three must fail this test.
 * `frame-ancestors` now ships from `src/http/static.ts` and
 * `docker/nginx.conf`.
 */
test("the meta policy carries no directive a meta tag ignores", () => {
  delete process.env.VITE_API_URL;
  const policy = policyOf();
  for (const inert of ["frame-ancestors", "report-uri", "sandbox"]) {
    expect(policy).not.toContain(inert);
  }
});

test("connect-src is 'self' only, when VITE_API_URL is unset", () => {
  delete process.env.VITE_API_URL;
  expect(policyOf()).toContain("connect-src 'self';");
});

test("connect-src widens to include VITE_API_URL when it's set", () => {
  process.env.VITE_API_URL = "https://api.example.com";
  expect(policyOf()).toContain("connect-src 'self' https://api.example.com;");
});
