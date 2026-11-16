import { describe, expect, it } from "vitest";
import { FILM_END_GUARD_S, FILM_SEEK_EPSILON_S, filmTimeFor, needsSeek } from "@/lib/landing/scroll-film";

describe("filmTimeFor", () => {
  it("maps the start of the scroll to the first frame", () => {
    expect(filmTimeFor(0, 6)).toBe(0);
  });

  it("stops just short of the end so the last frame stays on screen", () => {
    expect(filmTimeFor(1, 6)).toBeCloseTo(6 - FILM_END_GUARD_S);
  });

  it("is linear in between", () => {
    expect(filmTimeFor(0.5, 6)).toBeCloseTo((6 - FILM_END_GUARD_S) / 2);
  });

  it("clamps progress outside 0-1", () => {
    expect(filmTimeFor(-0.4, 6)).toBe(0);
    expect(filmTimeFor(1.7, 6)).toBeCloseTo(6 - FILM_END_GUARD_S);
  });

  it("lands on the first frame when the duration is not known yet", () => {
    expect(filmTimeFor(0.5, Number.NaN)).toBe(0);
    expect(filmTimeFor(0.5, Number.POSITIVE_INFINITY)).toBe(0);
    expect(filmTimeFor(0.5, 0)).toBe(0);
    expect(filmTimeFor(0.5, -6)).toBe(0);
    expect(filmTimeFor(Number.NaN, 6)).toBe(0);
  });

  it("never goes negative for a clip shorter than the end guard", () => {
    expect(filmTimeFor(1, FILM_END_GUARD_S / 2)).toBe(0);
  });
});

describe("needsSeek", () => {
  it("skips seeks that would land on the frame already showing", () => {
    expect(needsSeek(2, 2 + FILM_SEEK_EPSILON_S / 2)).toBe(false);
  });

  it("does not seek when already exactly on the target, or exactly one epsilon away", () => {
    expect(needsSeek(2, 2)).toBe(false);
    expect(needsSeek(0, FILM_SEEK_EPSILON_S)).toBe(false);
  });

  it("seeks when the target is a different frame, in either direction", () => {
    expect(needsSeek(2, 2.1)).toBe(true);
    expect(needsSeek(2, 1.9)).toBe(true);
  });
});
