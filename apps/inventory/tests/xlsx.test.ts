import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { writeXlsx, readXlsx } from "../src/xlsx";
import { parseTable } from "../src/stock";

const fixture = async (name: string) => new Uint8Array(await Bun.file(join(import.meta.dir, "fixtures", name)).arrayBuffer());

describe("xlsx", () => {
  test("what we write, we read back", () => {
    const file = writeXlsx([
      { name: "Stock", cols: [{ key: "a", label: "brand" }, { key: "b", label: "qty" }, { key: "c", label: "note" }], rows: [{ a: "IDEALX", b: 3, c: '=cmd|"/c calc"!A1 & <b>' }, { a: "हिंदी", b: 0, c: "" }] },
      { name: "Second/sheet", cols: [{ key: "x", label: "x" }], rows: [{ x: 1 }] },
    ]);
    expect(file[0]).toBe(0x50);
    expect(file[1]).toBe(0x4b);
    expect(readXlsx(file)).toEqual([["brand", "qty", "note"], ["IDEALX", "3", '=cmd|"/c calc"!A1 & <b>'], ["हिंदी", "0"]]);
  });
  test("reads an openpyxl workbook with Excel-style headings", async () => {
    const rows = parseTable(readXlsx(await fixture("register-openpyxl.xlsx")));
    expect(rows.length).toBe(3);
    expect(rows[0]).toEqual({ brand: "IDEALX", article: "Oxford", colour: "Black", size: "8", cat: "shoe", cost: 650, mrp: 1799, loc: "R3", qty: 4 });
    expect(rows[2].article).toBe("Derby & Co <new>");
    expect(rows[2].size).toBe("7.5");
  });
  test("reads shared strings, rich text, formulas, sparse cells and the first sheet by order", async () => {
    const table = readXlsx(await fixture("shared-strings.xlsx"));
    expect(table[0]).toEqual(["brand", "article", "colour", "size", "qty", "loc"]);
    const rows = parseTable(table);
    expect(rows.length).toBe(2);
    expect(rows[0]).toMatchObject({ brand: "IDEALX", article: "Field Jacket", colour: "Olive", size: "L", qty: 3, loc: "Godown & back" });
    expect(rows[1]).toMatchObject({ article: "Field Jacket", colour: "-", size: "XL", qty: 2 });
  });
  test("rejects files that are not workbooks", () => {
    expect(() => readXlsx(new TextEncoder().encode("brand,article,qty\n"))).toThrow();
  });
});
