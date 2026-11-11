import { describe, expect, it } from "vitest";
import { parseEwkb } from "./common";

function ewkbPoint(lon: number, lat: number, little = true): string {
  const buf = Buffer.alloc(1 + 4 + 4 + 16);
  const w32 = little ? buf.writeUInt32LE.bind(buf) : buf.writeUInt32BE.bind(buf);
  const wd = little ? buf.writeDoubleLE.bind(buf) : buf.writeDoubleBE.bind(buf);
  buf.writeUInt8(little ? 1 : 0, 0);
  w32(0x20000001, 1); // Point có SRID
  w32(4326, 5);
  wd(lon, 9);
  wd(lat, 17);
  return buf.toString("hex");
}

describe("parseEwkb", () => {
  it("đọc Point theo thứ tự [lon, lat]", () => {
    expect(parseEwkb(ewkbPoint(108.2247, 16.072))).toEqual({
      type: "Point",
      coordinates: [108.2247, 16.072],
    });
  });

  it("đọc được cả big-endian", () => {
    expect(parseEwkb(ewkbPoint(1.5, -2.5, false))).toEqual({
      type: "Point",
      coordinates: [1.5, -2.5],
    });
  });

  it("từ chối kiểu hình học chưa hỗ trợ", () => {
    const buf = Buffer.alloc(5);
    buf.writeUInt8(1, 0);
    buf.writeUInt32LE(2, 1); // LineString
    expect(() => parseEwkb(buf.toString("hex"))).toThrow(/chưa được hỗ trợ/);
  });
});
