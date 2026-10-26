// Splitting text into pieces for animation, safely for Hindi and Tamil.
//
// `text.split("")` breaks a Devanagari or Tamil letter into its parts (a consonant and its vowel
// sign are separate code points: "दवा" is द + व + ा), so animating them one by one shows broken
// letters. Intl.Segmenter splits by what a reader sees as one letter (a "grapheme") or one word.

/** Letters as a reader sees them: "दवा" -> ["द", "वा"], "Telma" -> ["T","e","l","m","a"]. */
export function graphemes(text: string, locale = "en"): string[] {
  const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

/**
 * Words with the spaces kept as their own pieces, so joining the pieces gives back the text:
 * "Check your medicine" -> ["Check", " ", "your", " ", "medicine"].
 */
export function words(text: string, locale = "en"): string[] {
  const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
  // Merge punctuation into the word before it, so "data." stays one piece.
  const pieces: string[] = [];
  for (const { segment, isWordLike } of segmenter.segment(text)) {
    const last = pieces.at(-1);
    if (!isWordLike && segment.trim() && last && last.trim()) pieces[pieces.length - 1] += segment;
    else pieces.push(segment);
  }
  return pieces;
}

/**
 * Splits `text` around the first occurrence of `highlight`, for a headline with one emphasised
 * phrase. If the phrase is missing (a translation changed), nothing is highlighted.
 */
export function splitHighlight(text: string, highlight: string) {
  const at = highlight ? text.indexOf(highlight) : -1;
  if (at < 0) return { before: text, highlight: "", after: "" };
  return {
    before: text.slice(0, at),
    highlight,
    after: text.slice(at + highlight.length),
  };
}
