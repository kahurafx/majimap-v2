import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseLineStringEwkb, parsePointEwkb, parsePolygonEwkb } from "./geometry";

// Vectors captured from PostGIS itself (ST_AsHEXEWKB, both byte orders), not
// produced by this module's own encoder — so a passing test means the parser
// agrees with PostGIS, not just with itself. To regenerate one, e.g.:
//   select ST_AsHEXEWKB(ST_GeomFromEWKT('SRID=4326;POINT(36.782 -1.288)'), 'NDR')  -- or 'XDR'
const POINT_NDR = "0101000020E61000006ABC749318644240CFF753E3A59BF4BF";
const POINT_XDR = "0020000001000010E6404264189374BC6ABFF49BA5E353F7CF";
const LINE_NDR =
    "0102000020E610000003000000A4703D0AD7634240A4703D0AD7A3F4BF85EB51B81E654240CDCCCCCCCCCCF4BF6666666666664240F6285C8FC2F5F4BF";
const LINE_XDR =
    "0020000002000010E600000003404263D70A3D70A4BFF4A3D70A3D70A44042651EB851EB85BFF4CCCCCCCCCCCD4042666666666666BFF4F5C28F5C28F6";
const POLY_NDR =
    "0103000020E6100000010000000500000033333333336342407B14AE47E17AF4BFA245B6F3FD6442407B14AE47E17AF4BFA245B6F3FD64424023DBF97E6ABCF4BF333333333363424023DBF97E6ABCF4BF33333333336342407B14AE47E17AF4BF";
const POLY_XDR =
    "0020000003000010E600000001000000054042633333333333BFF47AE147AE147B404264FDF3B645A2BFF47AE147AE147B404264FDF3B645A2BFF4BC6A7EF9DB234042633333333333BFF4BC6A7EF9DB234042633333333333BFF47AE147AE147B";
const POLY_WITH_HOLE =
    "0103000020E610000002000000050000000000000000000000000000000000000000000000000024400000000000000000000000000000244000000000000024400000000000000000000000000000244000000000000000000000000000000000050000000000000000000040000000000000004000000000000010400000000000000040000000000000104000000000000010400000000000000040000000000000104000000000000000400000000000000040";
const POINT_Z = "01010000A0E6100000000000000000F03F00000000000000400000000000000840";

describe("EWKB parsing", () => {
    it("decodes a point in either byte order", () => {
        const expected = { lng: 36.782, lat: -1.288 };
        assert.deepEqual(parsePointEwkb(POINT_NDR), expected);
        assert.deepEqual(parsePointEwkb(POINT_XDR), expected);
    });

    it("decodes a line string in either byte order", () => {
        const expected = [
            { lng: 36.78, lat: -1.29 },
            { lng: 36.79, lat: -1.3 },
            { lng: 36.8, lat: -1.31 },
        ];
        assert.deepEqual(parseLineStringEwkb(LINE_NDR), expected);
        assert.deepEqual(parseLineStringEwkb(LINE_XDR), expected);
    });

    it("decodes a closed polygon ring in either byte order", () => {
        const ndr = parsePolygonEwkb(POLY_NDR);
        assert.equal(ndr.length, 5);
        assert.deepEqual(ndr[0], { lng: 36.775, lat: -1.28 });
        assert.deepEqual(ndr[0], ndr[4], "ring should be closed");
        assert.deepEqual(parsePolygonEwkb(POLY_XDR), ndr);
    });

    it("refuses a polygon with holes rather than silently dropping them", () => {
        assert.throws(() => parsePolygonEwkb(POLY_WITH_HOLE), /holes/);
    });

    it("refuses Z geometries", () => {
        assert.throws(() => parsePointEwkb(POINT_Z), /Z\/M/);
    });

    it("refuses the wrong geometry type", () => {
        assert.throws(() => parsePointEwkb(LINE_NDR), /Expected a Point/);
        assert.throws(() => parsePolygonEwkb(POINT_NDR), /Expected a Polygon/);
    });

    it("refuses non-hex input with a message that says what it got", () => {
        assert.throws(() => parsePointEwkb("POINT(1 2)"), /hex-encoded EWKB/);
        assert.throws(() => parsePointEwkb(""), /hex-encoded EWKB/);
    });
});