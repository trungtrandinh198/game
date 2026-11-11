import { describe, expect, it } from "vitest";
import { localeSchema, vehicleKindSchema } from "./index";

describe("schemas", () => {
  it("chỉ nhận locale vi và en", () => {
    expect(localeSchema.parse("vi")).toBe("vi");
    expect(localeSchema.safeParse("fr").success).toBe(false);
  });

  it("chỉ nhận ba loại xe", () => {
    expect(vehicleKindSchema.safeParse("car").success).toBe(true);
    expect(vehicleKindSchema.safeParse("boat").success).toBe(false);
  });
});
