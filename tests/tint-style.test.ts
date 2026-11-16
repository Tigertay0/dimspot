import { describe, expect, it } from "vitest";
import { tintColor, tintStyle } from "@/lib/map/tint-style";

const NIGHT = { hue: 224, saturation: 0.35 };

describe("tintColor", () => {
  it("moves a grey hex onto the tint hue and keeps its lightness", () => {
    // #333333 is 20% lightness.
    expect(tintColor("#333333", NIGHT)).toBe("hsl(224 35% 20%)");
  });

  it("handles short hex", () => {
    expect(tintColor("#fff", NIGHT)).toBe("hsl(224 35% 100%)");
  });

  it("keeps the alpha of rgba and hsla colours", () => {
    expect(tintColor("rgba(0, 0, 0, 0.5)", NIGHT)).toBe("hsl(224 35% 0% / 0.5)");
    expect(tintColor("hsla(30, 10%, 40%, 0.25)", NIGHT)).toBe("hsl(224 35% 40% / 0.25)");
  });

  it("keeps a colour's own saturation when it is stronger than the tint", () => {
    // Saturated colours (a park, a highway) stay recognisable; only the hue moves.
    expect(tintColor("hsl(120, 60%, 30%)", NIGHT)).toBe("hsl(224 60% 30%)");
  });

  it("can remap lightness", () => {
    expect(tintColor("#808080", { ...NIGHT, lightness: (l) => l * 0.5 })).toBe("hsl(224 35% 25%)");
  });

  it("returns null for anything that is not a colour", () => {
    expect(tintColor("Noto Sans Regular", NIGHT)).toBeNull();
    expect(tintColor("get", NIGHT)).toBeNull();
  });
});

describe("tintStyle", () => {
  it("tints colour paint properties, including inside expressions, and leaves the rest alone", () => {
    const style = {
      version: 8,
      sources: {},
      layers: [
        { id: "bg", type: "background", paint: { "background-color": "#111111" } },
        {
          id: "road",
          type: "line",
          paint: { "line-color": ["interpolate", ["linear"], ["zoom"], 5, "#222222", 12, "rgba(68, 68, 68, 0.8)"], "line-width": 2 },
          layout: { "text-font": ["Noto Sans Regular"] },
        },
      ],
    };
    const out = tintStyle(style, NIGHT);
    expect(out.layers[0].paint).toEqual({ "background-color": "hsl(224 35% 7%)" });
    expect(out.layers[1].paint).toEqual({
      "line-color": ["interpolate", ["linear"], ["zoom"], 5, "hsl(224 35% 13%)", 12, "hsl(224 35% 27% / 0.8)"],
      "line-width": 2,
    });
    expect(out.layers[1].layout).toEqual({ "text-font": ["Noto Sans Regular"] });
    // The input is not mutated.
    expect(style.layers[0].paint["background-color"]).toBe("#111111");
  });

  it("gives layers that match an override their own tint (water stays blue on a warm map)", () => {
    const style = {
      layers: [
        { id: "background", paint: { "background-color": "#808080" } },
        { id: "water", paint: { "fill-color": "#808080" } },
      ],
    };
    const out = tintStyle(style, { hue: 32, saturation: 0.35 }, [{ match: /water/, tint: { hue: 210, saturation: 0.3 } }]);
    expect(out.layers[0].paint).toEqual({ "background-color": "hsl(32 35% 50%)" });
    expect(out.layers[1].paint).toEqual({ "fill-color": "hsl(210 30% 50%)" });
  });
});
