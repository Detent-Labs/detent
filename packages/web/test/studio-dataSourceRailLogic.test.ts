import { describe, expect, it } from "bun:test";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import type { DataSourceDef } from "workflow-engine/schema";
import {
  ADD_DATA_SOURCE_ID,
  dataSourceRailId,
  focusAfterDataSourceRemove,
  neighbourAfterDataSourceRemove,
  removeDataSourceControlId,
} from "../src/areas/studio/panels/dataSourceRailLogic.js";

/** Where the Data sources tab selects and focuses once a source leaves, as
 * pure functions over the list as it stands before the removal. */

const ds = (id: string) => ({ id, key: id, type: "db.list", config: {} }) as unknown as DraftOf<DataSourceDef>;
const three = [ds("ds_a"), ds("ds_b"), ds("ds_c")];

describe("focusAfterDataSourceRemove", () => {
  it("hands a middle source's focus to the next row", () => {
    expect(focusAfterDataSourceRemove(three, 1)).toBe(dataSourceRailId("ds_c"));
    expect(neighbourAfterDataSourceRemove(three, 1)?.id as string).toBe("ds_c");
  });

  it("hands the first source's focus to the next row", () => {
    expect(focusAfterDataSourceRemove(three, 0)).toBe(dataSourceRailId("ds_b"));
  });

  it("hands the last source's focus to the previous row", () => {
    expect(focusAfterDataSourceRemove(three, 2)).toBe(dataSourceRailId("ds_b"));
    expect(neighbourAfterDataSourceRemove(three, 2)?.id as string).toBe("ds_b");
  });

  it("hands the only source's focus to Add data source", () => {
    expect(focusAfterDataSourceRemove([ds("ds_a")], 0)).toBe(ADD_DATA_SOURCE_ID);
    expect(neighbourAfterDataSourceRemove([ds("ds_a")], 0)).toBeUndefined();
  });
});

describe("the data source ids", () => {
  it("name one row and one control per source id", () => {
    expect(dataSourceRailId("ds_a")).not.toBe(dataSourceRailId("ds_b"));
    expect(removeDataSourceControlId("ds_a")).not.toBe(dataSourceRailId("ds_a"));
    expect(ADD_DATA_SOURCE_ID).not.toBe(dataSourceRailId("ds_a"));
  });
});
