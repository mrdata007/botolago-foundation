/**
 * Advance widths of the autograph faces, in hundredths of an em, measured in Chromium 1194 with the
 * self-hosted files (`public/fonts/mr-dafoe-*`, `aref-ruqaa-arabic-700-normal.woff2`). The layout
 * uses them where there is no canvas (the server, the unit tests) and before the faces have loaded;
 * in a browser with the faces loaded the canvas measures the real string (`measure.ts`).
 *
 * Regenerate by measuring each character with `CanvasRenderingContext2D.measureText` at 100 px.
 */

/** The characters `LATIN_ADVANCE` covers (U+0020 to U+007E and U+00C0 to U+017F), in its order. */
export const LATIN_CHARS =
  "0123456789 !\"#$%&'()*+,-./:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĦħĨĩĪīĬĭĮįİıĲĳĴĵĶķĸĹĺĻļĽľĿŀŁłŃńŅņŇňŉŊŋŌōŎŏŐőŒœŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŦŧŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžſ";

/** Mr Dafoe 400, hundredths of an em, one per character of `LATIN_CHARS`. */
export const LATIN_ADVANCE: readonly number[] = [
  57, 44, 61, 64, 59, 64, 40, 50, 50, 56, 25, 55, 39, 58, 68, 75, 92, 25, 45, 40, 46, 54, 13, 56,
  13, 57, 29, 30, 42, 37, 42, 67, 64, 45, 69, 51, 78, 49, 44, 55, 55, 38, 42, 50, 59, 67, 50, 50,
  58, 55, 65, 57, 23, 57, 46, 82, 45, 60, 50, 49, 36, 53, 30, 43, 30, 39, 35, 38, 45, 36, 24, 32,
  41, 30, 16, 39, 33, 64, 46, 33, 44, 31, 41, 35, 31, 40, 29, 46, 42, 33, 37, 47, 41, 39, 50, 42,
  42, 42, 42, 42, 42, 65, 45, 49, 49, 49, 49, 35, 35, 35, 35, 65, 43, 43, 43, 43, 43, 43, 47, 43,
  53, 53, 53, 53, 55, 50, 52, 39, 40, 40, 40, 40, 40, 66, 39, 36, 36, 36, 36, 30, 30, 30, 30, 33,
  46, 33, 33, 33, 33, 33, 47, 33, 40, 40, 40, 40, 33, 41, 33, 72, 44, 72, 44, 72, 44, 67, 44, 67,
  44, 67, 44, 67, 44, 72, 65, 72, 50, 61, 44, 61, 44, 61, 44, 61, 44, 61, 44, 72, 50, 72, 50, 72,
  50, 72, 50, 72, 50, 72, 50, 33, 28, 33, 28, 33, 28, 33, 28, 33, 30, 71, 55, 39, 28, 72, 50, 50,
  61, 28, 61, 28, 61, 41, 61, 34, 46, 33, 72, 50, 72, 50, 72, 50, 60, 70, 49, 72, 50, 72, 50, 72,
  50, 43, 33, 67, 33, 67, 33, 67, 33, 56, 39, 56, 39, 56, 39, 54, 38, 61, 28, 61, 43, 61, 28, 72,
  50, 72, 50, 72, 50, 72, 50, 72, 50, 72, 50, 94, 72, 72, 50, 55, 61, 44, 61, 44, 50, 37, 28,
];

/** Mr Dafoe: how far the slanted ink runs past the last advance, in em (measured on four names). */
export const LATIN_OVERHANG = 0.24;

/** Aref Ruqaa 700: the mean advance of an Arabic letter in a joined word, and the space, in em. */
export const ARABIC_LETTER = 0.372;
export const ARABIC_SPACE = 0.333;
