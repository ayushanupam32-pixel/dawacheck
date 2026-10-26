import { describe, expect, it } from "vitest";
import { graphemes, splitHighlight, words } from "@/lib/segment";

describe("graphemes", () => {
  it("keeps a Hindi consonant and its vowel sign together", () => {
    expect(graphemes("दवा", "hi")).toEqual(["द", "वा"]);
    expect(graphemes("दवा".split("").join(""), "hi")).not.toEqual("दवा".split(""));
  });

  it("keeps Tamil letters with their vowel signs", () => {
    const parts = graphemes("மருந்து", "ta");
    expect(parts.join("")).toBe("மருந்து");
    expect(parts.length).toBeLessThan("மருந்து".length);
  });

  it("splits English into single letters", () => {
    expect(graphemes("Telma")).toEqual(["T", "e", "l", "m", "a"]);
  });
});

describe("words", () => {
  it("keeps spaces so the pieces join back to the text", () => {
    const text = "Check your medicine strip.";
    const parts = words(text);
    expect(parts.join("")).toBe(text);
    expect(parts).toContain("strip.");
  });

  it("works for Hindi and Tamil", () => {
    for (const [text, loc] of [
      ["अपनी दवा की पट्टी", "hi"],
      ["உங்கள் மருந்து அட்டையை", "ta"],
    ]) {
      const parts = words(text, loc);
      expect(parts.join("")).toBe(text);
      expect(parts.filter((p) => p.trim()).length).toBe(text.split(" ").length);
    }
  });
});

describe("splitHighlight", () => {
  it("splits around the phrase", () => {
    expect(splitHighlight("Check against government data", "government data")).toEqual({
      before: "Check against ",
      highlight: "government data",
      after: "",
    });
  });

  it("highlights nothing when the phrase is missing", () => {
    expect(splitHighlight("Check it", "data").highlight).toBe("");
  });
});
