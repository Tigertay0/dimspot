import { describe, expect, it } from "vitest";
import { brandStyle } from "@/lib/map/brand-style";

/** A few layers with OpenFreeMap's ids and shapes, plus one it does not have. */
const style = {
  version: 8,
  layers: [
    { id: "background", type: "background", paint: { "background-color": "rgb(12,12,12)" } },
    { id: "water", type: "fill", paint: { "fill-color": "rgb(27,27,29)" } },
    { id: "building", type: "fill", paint: { "fill-color": "rgb(10,10,10)", "fill-outline-color": "rgb(27,27,29)" } },
    { id: "boundary_state", type: "line", paint: { "line-color": "hsl(0,0%,21%)" } },
    {
      id: "place_state",
      type: "symbol",
      layout: { "text-font": ["Noto Sans Regular"], "text-size": 12 },
      paint: { "text-color": "rgb(101,101,101)", "text-halo-color": "rgba(0,0,0,0.7)" },
    },
    { id: "some_custom_layer", type: "fill", paint: { "fill-color": "#808080" } },
  ],
};

describe("brandStyle", () => {
  const night = brandStyle(style, "dark");
  const layer = (id: string) => night.layers.find((l) => l.id === id)!;

  it("gives named layers their palette colour by layer type", () => {
    expect(layer("background").paint).toEqual({ "background-color": "#0e1528" });
    expect(layer("water").paint).toEqual({ "fill-color": "#060b18" });
    expect(layer("building").paint).toMatchObject({ "fill-color": "#151e39", "fill-outline-color": "#1c2748" });
  });

  it("merges extra paint and layout without dropping what was there", () => {
    expect(layer("boundary_state").paint).toMatchObject({ "line-color": "#2c3862", "line-dasharray": [3, 2] });
    expect(layer("place_state").layout).toMatchObject({
      "text-font": ["Noto Sans Regular"],
      "text-transform": "uppercase",
      "text-size": 10.5,
    });
    expect(layer("place_state").paint).toMatchObject({ "text-color": "#5d6890" });
  });

  it("falls back to the blanket tint for a layer no rule names", () => {
    const colour = layer("some_custom_layer").paint!["fill-color"] as string;
    expect(colour).toMatch(/^hsl\(224 /);
  });

  it("does not modify the style it was given", () => {
    expect(style.layers[0].paint).toEqual({ "background-color": "rgb(12,12,12)" });
  });

  it("uses a different palette for dusk", () => {
    const dusk = brandStyle(style, "light");
    expect(dusk.layers[0].paint).toEqual({ "background-color": "#f3e8da" });
  });
});
