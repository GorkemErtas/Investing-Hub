import { expect, it } from "vitest";
import { grossNotional } from "../portfolio";
it("preserves all entered precision for large notionals before presentation", () => {
  expect(grossNotional("999999999999.99999999", "999999999999.99999999")).toBe(
    "999999999999999999980000.0000000000000001",
  );
  expect(grossNotional("0.00000001", "0.00000001")).toBe("0.0000000000000001");
  expect(() => grossNotional("0", "100")).toThrow();
});
