import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  dataSourceRemovalReach,
  hasDataSourceReach,
  removeDataSourceAndReferences,
} from "../src/areas/studio/draft/data-source-removal";
import { draftFields } from "../src/areas/studio/draft/fields";
import { runValidation } from "../src/areas/studio/draft/validation";
import type { Draft } from "../src/areas/studio/draft/types";

/** A data source removal's reach, measured before any write: the fields that
 * name the source at every depth, and the column mapping entries on them.
 * Then the removal itself, which clears `dataSource` and `columnMapping` from
 * those fields and splices the source in one recipe. */

const draftOf = (body: Record<string, unknown>): Draft => body as unknown as Draft;

const source = (id: string, key: string) => ({ id, key, type: "db.list", config: {} });

const leaf = (id: string, key: string, extra: Record<string, unknown> = {}) => ({
  id,
  key,
  label: { en: key },
  type: "string",
  ...extra,
});

/** `countries` is named by three fields at two depths: `country` and `origin`
 * at the top, `visa_country` inside the group `travel`. `origin` carries a
 * column mapping with two entries. `currency` names the other source. */
function travelDraft(): Draft {
  return draftOf({
    dataSources: [source("ds_countries", "countries"), source("ds_currencies", "currencies"), source("ds_unused", "unused")],
    fields: [
      leaf("field_country", "country", { dataSource: "ds_countries" }),
      leaf("field_origin", "origin", {
        dataSource: "ds_countries",
        columnMapping: { iso: "field_iso", region: "field_region" },
      }),
      leaf("field_iso", "iso"),
      leaf("field_region", "region"),
      leaf("field_currency", "currency", { dataSource: "ds_currencies", columnMapping: { code: "field_iso" } }),
      {
        id: "field_travel",
        key: "travel",
        label: { en: "Travel" },
        type: "group",
        fields: [leaf("field_visa_country", "visa_country", { dataSource: "ds_countries" })],
      },
    ],
  });
}

describe("dataSourceRemovalReach", () => {
  it("counts no field and no mapping for a source nothing names", () => {
    const reach = dataSourceRemovalReach(travelDraft(), "ds_unused");

    expect(reach).toEqual({ fields: 0, columnMappings: 0 });
    expect(hasDataSourceReach(reach!)).toBe(false);
  });

  it("counts the fields naming the source at both depths, and their mapping entries", () => {
    const reach = dataSourceRemovalReach(travelDraft(), "ds_countries");

    expect(reach).toEqual({ fields: 3, columnMappings: 2 });
    expect(hasDataSourceReach(reach!)).toBe(true);
  });

  it("counts a field with a column mapping once, by its entries", () => {
    const reach = dataSourceRemovalReach(travelDraft(), "ds_currencies");

    expect(reach).toEqual({ fields: 1, columnMappings: 1 });
  });

  it("answers undefined for an id no data source carries", () => {
    expect(dataSourceRemovalReach(travelDraft(), "ds_missing")).toBeUndefined();
    expect(dataSourceRemovalReach(draftOf({}), "ds_countries")).toBeUndefined();
  });
});

describe("removeDataSourceAndReferences", () => {
  it("removes an unused source and touches no field", () => {
    const draft = travelDraft();
    const fieldsBefore = structuredClone(draft.fields);

    removeDataSourceAndReferences(draft, "ds_unused");

    expect(draft.dataSources?.map((ds) => ds.id as string)).toEqual(["ds_countries", "ds_currencies"]);
    expect(draft.fields).toEqual(fieldsBefore);
  });

  it("clears dataSource and columnMapping from the three fields at two depths", () => {
    const draft = travelDraft();

    removeDataSourceAndReferences(draft, "ds_countries");

    expect(draft.dataSources?.map((ds) => ds.id as string)).toEqual(["ds_currencies", "ds_unused"]);
    const byId = new Map(draftFields(draft).map((f) => [f.id as string, f]));
    for (const id of ["field_country", "field_origin", "field_visa_country"]) {
      expect(byId.get(id)).not.toHaveProperty("dataSource");
      expect(byId.get(id)).not.toHaveProperty("columnMapping");
    }
  });

  it("leaves a field naming another data source as it was", () => {
    const draft = travelDraft();

    removeDataSourceAndReferences(draft, "ds_countries");

    const currency = draftFields(draft).find((f) => f.id === "field_currency");
    expect(currency?.dataSource as string | undefined).toBe("ds_currencies");
    expect(currency?.columnMapping as unknown).toEqual({ code: "field_iso" });
    expect(draftFields(draft).find((f) => f.id === "field_iso") as unknown).toEqual(leaf("field_iso", "iso"));
  });

  it("leaves the draft unchanged for an unknown id", () => {
    const draft = travelDraft();
    const before = structuredClone(draft);

    removeDataSourceAndReferences(draft, "ds_missing");

    expect(draft).toEqual(before);
  });
});

/** The Zod issue `definition.ts` raises for a field naming a data source the
 * draft lacks. The cases run on the shipped Employee Onboarding example, whose
 * `assigned_device` field names its one data source and carries a column
 * mapping. */
const UNRESOLVED = "field dataSource does not resolve";

function loadOnboarding(): Draft {
  const raw = JSON.parse(readFileSync(new URL("../../../examples/employee-onboarding.json", import.meta.url), "utf-8"));
  return (raw.definition ?? raw) as Draft;
}

const unresolved = (draft: Draft) => runValidation(draft, undefined, {}, {}).issues.filter((i) => i.message.includes(UNRESOLVED));

describe("removeDataSourceAndReferences against runValidation", () => {
  it("starts from an example with no unresolved dataSource", () => {
    expect(unresolved(loadOnboarding())).toHaveLength(0);
  });

  it("reports an unresolved dataSource after a plain splice of the source", () => {
    const draft = loadOnboarding();

    draft.dataSources?.splice(0, 1);

    expect(unresolved(draft)).toHaveLength(1);
  });

  it("reports no unresolved dataSource after the recipe", () => {
    const draft = loadOnboarding();
    const id = draft.dataSources![0].id as string;
    expect(dataSourceRemovalReach(draft, id)).toEqual({ fields: 1, columnMappings: 1 });

    removeDataSourceAndReferences(draft, id);

    expect(draft.dataSources).toEqual([]);
    expect(unresolved(draft)).toHaveLength(0);
  });
});
