import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PluginEnvelopeEditor } from "../src/areas/studio/panels/shared/PluginEnvelopeEditor.js";
import { memoryAt, switchedConfig } from "../src/areas/studio/panels/shared/pluginConfigText.js";

/** `studio-plugin-config-form`: a type change clears the config the old type held. */

describe("switchedConfig", () => {
  it("clears the old key and keeps the description", () => {
    const r = switchedConfig({}, { type: "a", config: { groupId: "g" }, description: "why" }, "b");
    expect(r.config).toEqual({});
    expect(r.description).toBe("why");
    expect(r.memory.a).toEqual({ config: { groupId: "g" }, description: "why" });
  });

  it("restores the config a type last held, and empties that memory entry", () => {
    const away = switchedConfig({}, { type: "a", config: { groupId: "g" } }, "b");
    const back = switchedConfig(away.memory, { type: "b", config: away.config }, "a");
    expect(back.config).toEqual({ groupId: "g" });
    expect(back.memory.a).toBeUndefined();
  });

  it("restores config and description after a switch to nobody", () => {
    const away = switchedConfig({}, { type: "a", config: { groupId: "g" }, description: "why" }, "none");
    const back = switchedConfig(away.memory, undefined, "a");
    expect(back.config).toEqual({ groupId: "g" });
    expect(back.description).toBe("why");
  });

  it("writes nothing to the memory for an empty outgoing type", () => {
    expect(switchedConfig({}, { type: "", config: {} }, "a").memory).toEqual({});
    expect(switchedConfig({}, undefined, "a").memory).toEqual({});
  });
});

describe("memoryAt", () => {
  it("keeps the memory at the same generation and empties it once it moves", () => {
    const memory = { a: { config: { x: 1 } } };
    expect(memoryAt(memory, 3, 3)).toBe(memory);
    expect(memoryAt(memory, 3, 4)).toEqual({});
  });
});

const noop = () => {};
const markup = (props: Parameters<typeof PluginEnvelopeEditor>[0]) => renderToStaticMarkup(<PluginEnvelopeEditor {...props} />);

describe("PluginEnvelopeEditor positions", () => {
  it("draws a select at an action position and at a data source position", () => {
    for (const types of [["email.send"], ["db.list"]]) {
      const html = markup({ label: "L", value: { type: types[0]!, config: {} }, onChange: noop, registryTypes: types });
      expect(html).toContain("<select");
      expect(html).not.toContain('type="text" placeholder');
    }
  });

  it("keeps the free-text input with no registry and no none option", () => {
    const html = markup({ label: "L", value: { type: "x", config: {} }, onChange: noop });
    expect(html).toContain("<input");
    expect(html).not.toContain("<select");
  });
});

describe("noneOption", () => {
  const none = { label: "Nobody in particular", onChoose: noop };

  it("offers the none option first, with no config and no Description on an empty type", () => {
    const html = markup({ label: "L", value: undefined, onChange: noop, registryTypes: ["static"], noneOption: none });
    expect(html.indexOf("Nobody in particular")).toBeLessThan(html.indexOf("static"));
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("Description");
  });

  it("keeps the placeholder pickable beside none for a stored empty type", () => {
    const html = markup({ label: "L", value: { type: "", config: {} }, onChange: noop, registryTypes: ["static"], noneOption: none });
    expect(html).toContain("Nobody in particular");
    expect(html).toContain("-- select type --");
    expect(html).not.toContain("<textarea");
  });

  it("draws a select, not free text, with no registry types, and labels a held type", () => {
    const html = markup({
      label: "L",
      value: { type: "static", config: {} },
      onChange: noop,
      noneOption: none,
      typeLabel: (type) => `Label of ${type}`,
    });
    expect(html).toContain("<select");
    expect(html).toContain("Nobody in particular");
    expect(html).toContain("Label of static");
    expect(html).not.toContain('placeholder=');
    expect(html).not.toContain("unregistered");
  });

  it("shows config and Description once a type is held", () => {
    const html = markup({ label: "L", value: { type: "static", config: {} }, onChange: noop, registryTypes: ["static"], noneOption: none });
    expect(html).toContain("<textarea");
    expect(html).toContain("Description");
  });
});
