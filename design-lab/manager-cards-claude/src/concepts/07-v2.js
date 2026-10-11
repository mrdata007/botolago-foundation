/* 07 ÉCHARPE v2 — the supporter's scarf, refined.
   Default state (grids, detail, tier strip): the scarf folded over the steel crowd-barrier rail.
   The front drop shows a face of about 1:1.5; the rest of the scarf hangs behind it, parallel,
   in shadow, and shows as a darker strip along the inline-start edge with a fold lip over the
   rail and a straight cast-off edge. Read from the rail down, each element on its own band:
   the 84 (13 rows), ALI ·26 (8 rows), a narrow tier strip (a 4-row word), then the season's
   gameweek stripes with the woven patch sewn over them, the founder's cream cast-on, the fringe.
   Every knitted glyph comes from a hand-cleaned chart on an integer stitch grid. A name that does
   not fit steps down a ladder (8 rows → 7 → 6 condensed, the year stacked above the name's end,
   then two lines); it is never cut to an initial. The share image hangs both halves of the
   scarf over the rail: the front with the 84, the name, the tier and the patch; the back with
   the season, the 2026 cast-on and the fringe. LEGEND lifts the scarf overhead.

   Onboarding states (CONTRACT.md): a card with no rating yet is the finished scarf with an empty
   carrier, like a new one with no rows. The number band is plain rib with a knitted dash; with no
   tier it is the base scarf (a tone-on-tone name band, a plain fringe of loose strands, no tier
   strip, no panel, no binding); k of N is one stripe per counted gameweek, a solid two-row stripe
   when knitted and a one-row tacking line while it waits. A profile without the new fields
   renders exactly as before. */
(function () {
  const MC = window.MC;
  const PFX = "c07v2";

  try {
    if (document.fonts && document.fonts.load) {
      [
        '800 64px "Changa"',
        '700 64px "Manrope"',
        '600 64px "Manrope"',
        '600 64px "Noto Sans Arabic"',
        '700 64px "Noto Sans Arabic"',
      ].forEach((f) =>
        document.fonts
          .load(
            f,
            "0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ علي محترف حومة ملعب بطل أسطورة المغرب القائد التشكيلة الانتقالات الثبات",
          )
          .catch(() => {}),
      );
    }
  } catch (e) {
    /* the fallback rasteriser uses whatever face is ready */
  }

  /* ---------- yarns and materials ---------- */
  const CREAM = "#F2EEE4"; // undyed cream: selvedge, PRO's panel, the cast-on when the club's second colour is dark
  const BLUE = "#0151FC"; // Logo Blue: the end-edge selvedge (the one fixed brand thread)
  const WOOL = "#E8E1D0"; // undyed wool: the ground when no club is chosen
  const CHAR = "#2B2B2B";
  const PATCH_FALLBACK = "#ECE6D8"; // the patch ground when the club's second colour is dark
  const INK = "#23252A";
  const INK_SOFT = "#4F4A42";
  const SLEEVE = "#2f343c"; // bench-jacket graphite (LEGEND's figure and sleeves)
  const SLEEVE_LT = "#4f5763";
  const PLAYED = 7; // sample season: J.01–J.07, labelled Exemple

  /* ---------- geometry (viewBox units) ---------- */
  const VW = 264;
  const X0 = 26;
  const X1 = 250;
  const FW = X1 - X0; // 224
  const RAIL_Y = 8;
  const RAIL_H = 14;
  const FT = 2; // the fabric's top, turned over the tube
  const CAST = { c: 7, rows: 5 }; // the founder's cast-on keeps one gauge at every tier
  const BACK_DX = 10; // the back drop shows this far beyond the front's inline-start edge
  const SHARE_DX = 16; // in the share, the back half shows a wider strip
  const TASSELS = { HOMA: 2, STADE: 3, PRO: 4, CHAMPION: 5, LEGEND: 3 };
  const LEGEND_INNER = 36; // stitches the raised band gives the name

  /* gauge: stitches across the 224u face. HOMA chunky acrylic → STADE machine jacquard → PRO fine
     (0.81× HOMA's stitch) → CHAMPION double-knit */
  const GAUGE = {
    HOMA: { cols: 30, gap: 0.42, leg: 0.34 },
    STADE: { cols: 33, gap: 0.3, leg: 0.2 },
    PRO: { cols: 37, gap: 0.4, leg: 0.27 },
    CHAMPION: { cols: 42, gap: 0.5, leg: 0.36 },
    // the base scarf (no tier yet): between STADE and PRO, so no tier's gauge is claimed
    BASE: { cols: 36, gap: 0.34, leg: 0.24 },
  };

  /* ---------- hand-cleaned knit charts ('#' = stitch) ---------- */
  // Digits, 9 stitches by 13 rows: three-stitch stems, two-row bars, open three-stitch counters.
  // Drawn from Changa 800 (flat-topped 1 with a slab base, flag-less 4 with a spur, straight-stemmed
  // 7) and cleaned stitch by stitch, so no counter carries a stray stitch.
  const D913 = {
    0: [
      ".#######.",
      "#########",
      "###...###",
      "###...###",
      "###...###",
      "###...###",
      "###...###",
      "###...###",
      "###...###",
      "###...###",
      "###...###",
      "#########",
      ".#######.",
    ],
    1: [
      ".#####...",
      "######...",
      "...###...",
      "...###...",
      "...###...",
      "...###...",
      "...###...",
      "...###...",
      "...###...",
      "...###...",
      "...###...",
      "#########",
      "#########",
    ],
    2: [
      ".#######.",
      "#########",
      "###...###",
      "......###",
      "......###",
      ".....####",
      "...#####.",
      "..####...",
      ".####....",
      "####.....",
      "###......",
      "#########",
      "#########",
    ],
    3: [
      ".#######.",
      "#########",
      "###...###",
      "......###",
      "......###",
      "..#######",
      "..#######",
      "......###",
      "......###",
      "......###",
      "###...###",
      "#########",
      ".#######.",
    ],
    4: [
      "###..###.",
      "###..###.",
      "###..###.",
      "###..###.",
      "###..###.",
      "###..###.",
      "###..###.",
      "#########",
      "#########",
      ".....###.",
      ".....###.",
      ".....###.",
      ".....###.",
    ],
    5: [
      "#########",
      "#########",
      "###......",
      "###......",
      "###......",
      "########.",
      "#########",
      "......###",
      "......###",
      "......###",
      "###...###",
      "#########",
      ".#######.",
    ],
    6: [
      ".########",
      "#########",
      "###......",
      "###......",
      "###......",
      "########.",
      "#########",
      "###...###",
      "###...###",
      "###...###",
      "###...###",
      "#########",
      ".#######.",
    ],
    7: [
      "#########",
      "#########",
      "......###",
      "......###",
      ".....####",
      "....####.",
      "....###..",
      "...####..",
      "...###...",
      "...###...",
      "..####...",
      "..###....",
      "..###....",
    ],
    8: [
      ".#######.",
      "#########",
      "###...###",
      "###...###",
      "###...###",
      ".#######.",
      ".#######.",
      "###...###",
      "###...###",
      "###...###",
      "###...###",
      "#########",
      ".#######.",
    ],
    9: [
      ".#######.",
      "#########",
      "###...###",
      "###...###",
      "###...###",
      "###...###",
      "#########",
      ".########",
      "......###",
      "......###",
      "......###",
      "#########",
      "########.",
    ],
  };
  // Latin capitals for names, 8 rows: two-stitch stems, two-row bars.
  const N8 = {
    A: [".####.", "######", "##..##", "##..##", "######", "######", "##..##", "##..##"],
    B: ["#####.", "######", "##..##", "#####.", "#####.", "##..##", "######", "#####."],
    C: [".#####", "######", "##....", "##....", "##....", "##....", "######", ".#####"],
    D: ["#####.", "######", "##..##", "##..##", "##..##", "##..##", "######", "#####."],
    E: ["######", "######", "##....", "#####.", "#####.", "##....", "######", "######"],
    F: ["######", "######", "##....", "#####.", "#####.", "##....", "##....", "##...."],
    G: [".#####", "######", "##....", "##.###", "##.###", "##..##", "######", ".#####"],
    H: ["##..##", "##..##", "##..##", "######", "######", "##..##", "##..##", "##..##"],
    I: ["##", "##", "##", "##", "##", "##", "##", "##"],
    J: ["....##", "....##", "....##", "....##", "....##", "##..##", "######", ".####."],
    K: ["##..##", "##.##.", "####..", "###...", "####..", "##.##.", "##..##", "##..##"],
    L: ["##...", "##...", "##...", "##...", "##...", "##...", "#####", "#####"],
    M: [
      "##....##",
      "###..###",
      "########",
      "##.##.##",
      "##....##",
      "##....##",
      "##....##",
      "##....##",
    ],
    N: ["##...##", "###..##", "####.##", "##.####", "##..###", "##...##", "##...##", "##...##"],
    O: [".####.", "######", "##..##", "##..##", "##..##", "##..##", "######", ".####."],
    P: ["#####.", "######", "##..##", "##..##", "######", "#####.", "##....", "##...."],
    Q: [".####.", "######", "##..##", "##..##", "##..##", "##.###", "######", ".#####"],
    R: ["#####.", "######", "##..##", "##..##", "#####.", "##.##.", "##..##", "##..##"],
    S: [".#####", "######", "##....", "#####.", ".#####", "....##", "######", "#####."],
    T: ["######", "######", "..##..", "..##..", "..##..", "..##..", "..##..", "..##.."],
    U: ["##..##", "##..##", "##..##", "##..##", "##..##", "##..##", "######", ".####."],
    V: ["##..##", "##..##", "##..##", "##..##", "##..##", ".####.", ".####.", "..##.."],
    W: [
      "##....##",
      "##....##",
      "##....##",
      "##.##.##",
      "##.##.##",
      "########",
      "###..###",
      "##....##",
    ],
    X: ["##..##", "##..##", ".####.", "..##..", "..##..", ".####.", "##..##", "##..##"],
    Y: ["##..##", "##..##", "##..##", ".####.", "..##..", "..##..", "..##..", "..##.."],
    Z: ["######", "######", "...##.", "..##..", ".##...", "##....", "######", "######"],
    "-": ["....", "....", "....", "####", "####", "....", "....", "...."],
    " ": ["..", "..", "..", "..", "..", "..", "..", ".."],
  };
  // Condensed capitals, 7 rows: still two-stitch stems, one-row bars, mostly five stitches wide.
  const N7 = {
    A: [".###.", "##.##", "##.##", "#####", "##.##", "##.##", "##.##"],
    B: ["####.", "##.##", "##.##", "####.", "##.##", "##.##", "####."],
    C: [".####", "##...", "##...", "##...", "##...", "##...", ".####"],
    D: ["####.", "##.##", "##.##", "##.##", "##.##", "##.##", "####."],
    E: ["####", "##..", "##..", "###.", "##..", "##..", "####"],
    F: ["####", "##..", "##..", "###.", "##..", "##..", "##.."],
    G: [".####", "##...", "##...", "##.##", "##.##", "##.##", ".####"],
    H: ["##.##", "##.##", "##.##", "#####", "##.##", "##.##", "##.##"],
    I: ["##", "##", "##", "##", "##", "##", "##"],
    J: ["...##", "...##", "...##", "...##", "...##", "##.##", ".###."],
    K: ["##.##", "##.##", "####.", "###..", "####.", "##.##", "##.##"],
    L: ["##..", "##..", "##..", "##..", "##..", "##..", "####"],
    M: ["##...##", "###.###", "#######", "##.#.##", "##...##", "##...##", "##...##"],
    N: ["##..##", "###.##", "######", "##.###", "##..##", "##..##", "##..##"],
    O: [".###.", "##.##", "##.##", "##.##", "##.##", "##.##", ".###."],
    P: ["####.", "##.##", "##.##", "####.", "##...", "##...", "##..."],
    Q: [".###.", "##.##", "##.##", "##.##", "##.##", "##.#.", ".##.#"],
    R: ["####.", "##.##", "##.##", "####.", "##.##", "##.##", "##.##"],
    S: [".####", "##...", "##...", ".###.", "...##", "...##", "####."],
    T: ["######", "..##..", "..##..", "..##..", "..##..", "..##..", "..##.."],
    U: ["##.##", "##.##", "##.##", "##.##", "##.##", "##.##", ".###."],
    V: ["##.##", "##.##", "##.##", "##.##", "##.##", ".###.", "..#.."],
    W: ["##...##", "##...##", "##.#.##", "##.#.##", "#######", "###.###", "##...##"],
    X: ["##.##", "##.##", ".###.", "..#..", ".###.", "##.##", "##.##"],
    Y: ["##..##", "##..##", "##..##", ".####.", "..##..", "..##..", "..##.."],
    Z: ["#####", "...##", "...##", "..##.", ".##..", "##...", "#####"],
    "-": ["...", "...", "...", "###", "...", "...", "..."],
    " ": ["..", "..", "..", "..", "..", "..", ".."],
  };
  // Condensed capitals, 6 rows: two-stitch stems, one-row bars, four stitches where the letter allows.
  const N6 = {
    A: [".###.", "##.##", "#####", "##.##", "##.##", "##.##"],
    B: ["####.", "##.##", "####.", "##.##", "##.##", "####."],
    C: [".###", "##..", "##..", "##..", "##..", ".###"],
    D: ["####.", "##.##", "##.##", "##.##", "##.##", "####."],
    E: ["####", "##..", "###.", "##..", "##..", "####"],
    F: ["####", "##..", "###.", "##..", "##..", "##.."],
    G: [".####", "##...", "##.##", "##.##", "##.##", ".####"],
    H: ["##.##", "##.##", "#####", "##.##", "##.##", "##.##"],
    I: ["##", "##", "##", "##", "##", "##"],
    J: ["...##", "...##", "...##", "...##", "##.##", ".###."],
    K: ["##.##", "##.##", "####.", "####.", "##.##", "##.##"],
    L: ["##..", "##..", "##..", "##..", "##..", "####"],
    M: ["##...##", "###.###", "##.#.##", "##...##", "##...##", "##...##"],
    N: ["##..##", "###.##", "##.###", "##..##", "##..##", "##..##"],
    O: [".###.", "##.##", "##.##", "##.##", "##.##", ".###."],
    P: ["####.", "##.##", "##.##", "####.", "##...", "##..."],
    Q: [".###.", "##.##", "##.##", "##.##", "##.#.", ".##.#"],
    R: ["####.", "##.##", "##.##", "####.", "##.##", "##.##"],
    S: [".###", "##..", ".##.", "..##", "..##", "###."],
    T: ["####", ".##.", ".##.", ".##.", ".##.", ".##."],
    U: ["##.##", "##.##", "##.##", "##.##", "##.##", ".###."],
    V: ["##.##", "##.##", "##.##", "##.##", ".###.", "..#.."],
    W: ["##...##", "##...##", "##.#.##", "#######", "###.###", "##...##"],
    X: ["##.##", "##.##", ".###.", ".###.", "##.##", "##.##"],
    Y: ["##..##", "##..##", ".####.", "..##..", "..##..", "..##.."],
    Z: ["####", "..##", "..##", ".##.", "##..", "####"],
    "-": ["...", "...", "###", "...", "...", "..."],
    " ": ["..", "..", "..", "..", "..", ".."],
  };
  // Tier words, 4 rows, one-stitch strokes: a step below the name in size and weight.
  const T4 = {
    A: [".#.", "#.#", "###", "#.#"],
    C: ["###", "#..", "#..", "###"],
    D: ["##.", "#.#", "#.#", "##."],
    E: ["###", "##.", "#..", "###"],
    G: ["###", "#..", "#.#", "###"],
    H: ["#.#", "###", "#.#", "#.#"],
    I: ["#", "#", "#", "#"],
    L: ["#..", "#..", "#..", "###"],
    M: ["#...#", "##.##", "#.#.#", "#...#"],
    N: ["#..#", "##.#", "#.##", "#..#"],
    O: ["###", "#.#", "#.#", "###"],
    P: ["###", "#.#", "###", "#.."],
    R: ["###", "#.#", "##.", "#.#"],
    S: [".###", "##..", "..##", "###."],
    T: ["###", ".#.", ".#.", ".#."],
    " ": [".", ".", ".", "."],
  };
  // Small figures, 3×5: the year after an 8-row name (·26) and the cast-on's 2026.
  const F35 = {
    0: ["###", "#.#", "#.#", "#.#", "###"],
    1: [".#.", "##.", ".#.", ".#.", "###"],
    2: ["###", "..#", "###", "#..", "###"],
    3: ["###", "..#", ".##", "..#", "###"],
    4: ["#.#", "#.#", "###", "..#", "..#"],
    5: ["###", "#..", "###", "..#", "###"],
    6: ["###", "#..", "###", "#.#", "###"],
    7: ["###", "..#", "..#", ".#.", ".#."],
    8: ["###", "#.#", "###", "#.#", "###"],
    9: ["###", "#.#", "###", "..#", "###"],
  };
  // Smaller figures, 3×4: the year after a 7- or 6-row name, and after Arabic names.
  const F34 = {
    0: ["###", "#.#", "#.#", "###"],
    1: ["##.", ".#.", ".#.", "###"],
    2: ["##.", "..#", ".#.", "###"],
    3: ["###", ".##", "..#", "###"],
    4: ["#.#", "#.#", "###", "..#"],
    5: ["###", "##.", "..#", "##."],
    6: ["#..", "###", "#.#", "###"],
    7: ["###", "..#", ".#.", ".#."],
    8: ["###", "#.#", "###", "###"],
    9: ["###", "#.#", "###", "..#"],
  };
  // Token figures: optical sizes on whole pixels, so the 84 steps down evenly from 80px to 24px
  // (D913×2 26px · F710×2 20px · F69×2 18px · D913 13px · F710 10px · F69 9px · F57 7px).
  const F710 = {
    0: [
      ".#####.",
      "#######",
      "##...##",
      "##...##",
      "##...##",
      "##...##",
      "##...##",
      "##...##",
      "#######",
      ".#####.",
    ],
    1: [
      ".####..",
      "#####..",
      "...##..",
      "...##..",
      "...##..",
      "...##..",
      "...##..",
      "...##..",
      "#######",
      "#######",
    ],
    2: [
      ".#####.",
      "#######",
      "##...##",
      ".....##",
      "....###",
      "..####.",
      ".###...",
      "###....",
      "#######",
      "#######",
    ],
    3: [
      ".#####.",
      "#######",
      "##...##",
      ".....##",
      "..#####",
      "..#####",
      ".....##",
      "##...##",
      "#######",
      ".#####.",
    ],
    4: [
      "##..##.",
      "##..##.",
      "##..##.",
      "##..##.",
      "##..##.",
      "#######",
      "#######",
      "....##.",
      "....##.",
      "....##.",
    ],
    5: [
      "#######",
      "#######",
      "##.....",
      "######.",
      "#######",
      ".....##",
      ".....##",
      "##...##",
      "#######",
      ".#####.",
    ],
    6: [
      ".######",
      "#######",
      "##.....",
      "######.",
      "#######",
      "##...##",
      "##...##",
      "##...##",
      "#######",
      ".#####.",
    ],
    7: [
      "#######",
      "#######",
      ".....##",
      "....###",
      "...###.",
      "...##..",
      "..###..",
      "..##...",
      "..##...",
      "..##...",
    ],
    8: [
      ".#####.",
      "#######",
      "##...##",
      "##...##",
      ".#####.",
      ".#####.",
      "##...##",
      "##...##",
      "#######",
      ".#####.",
    ],
    9: [
      ".#####.",
      "#######",
      "##...##",
      "##...##",
      "##...##",
      "#######",
      ".######",
      ".....##",
      "#######",
      "######.",
    ],
  };
  const F69 = {
    0: [".####.", "######", "##..##", "##..##", "##..##", "##..##", "##..##", "######", ".####."],
    1: [".###..", "####..", "..##..", "..##..", "..##..", "..##..", "..##..", "######", "######"],
    2: [".####.", "######", "##..##", "....##", "...###", ".####.", "###...", "######", "######"],
    3: [".####.", "######", "....##", "..####", "..####", "....##", "##..##", "######", ".####."],
    4: ["##.##.", "##.##.", "##.##.", "##.##.", "######", "######", "...##.", "...##.", "...##."],
    5: ["######", "######", "##....", "#####.", "######", "....##", "##..##", "######", ".####."],
    6: [".#####", "######", "##....", "#####.", "######", "##..##", "##..##", "######", ".####."],
    7: ["######", "######", "....##", "...###", "..###.", "..##..", ".###..", ".##...", ".##..."],
    8: [".####.", "######", "##..##", "##..##", ".####.", "##..##", "##..##", "######", ".####."],
    9: [".####.", "######", "##..##", "##..##", "######", ".#####", "....##", "######", "#####."],
  };
  const F57 = {
    0: [".###.", "##.##", "##.##", "##.##", "##.##", "##.##", ".###."],
    1: ["..##.", ".###.", "..##.", "..##.", "..##.", "..##.", ".####"],
    2: [".###.", "##.##", "...##", "..##.", ".##..", "##...", "#####"],
    3: ["####.", "...##", "...##", ".###.", "...##", "...##", "####."],
    4: ["##.##", "##.##", "##.##", "#####", "...##", "...##", "...##"],
    5: ["#####", "##...", "####.", "...##", "...##", "##.##", ".###."],
    6: [".###.", "##...", "####.", "##.##", "##.##", "##.##", ".###."],
    7: ["#####", "...##", "...##", "..##.", "..##.", ".##..", ".##.."],
    8: [".###.", "##.##", "##.##", ".###.", "##.##", "##.##", ".###."],
    9: [".###.", "##.##", "##.##", ".####", "...##", "...##", ".###."],
  };
  // Arabic, hand-charted from Changa's geometric Arabic and joined on the baseline. Charts are in
  // visual order (left to right on the page), so they are never mirrored. 'base' is the last row
  // of the two-row baseline. The bold charts have two-stitch strokes like the Latin capitals, the
  // condensed ones (name~) one-stitch uprights on the same two-row baseline. Dots are 2×2 blocks.
  const AR_NAME = {
    علي: {
      base: 6,
      bmp: [
        "........##.......",
        "........##.......",
        "........##..#####",
        "........##.##....",
        "##......##.##....",
        "##..#############",
        "##..#############",
        "#######..........",
        "#######..........",
        ".................",
        ".##.##...........",
        ".##.##...........",
      ],
    },
    "علي~": {
      base: 6,
      bmp: [
        "......#.....",
        "......#.....",
        "......#.####",
        "......#.#...",
        "#.....#.#...",
        "#..#########",
        "#..#########",
        "####........",
        "####........",
        "............",
        "##.##.......",
        "##.##.......",
      ],
    },
    سلمى: {
      base: 6,
      bmp: [
        "...............##.........",
        "...............##.........",
        "...............##.........",
        "........######.##.##.##.##",
        "##......##..##.##.##.##.##",
        "##..######################",
        "##..######################",
        "#######...................",
        "#######...................",
      ],
    },
    "سلمى~": {
      base: 6,
      bmp: [
        "..........#......",
        "..........#......",
        "..........#......",
        ".....####.#.#.#.#",
        "#....#..#.#.#.#.#",
        "#..##############",
        "#..##############",
        "####.............",
        "####.............",
      ],
    },
    ياسمين: {
      base: 6,
      bmp: [
        "..##........................##....",
        "..##........................##....",
        "............................##....",
        "##......##..######.##.##.##.##.##.",
        "##......##..##..##.##.##.##.##.##.",
        "##..#######################.#####.",
        "##..#######################.#####.",
        "######............................",
        "######.##.##.................##.##",
        ".......##.##.................##.##",
      ],
    },
    "ياسمين~": {
      base: 6,
      bmp: [
        ".##................#....",
        ".##................#....",
        "...................#....",
        "#.....#.####.#.#.#.#.#..",
        "#.....#.#..#.#.#.#.#.#..",
        "#..###############.###..",
        "#..###############.###..",
        "####....................",
        "####.##.##.........##.##",
        ".....##.##.........##.##",
      ],
    },
    عثمان: {
      base: 9,
      bmp: [
        "...................##.........",
        "...................##.........",
        "..............................",
        "..##....##.......##..##.......",
        "..##....##.......##..##.......",
        "........##...............#####",
        "##..##..##.######..##...##....",
        "##..##..##.##..##..##...##....",
        "##..##..######################",
        "##..##..######################",
        "######........................",
        "######........................",
      ],
    },
    "عثمان~": {
      base: 9,
      bmp: [
        "............##.......",
        "............##.......",
        ".....................",
        ".##..#.....##.##.....",
        ".##..#.....##.##.....",
        ".....#...........####",
        "#..#.#.####..#...#...",
        "#..#.#.#..#..#...#...",
        "#..#.################",
        "#..#.################",
        "####.................",
        "####.................",
      ],
    },
    حمزة: {
      base: 6,
      bmp: [
        "##.##....##..............",
        "##.##....##..............",
        "...................######",
        ".####....##.######.######",
        "##..##...##.##..##.....##",
        "##..##...################",
        ".####....################",
        ".........##..............",
        "........##...............",
        ".......##................",
      ],
    },
    "حمزة~": {
      base: 6,
      bmp: [
        "##.##..##.........",
        "##.##..##.........",
        "..............####",
        ".##....#.####....#",
        "#..#...#.#..#....#",
        "#..#...###########",
        ".##....###########",
        ".......#..........",
        "......#...........",
        ".....#............",
      ],
    },
  };
  const AR_TIER = {
    HOMA: [
      "...............",
      "#.#............",
      "............###",
      "###.###..###..#",
      "#.#.#.#..#.#..#",
      "#######..######",
      "..........#....",
      ".........#.....",
    ],
    STADE: [
      "............#....",
      "............#....",
      "........###.#....",
      "#.....#.#.#.#.###",
      "#.....#.#.#.#.#.#",
      "#################",
      ".................",
      "...#.............",
    ],
    PRO: [
      "....#...............",
      "..........#.#.......",
      ".............###....",
      "#..###.....#...#.###",
      "#..#.#.....#...#.#.#",
      "######...###########",
      "........#...........",
      ".......#............",
    ],
    CHAMPION: [
      "....#..#......",
      "....#..#......",
      "....#..#......",
      "....#..####..#",
      "#...#..#..#..#",
      "#...##########",
      "#...#.........",
      "#####........#",
    ],
    LEGEND: [
      "...........#...........##",
      "#.#........#.............",
      "...........#...........#.",
      "###..#.###.####.#.#.#..#.",
      "#.#..#.#.#.#..#.#.#.#..#.",
      "###..#.##############..#.",
      ".....#..#................",
      "....#..#.................",
    ],
  };

  /* ---------- small utilities ---------- */
  const esc = MC.esc;
  const f2 = (n) => Math.round(n * 100) / 100;
  function seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 10000) / 10000;
    };
  }
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function hex(c) {
    const h = c.replace("#", "");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  function mix(a, b, t) {
    const A = hex(a);
    const B = hex(b);
    return (
      "#" +
      A.map((v, i) =>
        Math.round(v + (B[i] - v) * t)
          .toString(16)
          .padStart(2, "0"),
      ).join("")
    );
  }
  function lum(c) {
    const [r, g, b] = hex(c).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const contrast = (a, b) => {
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const bw = (bmp) => (bmp.length ? bmp[0].length : 0);
  /** Joins glyphs side by side (all the same height) with `gap` blank columns. */
  function word(str, font, gap = 1) {
    const glyphs = [...String(str)].map(
      (ch) => font[ch] || font[ch.toUpperCase()] || font[" "] || font[0],
    );
    const h = glyphs[0].length;
    const rows = [];
    for (let r = 0; r < h; r++) rows.push(glyphs.map((g) => g[r]).join(".".repeat(gap)));
    return rows;
  }
  /** Replaces '#' with another mark (so several colours can live in one bitmap). */
  const tint = (bmp, ch) => bmp.map((r) => r.replace(/#/g, ch));
  /** Puts bitmaps side by side, aligned on a shared bottom row (`base` = rows from the top of
      each part to its baseline's last row; defaults to its height − 1). */
  function hjoin(parts, gaps) {
    const above = Math.max(...parts.map((p) => (p.base != null ? p.base : p.bmp.length - 1)));
    const below = Math.max(
      ...parts.map((p) => p.bmp.length - 1 - (p.base != null ? p.base : p.bmp.length - 1)),
    );
    const H = above + below + 1;
    const rows = Array.from({ length: H }, () => "");
    parts.forEach((p, i) => {
      const b = p.base != null ? p.base : p.bmp.length - 1;
      const off = above - b;
      const w = bw(p.bmp);
      for (let r = 0; r < H; r++) {
        const src = r - off;
        rows[r] += src >= 0 && src < p.bmp.length ? p.bmp[src] : ".".repeat(w);
        if (i < parts.length - 1) rows[r] += ".".repeat(gaps[i] != null ? gaps[i] : 1);
      }
    });
    return { bmp: rows, base: above };
  }
  function grid(cols, rows, fill) {
    return Array.from({ length: rows }, () => new Array(cols).fill(fill));
  }
  /** Writes a bitmap into the grid; `map` turns each mark into a yarn key. */
  function stamp(g, bmp, col, row, map) {
    for (let r = 0; r < bmp.length; r++)
      for (let c = 0; c < bmp[r].length; c++) {
        const v = map[bmp[r][c]];
        if (!v) continue;
        const gr = row + r;
        const gc = col + c;
        if (g[gr] && gc >= 0 && gc < g[gr].length) g[gr][gc] = v;
      }
  }
  /** Merged rectangles for the cells of a bitmap that carry `mark`. */
  function bmpRects(bmp, x0, y0, cw, ch, mark = "#") {
    let s = "";
    for (let r = 0; r < bmp.length; r++) {
      let c = 0;
      while (c < bmp[r].length) {
        if (bmp[r][c] !== mark) {
          c++;
          continue;
        }
        let e = c;
        while (e < bmp[r].length && bmp[r][e] === mark) e++;
        s += `<rect x="${f2(x0 + c * cw)}" y="${f2(y0 + r * ch)}" width="${f2((e - c) * cw)}" height="${f2(ch)}"/>`;
        c = e;
      }
    }
    return s;
  }
  /** Colour runs of a stitch grid (only cells that differ from `base`). */
  function gridRuns(g, P, x0, y0, cw, ch, base) {
    let s = "";
    for (let r = 0; r < g.length; r++) {
      const row = g[r];
      let c = 0;
      while (c < row.length) {
        const k = row[c];
        let e = c + 1;
        while (e < row.length && row[e] === k) e++;
        if (k !== base && P[k])
          s += `<rect x="${f2(x0 + c * cw)}" y="${f2(y0 + r * ch)}" width="${f2((e - c) * cw)}" height="${f2(ch + 0.04)}" fill="${P[k]}"/>`;
        c = e;
      }
    }
    return s;
  }
  /** Rects for every cell of the grid holding key `k` (used to clip textures to a motif). */
  function keyRects(g, k, x0, y0, cw, ch) {
    let s = "";
    for (let r = 0; r < g.length; r++) {
      let c = 0;
      while (c < g[r].length) {
        if (g[r][c] !== k) {
          c++;
          continue;
        }
        let e = c;
        while (e < g[r].length && g[r][e] === k) e++;
        s += `<rect x="${f2(x0 + c * cw)}" y="${f2(y0 + r * ch)}" width="${f2((e - c) * cw)}" height="${f2(ch + 0.04)}"/>`;
        c = e;
      }
    }
    return s;
  }

  /* ---------- fallback: an Arabic name with no chart, sampled from Changa 800 ---------- */
  const RCACHE = new Map();
  /** Samples `text` at `rows` stitches tall. Returns { bmp, base } (base = the baseline's last row). */
  function rasterText(text, rows, thr = 0.45) {
    const spec = '800 100px "Changa"';
    const key = `${text}|${rows}|${thr}`;
    if (RCACHE.has(key)) return RCACHE.get(key);
    const m = document.createElement("canvas").getContext("2d");
    m.font = spec;
    const mt = m.measureText(text);
    const asc = mt.actualBoundingBoxAscent;
    const hh = asc + mt.actualBoundingBoxDescent;
    const ww = mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight;
    const cols = Math.max(1, Math.round((ww * rows) / hh));
    const S = 10;
    const cv = document.createElement("canvas");
    cv.width = cols * S;
    cv.height = rows * S;
    const x = cv.getContext("2d");
    x.scale(cv.width / ww, cv.height / hh);
    x.font = spec;
    x.fillText(text, mt.actualBoundingBoxLeft, asc);
    const d = x.getImageData(0, 0, cv.width, cv.height).data;
    const out = [];
    for (let r = 0; r < rows; r++) {
      let line = "";
      for (let c = 0; c < cols; c++) {
        let a = 0;
        for (let yy = 0; yy < S; yy++)
          for (let xx = 0; xx < S; xx++) a += d[((r * S + yy) * cv.width + c * S + xx) * 4 + 3];
        line += a / (S * S * 255) > thr ? "#" : ".";
      }
      out.push(line);
    }
    const res = {
      bmp: out,
      base: Math.max(0, Math.min(rows - 1, Math.round((asc / hh) * rows) - 1)),
    };
    let ok = true;
    try {
      ok = !document.fonts || document.fonts.check(spec, text);
    } catch (e) {
      ok = true;
    }
    if (ok) RCACHE.set(key, res);
    return res;
  }

  /* ---------- beats: the scarf knits itself (o.beat) ----------
     Four optional beats, each a few rows of the scarf knitting in. They are all done with CSS only
     (07-v2.css, "beats"), so this section and that one are all a port needs.

       "make"  on birth, 700ms at most: the cast-on rows knit in from the foot, the three tacking
               lines of the counted-gameweek slots run in, and the base scarf's tone-on-tone name
               band knits in row by row, bottom to top, the way a piece grows from its cast-on.
       "first" the first rating, 600ms at most, over an already visible number: the last counted
               gameweek's stripe (two rows, lower row first) knits in over its tacking line.
       "tick"  one more counted gameweek, 500ms at most: the new stripe knits in, as in "first".
       "founder" the founder grant, 520ms: the cream cast-on at the foot knits in from its first row,
               2026 stitched into those rows, then the two cable twists come in. Only the cast-on
               moves; the 84, ALI ·26 and the patch (BOT #, season) are drawn from the first frame.

     How a row knits: knit() wraps the row's SVG in <g class="c07v2-kr"> with two custom properties,
     --c07v2-d (delay) and --c07v2-t (duration). CSS reveals the row stitch by stitch, from the
     inline start (right to left in Arabic): a clip-path inset stepped one stitch at a time, fast
     along the row and slower over the last stitches, the way a knitter pulls the row tight.
     Rows are staggered by their index in knitting order (0 = first knitted).

     What never moves: the number (and its dash), the name's stitches, the serial and the patch.
     Only parts that are not those animate, so all of them are legible in the first painted frame.
     Nothing runs under prefers-reduced-motion, or without o.beat. */
  const BEATS = {
    // part: [start ms, gap between rows ms, row duration ms]
    make: { cast: [0, 36, 170], tack: [110, 45, 190], band: [200, 26, 190] },
    first: { stripe: [80, 110, 300] },
    tick: { stripe: [30, 90, 240] },
    // the founder's own: the cream cast-on knits in from the foot, 2026 with it, then the cables
    founder: { cast: [0, 64, 190] },
  };
  /** Wraps one row's SVG so it knits in at its turn; returns it unchanged when `beat` has no such
      part. `i` is the row's index in knitting order, `gap` overrides the stagger between rows. */
  function knit(beat, part, i, inner, gap) {
    const t = BEATS[beat] && BEATS[beat][part];
    if (!t) return inner;
    const d = Math.round(t[0] + i * (gap != null ? gap : t[1]));
    return `<g class="c07v2-kr" style="--c07v2-d:${d}ms;--c07v2-t:${t[2]}ms">${inner}</g>`;
  }

  /* ---------- colours from the profile ---------- */
  /** The lightest (or darkest) tint of `g` that reaches `target` contrast, from `t0` up to 0.9. */
  function reach(g, target, t0, toward) {
    let t = t0;
    let c = mix(g, toward, t);
    while (contrast(c, g) < target && t < 0.9) {
      t += 0.04;
      c = mix(g, toward, t);
    }
    return c;
  }
  function palette(p) {
    const club = p.club && p.club.primary;
    const G = club ? p.club.primary : WOOL;
    const L = club ? p.club.secondary || CREAM : CHAR;
    const lightG = lum(G) > 0.42;
    const N = lightG ? CHAR : CREAM; // the knitted name
    // the year (·26): the club's second colour, unless it would vanish on the ground
    const Y = contrast(L, G) >= 2.4 ? L : N;
    // the founder's cast-on: the club's second colour when it is light enough to read as cream
    const cast = lum(L) > 0.55 ? L : CREAM;
    const castInk = [G, L, CHAR].find((c) => contrast(c, cast) >= 3.2) || CHAR;
    const patch = lum(L) > 0.55 ? L : PATCH_FALLBACK;
    // HOMA's single-colour relief: the raised stitches catch the light (or, on a pale ground, the
    // shade). Pushed until the figures clear 6:1 before the stitch texture, so they stay above 3:1
    // on the card once the knit's shadows are on them, and above 4.5:1 on tokens.
    const toward = lightG ? "#000000" : "#ffffff";
    const R = reach(G, 6.2, 0.55, toward);
    const R2 = reach(G, 5.0, 0.5, toward);
    // the stripe yarn: the second colour, or cream when the second colour is too close to the ground
    const S = contrast(L, G) >= 1.8 ? L : CREAM;
    // the knitted drop shadow behind CHAMPION's and LEGEND's figures: a third, near-black yarn
    const D = lightG ? mix(G, "#000000", 0.45) : mix(G, "#000000", 0.62);
    // PRO's figures on the cream panel: the ground yarn, or the second yarn when the ground is too pale
    const K = contrast(G, CREAM) >= 2.6 ? G : contrast(L, CREAM) >= 2.6 ? L : CHAR;
    // CHAMPION's and LEGEND's cream figures, or the second yarn on a pale ground
    const F = contrast(CREAM, G) >= 2.6 ? CREAM : contrast(L, G) >= 2.6 ? L : CHAR;
    // the word on the tier strip (the strip is the stripe yarn)
    const T = contrast(G, S) >= 2.6 ? G : CHAR;
    // the base scarf (no tier yet): the dash in whichever of cream and charcoal stands out more from
    // the ground (always at least 4.5:1 before the knit's shadows), and a tone-on-tone name band,
    // a darker lot of the ground yarn, which keeps the name's own colour legible on it
    const dash = contrast(CREAM, G) >= contrast(CHAR, G) ? CREAM : CHAR;
    const Q = lightG ? mix(G, "#000000", 0.14) : mix(G, "#000000", 0.4);
    return {
      G,
      L,
      C: CREAM,
      B: BLUE,
      N,
      Y,
      R,
      R2,
      S,
      D,
      K,
      F,
      T,
      dash,
      Q,
      cast,
      castInk,
      patch,
      wool: !club,
      Gdk: mix(G, "#000000", 0.3),
      Gxd: mix(G, "#000000", 0.5),
      Glt: mix(G, "#ffffff", 0.18),
    };
  }

  /* ---------- textures ---------- */
  /** Stockinette (Vs) or garter (ridges) over any yarn colour. */
  function stitchPattern(id, c, opt = {}) {
    const w = c;
    const h = opt.h || c;
    const gapC = opt.gapC || "#020a1c";
    const gapO = opt.gap != null ? opt.gap : 0.4;
    const legO = opt.leg != null ? opt.leg : 0.26;
    const tf = opt.transform ? ` patternTransform="${opt.transform}"` : "";
    const gid = id + "-lg";
    const grad =
      `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#fff" stop-opacity="${legO}"/><stop offset=".45" stop-color="#fff" stop-opacity="${f2(legO * 0.2)}"/>` +
      `<stop offset=".8" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>`;
    if (opt.garter) {
      // garter: continuous horizontal ridges, the bumps of each ridge half a stitch off the row below
      let rows = "";
      for (let r = 0; r < 2; r++) {
        const y0 = r * h;
        const off = r ? w / 2 : 0;
        rows +=
          `<rect y="${f2(y0 + h * 0.68)}" width="${f2(w)}" height="${f2(h * 0.32)}" fill="${gapC}" fill-opacity="${gapO}"/>` +
          [off - w / 2, off + w / 2]
            .map(
              (cx) =>
                `<ellipse cx="${f2(cx)}" cy="${f2(y0 + h * 0.38)}" rx="${f2(w * 0.5)}" ry="${f2(h * 0.28)}" fill="url(#${gid})"/>`,
            )
            .join("") +
          `<rect x="${f2(off - 0.3)}" y="${f2(y0 + h * 0.16)}" width=".6" height="${f2(h * 0.45)}" fill="${gapC}" fill-opacity="${f2(gapO * 0.45)}"/>`;
      }
      return (
        grad +
        `<pattern id="${id}" width="${f2(w)}" height="${f2(2 * h)}" patternUnits="userSpaceOnUse"${tf}>${rows}</pattern>`
      );
    }
    const rx = w * 0.25;
    const ry = h * 0.6;
    const legs = [
      [w * 0.29, h * 0.5, -24],
      [w * 0.71, h * 0.5, 24],
    ];
    const ell = ([cx, cy, a]) => {
      const t = (a * Math.PI) / 180;
      const ax = ry * Math.sin(-t);
      const ay = ry * Math.cos(t);
      return `M${f2(cx - ax)} ${f2(cy - ay)}A${f2(rx)} ${f2(ry)} ${a} 1 0 ${f2(cx + ax)} ${f2(cy + ay)}A${f2(rx)} ${f2(ry)} ${a} 1 0 ${f2(cx - ax)} ${f2(cy - ay)}Z`;
    };
    return (
      grad +
      `<pattern id="${id}" width="${f2(w)}" height="${f2(h)}" patternUnits="userSpaceOnUse"${tf}>` +
      `<path d="M0 0H${f2(w)}V${f2(h)}H0Z${legs.map(ell).join("")}" fill="${gapC}" fill-opacity="${gapO}" fill-rule="evenodd"/>` +
      legs
        .map(
          ([cx, cy, a]) =>
            `<ellipse cx="${f2(cx)}" cy="${f2(cy)}" rx="${f2(rx)}" ry="${f2(ry)}" transform="rotate(${a} ${f2(cx)} ${f2(cy)})" fill="url(#${gid})"/>`,
        )
        .join("") +
      `</pattern>`
    );
  }
  /** Satin-stitch thread: a slanted hatch of threads and shadow gaps. */
  function hatch(id, thread, gap, tw = 0.8, gw = 0.45, ang = 62) {
    const p = f2(tw + gw);
    return `<pattern id="${id}" width="${p}" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(${ang})"><rect width="${p}" height="6" fill="${gap}"/><rect width="${tw}" height="6" fill="${thread}"/></pattern>`;
  }
  /** Brushed steel for the barrier rail. */
  function steelGrad(id) {
    return (
      `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#5E6876"/><stop offset=".18" stop-color="#E6EBF0"/><stop offset=".42" stop-color="#C6CDD6"/>` +
      `<stop offset=".7" stop-color="#A9B2BE"/><stop offset="1" stop-color="#4E5661"/></linearGradient>`
    );
  }

  /* ---------- tassels ---------- */
  /** One tassel. Bundled strands under a wrap; CHAMPION twists two plies; LEGEND knots them. */
  function tassel(x, top, len, w, P, opt) {
    const rnd = opt.rnd;
    const hang = opt.hang || 0;
    let s = "";
    if (opt.twisted) {
      // a two-ply cord: the ground yarn twisted with the second yarn, ending in a brushed tip
      const cw = w * 0.46;
      const y0 = top + 3;
      const y1 = top + len - 11;
      const xb = x + hang;
      s += `<path d="M${f2(x)} ${f2(y0)}L${f2(xb)} ${f2(y1)}" stroke="${P.Gxd}" stroke-width="${f2(cw + 1.6)}" stroke-linecap="round" opacity=".55"/>`;
      s += `<path d="M${f2(x)} ${f2(y0)}L${f2(xb)} ${f2(y1)}" stroke="${P.G}" stroke-width="${f2(cw)}" stroke-linecap="round"/>`;
      let tw = "";
      for (let y = y0 + 2.5; y < y1 - 1; y += 4.6) {
        const xx = x + (hang * (y - y0)) / (y1 - y0);
        tw += `M${f2(xx - cw * 0.42)} ${f2(y + 1.6)}L${f2(xx + cw * 0.42)} ${f2(y - 1.6)}`;
      }
      s += `<path d="${tw}" stroke="${P.S}" stroke-width="1.7" stroke-linecap="round" fill="none"/>`;
      s += `<path d="M${f2(x - cw * 0.18)} ${f2(y0 + 2)}L${f2(xb - cw * 0.18)} ${f2(y1 - 1)}" stroke="#fff" stroke-opacity=".16" stroke-width="1" fill="none"/>`;
      for (let i = 0; i < 6; i++) {
        const t = (i - 2.5) / 2.5;
        s += `<path d="M${f2(xb + t * cw * 0.35)} ${f2(y1 - 1)}Q${f2(xb + t * cw * 0.6)} ${f2(y1 + 5)} ${f2(xb + t * cw * 0.85 + (rnd() - 0.5))} ${f2(y1 + 11 - rnd() * 2.5)}" stroke="${i % 2 ? P.S : P.G}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
      }
      s += `<rect x="${f2(x - w * 0.3)}" y="${f2(top + 1)}" width="${f2(w * 0.6)}" height="3.4" rx="1.4" fill="${P.Gdk}"/>`;
      return s;
    }
    // matte yarn: seven strands gathered under the wrap and splaying to uneven tips. Each strand is
    // drawn as a ply (a dashed twist over the yarn), with no outline round the bundle and no light
    // streak, so the tassel reads as wool rather than a moulded cone.
    const n = 7;
    const knot = opt.knotted;
    const order = [0, 6, 1, 5, 2, 4, 3]; // outer strands first, the centre on top
    for (const i of order) {
      const t = (i - (n - 1) / 2) / ((n - 1) / 2);
      const x0 = x + t * w * 0.2;
      const x1 = x + t * w * 0.62 + hang + (rnd() * 2 - 1) * 1.1;
      const l = len - rnd() * 6;
      const kink = knot ? 9 : 4;
      const d = `M${f2(x0)} ${f2(top + kink)}C${f2(x0 + hang * 0.1)} ${f2(top + l * 0.4)} ${f2(x1 - hang * 0.25 - t * 0.8)} ${f2(top + l * 0.72)} ${f2(x1)} ${f2(top + l)}`;
      const yarnW = f2(Math.max(1.4, (w / n) * 0.95));
      s += `<path d="${d}" stroke="${P.Gdk}" stroke-width="${f2(yarnW * 1 + 0.7)}" fill="none" stroke-linecap="round" opacity=".32"/>`;
      s += `<path d="${d}" stroke="${P.G}" stroke-width="${yarnW}" fill="none" stroke-linecap="round"/>`;
      if (i % 2)
        s += `<path d="${d}" stroke="${P.Gdk}" stroke-width="${yarnW}" fill="none" stroke-linecap="round" opacity=".22"/>`;
      s += `<path d="${d}" stroke="${P.Gdk}" stroke-width="${f2(yarnW * 0.42)}" stroke-dasharray="1.3 1.7" fill="none" opacity=".45"/>`;
    }
    if (knot) {
      s += `<ellipse cx="${f2(x)}" cy="${f2(top + 6)}" rx="${f2(w * 0.36)}" ry="4.2" fill="${P.G}" stroke="${P.Gdk}" stroke-width="1"/>`;
      s += `<path d="M${f2(x - w * 0.28)} ${f2(top + 5)}C${f2(x - 2)} ${f2(top + 2.4)} ${f2(x + 2)} ${f2(top + 9)} ${f2(x + w * 0.3)} ${f2(top + 6)}" stroke="${P.Glt}" stroke-width="1" fill="none" opacity=".8"/>`;
    } else {
      // the wrap: a few turns of the second yarn round the gathered head
      s += `<rect x="${f2(x - w * 0.26)}" y="${f2(top + 0.6)}" width="${f2(w * 0.52)}" height="4" rx="1.4" fill="${P.Gdk}"/>`;
      s += `<path d="M${f2(x - w * 0.24)} ${f2(top + 1.8)}H${f2(x + w * 0.24)}M${f2(x - w * 0.24)} ${f2(top + 3.4)}H${f2(x + w * 0.24)}" stroke="${P.S}" stroke-width=".8" fill="none"/>`;
    }
    return s;
  }

  /** The base scarf's fringe: no tassels (their count is the tier), only a close row of loose
      strands, each a short ply of the ground yarn, hanging straight from the knitted end. */
  function looseFringe(x0, x1, y, len, P, rnd) {
    const n = Math.max(8, Math.round((x1 - x0) / 7));
    const step = (x1 - x0) / n;
    const w = f2(step * 0.52);
    let s = "";
    for (let i = 0; i < n; i++) {
      const x = x0 + step * (i + 0.5);
      const l = len - rnd() * 7;
      const sw = (rnd() * 2 - 1) * 1.8;
      const d = `M${f2(x)} ${f2(y + 1)}C${f2(x + sw * 0.25)} ${f2(y + l * 0.4)} ${f2(x + sw * 0.8)} ${f2(y + l * 0.72)} ${f2(x + sw)} ${f2(y + l)}`;
      s += `<path d="${d}" stroke="${P.Gdk}" stroke-width="${f2(+w + 0.7)}" fill="none" stroke-linecap="round" opacity=".32"/>`;
      s += `<path d="${d}" stroke="${P.G}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
      if (i % 2)
        s += `<path d="${d}" stroke="${P.Gdk}" stroke-width="${w}" fill="none" stroke-linecap="round" opacity=".22"/>`;
      s += `<path d="${d}" stroke="${P.Gdk}" stroke-width="${f2(w * 0.4)}" stroke-dasharray="1.2 1.6" fill="none" opacity=".45"/>`;
    }
    return s;
  }

  /* ---------- the woven jacquard patch ---------- */
  /** A woven patch sewn on the knit: club-secondary ground, a satin-stitch border, a 1u thickness
      shadow, the unmodified colour logo at the top, the ratings in Manrope 700 (tabular) under
      600 caps labels, and the ID, season and country woven along the bottom edge.
      opts.keys: which ratings; opts.cols: 4 (one row) or 1 (a column of two); opts.head: "logo" | "season";
      opts.foot: lines woven along the bottom edge. Returns { svg, h }. */
  function patch(p, o, x, y, w, ids, P, opts = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const k = opts.k || 1;
    const keys = opts.keys || MC.STATS;
    const ncol = opts.cols || keys.length;
    const nrow = Math.ceil(keys.length / ncol);
    const bdr = 2.6 * k; // satin border
    const pad = 5.6 * k;
    const L = x + bdr + pad;
    const R = x + w - bdr - pad;
    const iw = R - L;
    const lw = Math.min(iw * (ncol > 1 ? 0.3 : 0.8), 52 * k);
    const lh = lw / MC.LOGO_RATIO.wordmark;
    const headY = y + bdr + pad * 0.85;
    const headH = opts.head === "logo" ? lh : 7 * k;
    const figFs = (ncol > 1 ? 14.5 : 15) * k * (opts.figScale || 1);
    const labFs = ar ? 8.4 * k : 7.6 * k;
    const cellH = labFs * 1.25 + figFs * 1.02;
    const stat0 = headY + headH + 4.5 * k;
    const footFs = (opts.footFs || 5.6) * k;
    const footLines = opts.foot || [];
    const ruleY = stat0 + nrow * cellH + (nrow - 1) * 4 * k + 3.5 * k;
    const footY0 = ruleY + footFs * 1.4;
    const h = Math.ceil(
      (footLines.length ? footY0 + (footLines.length - 1) * footFs * 1.4 + footFs * 0.55 : ruleY) +
        pad * 0.7 +
        bdr -
        y,
    );
    const thumb = !!opts.thumb;
    let s = "";
    // thickness: a soft shadow, then a 1u hard edge below and to the inline end
    s += `<rect x="${f2(x + 0.6)}" y="${f2(y + 1.6)}" width="${f2(w)}" height="${h}" fill="#020a1c" opacity=".18" filter="url(#${ids.soft})"/>`;
    s += `<rect x="${f2(x + (ar ? -1 : 1) * k)}" y="${f2(y + 1 * k)}" width="${f2(w)}" height="${h}" fill="${mix(P.patch, "#000000", 0.45)}"/>`;
    s += `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${h}" fill="${P.patch}"/>`;
    if (!thumb) {
      s += `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${h}" fill="url(#${ids.weave})"/>`;
      // the satin-stitch border (a merrowed edge): threads over the edge, in the club's dark yarn
      s += `<path d="M${f2(x)} ${f2(y)}h${f2(w)}v${h}h${f2(-w)}Z M${f2(x + bdr)} ${f2(y + bdr)}v${f2(h - 2 * bdr)}h${f2(w - 2 * bdr)}v${f2(-(h - 2 * bdr))}Z" fill="url(#${ids.satin})" fill-rule="evenodd"/>`;
    } else
      s += `<path d="M${f2(x)} ${f2(y)}h${f2(w)}v${h}h${f2(-w)}Z M${f2(x + bdr)} ${f2(y + bdr)}v${f2(h - 2 * bdr)}h${f2(w - 2 * bdr)}v${f2(-(h - 2 * bdr))}Z" fill="${P.Gdk}" fill-rule="evenodd"/>`;
    const tx = (xx, yy, str, anchor, cls, fs, dir = "ltr", extra = "") =>
      `<text x="${f2(xx)}" y="${f2(yy)}" text-anchor="${anchor}" direction="${dir}" font-size="${f2(fs)}" class="c07v2-pt ${cls}"${extra}>${esc(str)}</text>`;
    // header: the logo (unmodified, colour) at the inline start; the sample note at the end
    if (opts.head === "logo") {
      const lx = ar ? R - lw : L;
      s += MC.logo("wordmark", { variant: "color", w: f2(lw), h: f2(lh), label: false }).replace(
        "<svg ",
        `<svg x="${f2(lx)}" y="${f2(headY)}" `,
      );
    }
    if (thumb) {
      keys.forEach((key, i) => {
        const cx = L + (iw / ncol) * ((ar ? ncol - 1 - (i % ncol) : i % ncol) + 0.5);
        const cy = stat0 + Math.floor(i / ncol) * (cellH + 4 * k);
        s += `<rect x="${f2(cx - 7 * k)}" y="${f2(cy)}" width="${f2(14 * k)}" height="${f2(labFs * 0.8)}" fill="${INK_SOFT}" opacity=".45"/><rect x="${f2(cx - 9 * k)}" y="${f2(cy + labFs * 1.2)}" width="${f2(18 * k)}" height="${f2(figFs * 0.72)}" fill="${INK}" opacity=".75"/>`;
      });
      return { svg: s, h };
    }
    // the sample note sits at the inline end of the header (an RTL run anchored at the left edge ends there)
    if (opts.note)
      s += tx(
        ar ? L : R,
        headY + headH * 0.78,
        opts.note,
        "end",
        "c07v2-pt-note" + (ar ? " c07v2-pt-ar" : ""),
        5.4 * k,
        ar ? "rtl" : "ltr",
      );
    if (opts.head === "season")
      s += tx(
        ar ? R : L,
        headY + headH * 0.86,
        opts.headText || p.season,
        ar ? "end" : "start",
        "c07v2-pt-meta",
        6.2 * k,
      );
    // the ratings: label (600 caps) over the figure (700, tabular), centred in each column
    keys.forEach((key, i) => {
      const col = i % ncol;
      const rowI = Math.floor(i / ncol);
      const vis = ar ? ncol - 1 - col : col;
      const cx = L + (iw / ncol) * (vis + 0.5);
      const top = stat0 + rowI * (cellH + 4 * k);
      if (ar)
        s += tx(
          cx,
          top + labFs * 0.95,
          S.stats[key],
          "middle",
          "c07v2-pt-k c07v2-pt-ar",
          labFs,
          "rtl",
        );
      else s += tx(cx, top + labFs * 0.9, S.stats[key], "middle", "c07v2-pt-k", labFs);
      // a rating that does not exist yet is a dash, never 0
      const nil = p.stats[key] == null;
      s += tx(
        cx,
        top + labFs * 1.25 + figFs * 0.86,
        nil ? MC.onbStr(o).dash : String(p.stats[key]),
        "middle",
        "c07v2-pt-v" + (nil ? " c07v2-pt-nil" : ""),
        figFs,
      );
    });
    // the woven bottom edge: a rule, then the ID's physical carrier
    if (footLines.length) {
      s += `<path d="M${f2(L)} ${f2(ruleY)}H${f2(R)}" stroke="${P.Gdk}" stroke-width="${f2(0.8 * k)}" stroke-dasharray="${f2(2.2 * k)} ${f2(1.4 * k)}" stroke-linecap="round" opacity=".7"/>`;
      footLines.forEach((ln, i) => {
        s += `<text x="${f2((L + R) / 2)}" y="${f2(footY0 + i * footFs * 1.4)}" text-anchor="middle" direction="${ar ? "rtl" : "ltr"}" font-size="${f2(footFs)}" class="c07v2-pt c07v2-pt-foot${ar ? " c07v2-pt-ar" : ""}">${ln}</text>`;
      });
    }
    // the weave over everything woven (the text reads as floats of thread, not print)
    s += `<rect x="${f2(x + bdr)}" y="${f2(y + bdr)}" width="${f2(w - 2 * bdr)}" height="${f2(h - 2 * bdr)}" fill="url(#${ids.weft})"/>`;
    return { svg: s, h };
  }
  /** The ID's carrier line, woven along the patch's foot (spans so the ID stays left-to-right). */
  function footLine(p, o) {
    const S = MC.s(o);
    const id = idText(p, o);
    if (MC.isAr(o))
      return `<tspan direction="ltr" unicode-bidi="embed">${id}</tspan> · <tspan direction="ltr" unicode-bidi="embed">${esc(p.season)}</tspan> · ${esc(S.country)}`;
    return `${id} · ${esc(p.season)} · ${esc(S.country)}`;
  }
  /** The ID carrier's text: the serial, or (not assigned yet) the carrier with a dash, no sentence. */
  const idText = (p, o) => (p.id ? esc(p.id) : "BOT " + MC.onbStr(o).dash);
  const NOTE = (o) => (MC.isAr(o) ? "J.01–J.07 · مثال" : "J.01–J.07 · Exemple");
  /** The patch's sample note. An onboarding profile does not know which gameweeks the sample
      season holds, so it carries only the label. */
  const noteOf = (p, o) => (p.minRated != null ? (MC.isAr(o) ? "مثال" : "Exemple") : NOTE(o));

  /* ---------- the knitted motifs ---------- */
  /** Drops blank rows and columns round a bitmap; returns the rows and how many were cut at the top. */
  function trim(bmp) {
    let t = 0;
    let b = bmp.length - 1;
    while (t <= b && bmp[t].indexOf("#") < 0) t++;
    while (b >= t && bmp[b].indexOf("#") < 0) b--;
    const rows = bmp.slice(t, b + 1);
    if (!rows.length) return { bmp, top: 0 };
    let l = Infinity;
    let r = -1;
    for (const row of rows) {
      const i = row.indexOf("#");
      if (i >= 0) {
        l = Math.min(l, i);
        r = Math.max(r, row.lastIndexOf("#"));
      }
    }
    return { bmp: rows.map((row) => row.slice(l, r + 1)), top: t };
  }
  /** Drops blank rows only (keeps the chart's width). */
  const trimRows = (bmp) => {
    let t = 0;
    let b = bmp.length - 1;
    while (t <= b && !/[^.]/.test(bmp[t])) t++;
    while (b >= t && !/[^.]/.test(bmp[b])) b--;
    return bmp.slice(t, b + 1);
  };
  /** The knitted dash of a card with no rating yet: 14 stitches by 3 rows (the stem weight of the
      84's figures) at mid-height of the 13-row band, in the 84's own yarn. Never 0, never blank. */
  const DASH13 = Array.from({ length: 13 }, (_, r) => (r >= 5 && r <= 7 ? "#" : ".").repeat(14));
  /** The 84: two 9×13 figures, two stitches apart; or, with no rating yet, the dash. */
  const digitsArt = (ovr) => (ovr == null ? DASH13 : word(String(ovr), D913, 2));
  /** Which counted gameweeks are drawn on the object: n slots (the minimum) with k knitted. Only
      while the number is null or just reached (counted ≤ n); later the season's stripes carry it. */
  function marksOf(p) {
    if (!(p.minRated > 0) || p.counted == null) return null;
    if (p.ovr != null && p.counted > p.minRated) return null;
    return { n: p.minRated, k: Math.max(0, Math.min(p.counted, p.minRated)) };
  }

  /* ---------- the name and its supporter year: a fit ladder, never an initial ---------- */
  /** The year as a bitmap marked '*': '·26' (Latin), '26·' (Arabic, in visual order). The dot is
      one stitch at mid-height of the figures. */
  function yearArt(yr, fig, ar) {
    const h = fig[0].length;
    const dot = { bmp: Array.from({ length: h }, (_, i) => (i === Math.floor(h / 2) ? "*" : ".")) };
    const digits = { bmp: tint(word(yr, fig, 1), "*") };
    return hjoin(ar ? [digits, dot] : [dot, digits], [1]);
  }
  /** The year on the name's baseline, after the name (before it on the page in Arabic). */
  function yearInline(name, yb, g, ar) {
    return ar ? hjoin([yb, name], [g]) : hjoin([name, yb], [g]);
  }
  /** The year above the end of the name (right in Latin, left in Arabic), as low as it can sit with
      one clear stitch round every stitch of the name. */
  function yearTuck(name, yb, ar) {
    const nb = name.bmp;
    const nh = nb.length;
    const nw = bw(nb);
    const yw = bw(yb.bmp);
    const yh = yb.bmp.length;
    const W = Math.max(nw, yw);
    const nx = ar ? 0 : W - nw;
    const yx = ar ? 0 : W - yw;
    const hit = (top) => {
      for (let r = 0; r < yh; r++)
        for (let c = 0; c < yw; c++) {
          if (yb.bmp[r][c] === ".") continue;
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
              const gr = top + r + dr;
              const gc = yx + c + dc - nx;
              if (gr >= 0 && gr < nh && gc >= 0 && gc < nw && nb[gr][gc] !== ".") return true;
            }
        }
      return false;
    };
    const base = name.base != null ? name.base : nh - 1;
    let top = base - yh + 1;
    while (top > -yh - 1 && hit(top)) top--;
    const off = Math.max(0, -top);
    const H = Math.max(nh + off, top + off + yh);
    const rows = Array.from({ length: H }, () => new Array(W).fill("."));
    const paint = (bmp, x, y) =>
      bmp.forEach((row, r) => [...row].forEach((ch, c) => ch !== "." && (rows[y + r][x + c] = ch)));
    paint(nb, nx, off);
    paint(yb.bmp, yx, top + off);
    return { bmp: rows.map((r) => r.join("")), base: base + off };
  }
  /** Lines stacked and centred, one blank row apart. */
  function vstack(parts, gap = 1) {
    const W = Math.max(...parts.map(bw));
    const rows = [];
    parts.forEach((b, i) => {
      if (i) for (let g = 0; g < gap; g++) rows.push(".".repeat(W));
      const l = Math.floor((W - bw(b)) / 2);
      b.forEach((row) => rows.push(".".repeat(l) + row + ".".repeat(W - l - row.length)));
    });
    return rows;
  }
  /** Every way to cut a name into n lines: at spaces when it has several words, else between letters
      (at least two letters a line). */
  function splits(name, n) {
    const words = name.split(/\s+/).filter(Boolean);
    const units = words.length >= n ? words : [...name.replace(/\s+/g, "")];
    const joiner = words.length >= n ? " " : "";
    const min = words.length >= n ? 1 : 2;
    const out = [];
    const rec = (start, left, acc) => {
      if (left === 1) {
        if (units.length - start >= min) out.push([...acc, units.slice(start).join(joiner)]);
        return;
      }
      for (let e = start + min; e <= units.length - min * (left - 1); e++)
        rec(e, left - 1, [...acc, units.slice(start, e).join(joiner)]);
    };
    rec(0, n, []);
    return out;
  }
  const LATIN = [
    { f: N8, y: F35 },
    { f: N7, y: F35 },
    { f: N6, y: F34 },
  ];
  function latinName(name, yr, inner) {
    const up = name.toUpperCase();
    const fits = (b) => bw(b.bmp) <= inner;
    // 1. one line, the year on the baseline after it (8 rows, then 7, then 6)
    for (const F of LATIN) {
      const nb = { bmp: word(up, F.f, 1), base: F.f.A.length - 1 };
      if (!yr) {
        if (fits(nb)) return { ...nb, rows: F.f.A.length };
        continue;
      }
      const yb = yearArt(yr, F.y, false);
      for (const g of [2, 1]) {
        const j = yearInline(nb, yb, g, false);
        if (fits(j)) return { ...j, rows: F.f.A.length };
      }
    }
    // 2. one line, the year stacked above its end
    if (yr)
      for (const F of LATIN) {
        const nb = { bmp: word(up, F.f, 1), base: F.f.A.length - 1 };
        const j = yearTuck(nb, yearArt(yr, F.y, false), false);
        if (fits(j)) return { ...j, rows: F.f.A.length };
      }
    // 3. two lines, then three. A break between two consonants (YAS|MINE, OTH|MANE, SAL|MA) reads as
    // a syllable; any other break is a last resort. The year goes after the last line, else on a
    // line of its own.
    const V = /[AEIOUY]/;
    const cost = (parts) =>
      parts.slice(1).reduce((t, part, i) => {
        const prev = parts[i];
        const a = prev[prev.length - 1];
        const b = part[0];
        if (a === " " || b === " " || /\s/.test(up)) return t;
        return t + (!V.test(a) && !V.test(b) ? 0 : !V.test(b) ? 1 : 3);
      }, 0);
    for (const n of [2, 3, 4]) {
      const cands = [];
      for (const F of LATIN.slice(1))
        for (const parts of splits(up, n)) {
          const lines = parts.map((t) => word(t, F.f, 1));
          const rows = F.f.A.length;
          if (!yr) {
            const b = vstack(lines);
            if (bw(b) <= inner) cands.push({ b, rank: cost(parts) * 10, rows });
            continue;
          }
          const yb = yearArt(yr, F.y, false);
          let placed = null;
          for (const g of [2, 1]) {
            const b = vstack([
              ...lines.slice(0, -1),
              yearInline({ bmp: lines[n - 1] }, yb, g, false).bmp,
            ]);
            if (bw(b) <= inner) {
              placed = b;
              break;
            }
          }
          if (placed) cands.push({ b: placed, rank: cost(parts) * 10, rows });
          else {
            // the year on a line of its own, set at the end of the name (right-aligned)
            const wmax = Math.max(...lines.map(bw));
            const yl = yb.bmp.map((r) => ".".repeat(Math.max(0, wmax - bw(yb.bmp))) + r);
            const b = vstack([...lines, yl]);
            if (bw(b) <= inner) cands.push({ b, rank: cost(parts) * 10 + 5, rows });
          }
        }
      if (cands.length) {
        // the best break first, then the larger capitals, then the narrower block
        cands.sort((x, y) => x.rank - y.rank || y.rows - x.rows || bw(x.b) - bw(y.b));
        const best = cands[0];
        return { bmp: best.b, base: best.b.length - 1, rows: best.rows };
      }
    }
    // the narrowest: one letter a line would still be a name, never a single initial
    const b = vstack([...up.replace(/\s+/g, "")].map((ch) => word(ch, N6, 1)));
    return { bmp: b, base: b.length - 1, rows: 6 };
  }
  function arabicName(name, yr, inner) {
    const fits = (b) => bw(b.bmp) <= inner;
    // the year in 5-row figures, as in Latin; the 4-row set (whose 6 reads as a b) only as a last resort
    const ybs = yr ? [yearArt(yr, F35, true), yearArt(yr, F34, true)] : [null];
    const tries = [];
    if (AR_NAME[name]) tries.push(() => AR_NAME[name]);
    if (AR_NAME[name + "~"]) tries.push(() => AR_NAME[name + "~"]);
    for (const rows of [12, 11, 10, 9, 8, 7, 6]) tries.push(() => rasterText(name, rows));
    let last = null;
    for (const t of tries) {
      const raw = t();
      const tr = trim(raw.bmp);
      const nb = { bmp: tr.bmp, base: Math.max(0, raw.base - tr.top) };
      last = nb;
      if (!yr) {
        if (fits(nb)) return { ...nb, rows: nb.bmp.length };
        continue;
      }
      for (const yb of ybs) {
        for (const g of [2, 1]) {
          const j = yearInline(nb, yb, g, true);
          if (fits(j)) return { ...j, rows: nb.bmp.length };
        }
        const k = yearTuck(nb, yb, true);
        if (fits(k)) return { ...k, rows: nb.bmp.length };
      }
    }
    // a long name of several words (عبد الله يوسف): two lines, then three, broken at the spaces, each
    // line sampled from Changa 800 like the one-line fallback; the year ends the last line, or has a
    // line of its own at the inline end
    const words = name.split(/\s+/).filter(Boolean);
    for (let n = 2; n <= Math.min(3, words.length); n++)
      for (const rows of [9, 8, 7, 6]) {
        const cands = [];
        for (const parts of splits(words.join(" "), n)) {
          const lines = parts.map((t) => {
            const raw = rasterText(t, rows);
            const tr = trim(raw.bmp);
            return { bmp: tr.bmp, base: Math.max(0, raw.base - tr.top) };
          });
          let tail = lines[n - 1];
          let own = null;
          if (yr) {
            const yb = ybs[0];
            const j = [2, 1].map((g) => yearInline(tail, yb, g, true)).find(fits);
            if (j) tail = j;
            else own = yb.bmp;
          }
          const stack = [...lines.slice(0, -1).map((l) => l.bmp), tail.bmp, ...(own ? [own] : [])];
          const w = Math.max(...stack.map(bw));
          // lines are centred; the year's own line sits at the inline end (the left, in Arabic)
          const b = vstack(
            stack.map((rowsOf, i) =>
              own && i === stack.length - 1
                ? rowsOf.map((r) => r + ".".repeat(w - bw(rowsOf)))
                : rowsOf,
            ),
            2,
          );
          if (bw(b) <= inner) cands.push({ b, w: bw(b) });
        }
        if (cands.length) {
          cands.sort((x, y) => x.w - y.w);
          return { bmp: cands[0].b, base: cands[0].b.length - 1, rows: rows };
        }
      }
    const k = yr ? yearTuck(last, ybs[ybs.length - 1], true) : last;
    return { ...k, rows: last.bmp.length };
  }
  /** The name with the supporter year (ALI ·26): name stitches '#', year stitches '*'. In Arabic the
      year comes first on the page (26· علي), the dot between the year and the name. */
  function nameArt(p, o, inner) {
    const name = MC.nameOf(p, o).trim();
    // a guest before naming: the name carrier is drawn empty, at the height a name would take
    if (!name) {
      const rows = MC.isAr(o) ? 12 : 8;
      return { bmp: Array(rows).fill(""), base: rows - 1, rows };
    }
    const yr = p.founder ? String(p.founder).slice(-2) : "";
    return MC.isAr(o) ? arabicName(name, yr, inner) : latinName(name, yr, inner);
  }
  /** The tier word: Latin on 4 rows; Arabic hand-charted. */
  function tierArt(tier, o) {
    if (MC.isAr(o)) return trimRows(AR_TIER[tier]);
    return word(MC.STR.lat.tiers[tier], T4, 1);
  }

  /** Rects for the cells holding key `k` in rows [r0, r1). */
  function keyRectsIn(g, k, x0, y0, cw, ch, r0, r1) {
    return keyRects(g.slice(r0, r1), k, x0, y0 + r0 * ch, cw, ch);
  }
  /** A straight cast-off edge: the bind-off loops along a knitted end. */
  function castOff(xa, xb, y, step, ink) {
    let d = "";
    for (let x = xa + step / 2; x < xb - 1; x += step)
      d += `M${f2(x - step * 0.36)} ${f2(y - 0.4)}a${f2(step * 0.36)} ${f2(step * 0.28)} 0 0 0 ${f2(step * 0.72)} 0`;
    return `<path d="${d}" stroke="${ink}" stroke-width="1" fill="none"/>`;
  }

  /* ---------- full card: the scarf folded over the rail (HOMA → CHAMPION) ---------- */
  /** o._share: the share's composition, both halves over the rail. The front keeps the 84, the name,
      the tier and the patch and ends in a cast-off edge; the back half, offset to the inline start
      and longer, carries the season's stripes, the founder's cast-on and the fringe. */
  function fullHanging(p, o) {
    const ar = MC.isAr(o);
    const tier = p.tier || null; // null: the base scarf, before any rating
    const T = tier || "BASE";
    const bare = !tier;
    const Gg = GAUGE[T];
    const cols = Gg.cols;
    const c = FW / cols;
    const P = palette(p);
    const thumb = !!o.thumb;
    const share = !!o._share;
    const homa = tier === "HOMA";
    const nil = p.ovr == null; // the number carrier is plain rib with a dash
    const marks = share ? null : marksOf(p);
    const beat = BEATS[o.beat] ? o.beat : "";
    const newMark = !!marks && marks.k > 0 && (beat === "first" || beat === "tick"); // the stripe that knits in
    const SK = p.serial || "0"; // seeds for the grain and the fringe
    const u = MC.uid(PFX);
    const id = (k) => `${u}-${k}`;
    const ids = {
      base: id("pb"),
      garter: id("pg"),
      cast: id("pc"),
      clip: id("cl"),
      bclip: id("bc"),
      curl: id("cu"),
      fold: id("fo"),
      grain: id("gr"),
      soft: id("sf"),
      weave: id("wv"),
      weft: id("wf"),
      satin: id("st"),
      rail: id("rl"),
      tape: id("tp"),
      shade: id("sh"),
    };
    const at = (lc) => (ar ? cols - 1 - lc : lc); // logical column (from the inline start) → grid column
    const binding = tier === "CHAMPION";
    const selv = tier === "STADE" || tier === "PRO";
    const reserve = binding ? 4 : selv ? 2 : 1; // stitches taken by selvedges or the bound edges
    const inner = cols - reserve - 2;

    // motifs
    const dg = digitsArt(p.ovr);
    const nm = nameArt(p, o, inner);
    const tw = tier ? tierArt(tier, o) : [];

    // rows, from the rail down; a ground-colour override per row ('' = the ground)
    const keys = [];
    let r = 0;
    const push = (n, k = "") => {
      for (let i = 0; i < n; i++) keys.push(k);
      r += n;
    };
    push(Math.ceil((RAIL_Y + RAIL_H + 3 - FT) / c));
    const L = {};
    // the 84 (PRO: on a cream panel; STADE: its one jacquard band under it; CHAMPION: a stripe pair)
    if (tier === "PRO") {
      L.digits = r + 1;
      L.carrier = [r, 15];
      push(15, "C");
      push(1);
    } else {
      L.digits = r;
      L.carrier = [r, binding ? 14 : 13];
      push(binding ? 14 : 13);
      push(1);
      if (tier === "STADE" || binding) {
        push(2, "S");
        push(1);
      }
    }
    // the name band (the base scarf's is a tone-on-tone band, drawn under the grid so the name stays on top)
    L.nameBand = r;
    L.name = r + 1;
    push(nm.bmp.length + 2);
    // the tier strip: a narrow band of the stripe yarn (HOMA: a garter ridge band in the one yarn).
    // The base scarf has none.
    L.strip = r;
    L.tier = r + 1;
    if (tier) push(tw.length + 2, homa ? "" : "S");
    L.stripEnd = r;
    // the season and the patch
    const pw = FW - 4 * c;
    const px = X0 + 2 * c;
    const foot = [footLine(p, o)];
    const note = noteOf(p, o);
    const dry = patch(p, o, 0, 0, pw, ids, P, { head: "logo", foot, note, thumb });
    const pRows = Math.ceil((dry.h + 2) / c);
    if (share) {
      push(1);
      L.patch = r;
      push(pRows + 1);
    } else if (marks) {
      // the counted gameweeks, one stripe each: knitted (two rows of the stripe yarn) or still to
      // come (a one-row tacking line); the patch sits under them, so every stripe shows
      L.slots = [];
      for (let i = 0; i < marks.n; i++) {
        push(i ? 1 : 2);
        L.slots.push(r);
        push(2, i < marks.k - (newMark ? 1 : 0) ? "W" : "");
      }
      push(1);
      L.patch = r;
      push(pRows + 1);
    } else {
      // one stripe per gameweek played (a row of the stripe yarn, a row of ground); the patch is sewn
      // over the season after its first two stripes, so the rest run out from under its edges
      L.season = r;
      const played = p.counted != null ? Math.max(0, Math.min(p.counted, PLAYED)) : PLAYED;
      for (let gw = 1; gw <= played; gw++) {
        push(1);
        push(1, "W");
      }
      L.patch = L.season + 4;
      while (r < L.patch + pRows + 1) push(1);
    }
    L.rows = r;
    const yOf = (row) => FT + row * c;
    const yFab = yOf(L.rows);

    // the stitch grid
    const g = grid(cols, L.rows, "G");
    keys.forEach((k, i) => {
      if (k && g[i]) for (let cc = 0; cc < cols; cc++) g[i][cc] = k;
    });
    // centre on the stitches between the selvedges (or the bound edges)
    const resStart = binding ? 2 : selv ? 1 : 0;
    const resEnd = binding ? 2 : 1;
    const lo = ar ? resEnd : resStart;
    const hi = cols - (ar ? resStart : resEnd);
    const centre = (bmp) => lo + Math.round((hi - lo - bw(bmp)) / 2);
    const dKey = { HOMA: "R", STADE: "L", PRO: "K", CHAMPION: "F", BASE: "Z" }[T];
    const dc = centre(dg);
    if (binding) stamp(g, dg, dc + (ar ? -1 : 1), L.digits + 1, { "#": "D" }); // a one-stitch knitted drop shadow
    stamp(g, dg, dc, L.digits, { "#": dKey });
    // HOMA knits the name and its year in the same relief, so the year never outranks the name
    stamp(
      g,
      nm.bmp,
      centre(nm.bmp),
      L.name,
      homa ? { "#": "R", "*": "R" } : { "#": "N", "*": "Y" },
    );
    stamp(g, tw, centre(tw), L.tier, { "#": homa ? "R" : "T" });
    // selvedges: cream at the inline start, Logo Blue at the inline end (HOMA: blue only)
    const selvedge = (rows) => {
      for (const row of rows) {
        row[at(cols - 1)] = "B";
        if (selv) row[at(0)] = "C";
      }
    };
    selvedge(g);
    const PK = {
      G: P.G,
      L: P.L,
      C: P.C,
      B: P.B,
      N: P.N,
      Y: P.Y,
      R: P.R,
      S: P.S,
      D: P.D,
      K: P.K,
      F: P.F,
      T: P.T,
      Z: P.dash,
      W: homa ? P.R : P.S,
    };

    // defs
    let defs =
      stitchPattern(ids.base, c, { gap: Gg.gap, leg: Gg.leg }) +
      stitchPattern(ids.garter, c, { garter: true, gap: 0.42, leg: 0.3 }) +
      stitchPattern(ids.cast, CAST.c, { gap: 0.18, leg: 0.3, gapC: "#5A4E36" }) +
      steelGrad(ids.rail) +
      `<linearGradient id="${ids.curl}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".32"/><stop offset=".06" stop-color="#000" stop-opacity=".06"/>` +
      `<stop offset=".2" stop-color="#000" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset=".94" stop-color="#000" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".32"/></linearGradient>` +
      `<linearGradient id="${ids.fold}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".24"/><stop offset=".25" stop-color="#fff" stop-opacity=".08"/>` +
      `<stop offset=".55" stop-color="#000" stop-opacity=".26"/><stop offset=".78" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="${ids.shade}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".1"/><stop offset=".12" stop-color="#000" stop-opacity=".34"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></linearGradient>` +
      `<filter id="${ids.soft}" x="-10%" y="-10%" width="120%" height="125%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1.3"/></filter>` +
      `<pattern id="${ids.weave}" width="2" height="2" patternUnits="userSpaceOnUse"><path d="M0 .5H1M1 1.5H2" stroke="#000" stroke-opacity=".13" stroke-width=".6"/><path d="M1.5 0V1M.5 1V2" stroke="#fff" stroke-opacity=".2" stroke-width=".6"/></pattern>` +
      `<pattern id="${ids.weft}" width="3" height="1.1" patternUnits="userSpaceOnUse"><rect width="3" height=".42" fill="${P.patch}" opacity=".46"/></pattern>` +
      hatch(ids.satin, P.Gdk, mix(P.Gdk, "#000000", 0.35), 0.55, 0.3, 58);
    if (binding)
      defs += `<pattern id="${ids.tape}" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="2.2" fill="${P.L}"/><rect width="1" height="2.2" fill="#000" opacity=".12"/></pattern>`;
    if (!thumb)
      defs += `<filter id="${ids.grain}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="${hashStr(SK) % 97}"/><feColorMatrix type="matrix" values="0 0 0 0 .05  0 0 0 0 .05  0 0 0 0 .08  0 0 0 2.2 -1.05"/></filter>`;

    // the front drop's outline: the fold over the tube, straight edges, the cast-on (or cast-off) edge
    const yCast = share ? yFab : yFab + CAST.rows * CAST.c;
    const outline = `M${X0} ${FT + 7}Q${X0} ${FT} ${X0 + 7} ${FT}H${X1 - 7}Q${X1} ${FT} ${X1} ${FT + 7}V${f2(yCast)}H${X0}Z`;
    defs += `<clipPath id="${ids.clip}"><path d="${outline}"/></clipPath>`;

    // fabric
    let fab = `<rect x="${X0}" y="${FT}" width="${FW}" height="${f2(yFab - FT + 0.6)}" fill="${P.G}"/>`;
    // the base scarf's name band: a darker lot of the ground yarn under the name (and, with no name
    // yet, an empty band of plain rib)
    if (bare) {
      const nr = nm.bmp.length + 2;
      let band = "";
      if (beat === "make")
        // row by row, bottom to top; the name's stitches are in the grid above it, never animated
        for (let rr = 0; rr < nr; rr++)
          band += knit(
            beat,
            "band",
            nr - 1 - rr,
            `<rect x="${X0}" y="${f2(yOf(L.nameBand + rr))}" width="${FW}" height="${f2(c + 0.04)}" fill="${P.Q}"/>`,
            Math.min(26, 260 / (nr - 1)),
          );
      else
        band = `<rect x="${X0}" y="${f2(yOf(L.nameBand))}" width="${FW}" height="${f2(nr * c)}" fill="${P.Q}"/>`;
      fab += `<g class="c07v2-nameband">${band}</g>`;
    }
    const sR = L.strip;
    const eR = L.stripEnd;
    if (homa) {
      // the tier strip: a garter-ridge band in the one yarn
      fab += `<rect x="${X0}" y="${f2(yOf(sR))}" width="${FW}" height="${f2((eR - sR) * c)}" fill="url(#${ids.garter})"/>`;
      // single-colour relief: each raised stitch casts a shadow down and to the inline end and
      // catches a light edge up and to the start
      const sx = f2(c * (ar ? -0.2 : 0.2));
      fab += `<g transform="translate(${sx} ${f2(c * 0.26)})" fill="#020a1c" opacity=".55">${keyRects(g, "R", X0, FT, c, c)}</g>`;
      fab += `<g transform="translate(${f2(-sx * 0.7)} ${f2(-c * 0.16)})" fill="#fff" opacity=".3">${keyRects(g, "R", X0, FT, c, c)}</g>`;
    }
    fab += gridRuns(g, PK, X0, FT, c, c, "G");
    // counted gameweeks still to come: a tacking line (three stitches in the stripe yarn, two left)
    if (marks)
      for (let i = marks.k - (newMark ? 1 : 0); i < marks.n; i++) {
        const gt = grid(cols, 1, "G");
        for (let cc = 0; cc < cols; cc++) if (cc % 5 < 3) gt[0][cc] = "W";
        selvedge(gt);
        fab += knit(
          beat,
          "tack",
          marks.n - 1 - i,
          `<g class="c07v2-tack">${gridRuns(gt, PK, X0, yOf(L.slots[i]), c, c, "G")}</g>`,
        );
      }
    // the stripe that has just been counted (beats "first" and "tick"): two rows, lower first, over
    // its tacking line. The number, the name and the serial are all there in the first frame.
    if (newMark) {
      const row0 = L.slots[marks.k - 1];
      for (let q = 0; q < 2; q++) {
        const gb = grid(cols, 1, "W");
        selvedge(gb);
        fab += knit(
          beat,
          "stripe",
          q,
          `<g class="c07v2-bt-stripe">${gridRuns(gb, PK, X0, yOf(row0 + 1 - q), c, c, "G")}</g>`,
        );
      }
    }
    // plain rib: every second stitch column a purl ridge. The number carrier with no rating yet, and
    // an unnamed guest's name band, are rib; the dash is knitted over it in its own yarn.
    const ribBand = (r0, n) => {
      let rb = "";
      for (let cc = lo; cc < hi; cc++)
        rb +=
          cc % 2 === 1
            ? `<rect x="${f2(X0 + cc * c)}" y="${f2(yOf(r0))}" width="${f2(c)}" height="${f2(n * c)}" fill="#000" opacity=".26"/>`
            : `<rect x="${f2(X0 + cc * c)}" y="${f2(yOf(r0))}" width="${f2(c)}" height="${f2(n * c)}" fill="#fff" opacity=".11"/>`;
      return rb;
    };
    if (nil)
      fab +=
        `<g class="c07v2-rib">${ribBand(L.carrier[0], L.carrier[1])}</g>` +
        `<g fill="${PK[dKey]}" class="c07v2-dash">${keyRectsIn(g, dKey, X0, FT, c, c, L.digits, L.digits + 14)}</g>`;
    if (!MC.nameOf(p, o).trim())
      fab += `<g class="c07v2-rib">${ribBand(L.nameBand, nm.bmp.length + 2)}</g>`;
    if (homa) {
      // V stitches everywhere except the garter band, where only the raised word takes them
      fab += `<rect x="${X0}" y="${FT}" width="${FW}" height="${f2(yOf(sR) - FT)}" fill="url(#${ids.base})"/>`;
      fab += `<rect x="${X0}" y="${f2(yOf(eR))}" width="${FW}" height="${f2(yFab - yOf(eR))}" fill="url(#${ids.base})"/>`;
      fab += `<g fill="url(#${ids.base})">${keyRectsIn(g, "R", X0, FT, c, c, sR, eR)}</g>`;
    } else
      fab += `<rect x="${X0}" y="${FT}" width="${FW}" height="${f2(yFab - FT)}" fill="url(#${ids.base})"/>`;
    // the end: the founder's cast-on (card), or a cast-off edge (share: the cast-on is on the back half)
    if (share) fab += castOff(X0, X1, yFab, c, P.Gxd);
    else fab += castOn(p, P, ids, yFab, ar, thumb, 0, beat);
    // shading: edge curl, the fold over the tube, fibre grain
    fab +=
      `<g pointer-events="none"><rect x="${X0}" y="${FT}" width="${FW}" height="${f2(yCast - FT)}" fill="url(#${ids.curl})"/>` +
      `<rect x="${X0}" y="${FT}" width="${FW}" height="36" fill="url(#${ids.fold})"/>` +
      (thumb
        ? ""
        : `<rect x="${X0}" y="${FT}" width="${FW}" height="${f2(yCast - FT)}" filter="url(#${ids.grain})" opacity=".5"/>`) +
      `</g>`;

    // CHAMPION: a woven tape bound over both long edges, a Logo Blue thread down the end-side tape
    let bind = "";
    if (binding) {
      const tw2 = f2(c * 1.5);
      for (const side of [0, 1]) {
        const x = side ? X1 - tw2 : X0;
        const endSide = ar ? side === 0 : side === 1;
        bind += `<rect x="${f2(x - (side ? 0 : 0.6))}" y="${FT + 3}" width="${f2(+tw2 + 0.6)}" height="${f2(yCast - FT - 3)}" fill="url(#${ids.tape})"/>`;
        bind += `<rect x="${f2(x)}" y="${FT + 3}" width="${tw2}" height="${f2(yCast - FT - 3)}" fill="url(#${ids.curl})" opacity=".6"/>`;
        if (endSide)
          bind += `<rect x="${f2(x + tw2 / 2 - 0.9)}" y="${FT + 3}" width="1.8" height="${f2(yCast - FT - 3)}" fill="${BLUE}"/>`;
        const sx = side ? x + 0.8 : x + tw2 - 0.8;
        bind += `<path d="M${f2(sx)} ${FT + 6}V${f2(yCast - 2)}" stroke="${P.Gxd}" stroke-width=".7" stroke-dasharray="2.2 1.6" opacity=".7"/>`;
        bind += `<path d="M${f2(side ? x : x + tw2)} ${FT + 3}V${f2(yCast)}" stroke="#000" stroke-opacity=".28" stroke-width=".8"/>`;
      }
    }

    // the back drop: the other half of the scarf, behind the rail, parallel to the front and in its
    // shadow. It shows beyond the front's inline-start edge, turns over the rail in a fold lip, and
    // ends in a straight cast-off edge (card: above the front's cast-on, so its fringe never adds to
    // the tassel count; share: below the front, carrying the season, the cast-on and the fringe).
    const sg = ar ? 1 : -1; // toward the inline start
    const dx = share ? SHARE_DX : BACK_DX;
    const bx0 = X0 + sg * dx;
    const bx1 = X1 + sg * dx;
    const outerX = ar ? bx1 : bx0;
    const innerX = ar ? X1 : X0; // where the front starts covering it
    const yBackFab = share ? yFab + 3 * c : yFab - 2 * c;
    const yBackEnd = share ? yBackFab + CAST.rows * CAST.c : yBackFab;
    const bOut = ar
      ? `M${f2(bx0)} ${FT}H${f2(bx1 - 7)}Q${f2(bx1)} ${FT} ${f2(bx1)} ${FT + 7}V${f2(yBackEnd)}H${f2(bx0)}Z`
      : `M${f2(bx1)} ${FT}H${f2(bx0 + 7)}Q${f2(bx0)} ${FT} ${f2(bx0)} ${FT + 7}V${f2(yBackEnd)}H${f2(bx1)}Z`;
    let back = `<clipPath id="${ids.bclip}"><path d="${bOut}"/></clipPath><g clip-path="url(#${ids.bclip})">`;
    back += `<rect x="${f2(Math.min(bx0, bx1))}" y="${FT}" width="${FW}" height="${f2(yBackEnd - FT)}" fill="${share ? P.G : P.Gdk}"/>`;
    if (share) {
      // the season on the back half: one two-row stripe per gameweek played, ending above the cast-on
      for (let gw = 0; gw < PLAYED; gw++) {
        const yy = yBackFab - c - (PLAYED - gw) * 4 * c;
        back += `<rect x="${f2(Math.min(bx0, bx1))}" y="${f2(yy)}" width="${FW}" height="${f2(2 * c)}" fill="${homa ? P.R : P.S}"/>`;
      }
      back += `<rect x="${f2(ar ? bx0 : bx1 - c)}" y="${FT}" width="${f2(c)}" height="${f2(yBackFab - FT)}" fill="${BLUE}"/>`;
    }
    if (!thumb)
      back += `<rect x="${f2(Math.min(bx0, bx1))}" y="${FT}" width="${FW}" height="${f2(yBackFab - FT)}" fill="url(#${ids.base})"/>`;
    if (share) back += castOn(p, P, ids, yBackFab, ar, thumb, sg * dx);
    // in shadow under the rail and the front
    back += `<rect x="${f2(Math.min(bx0, bx1))}" y="${FT}" width="${FW}" height="${f2(yBackEnd - FT)}" fill="url(#${ids.shade})" opacity="${share ? 0.45 : 1}"/>`;
    back += `</g>`;
    // the fold lip: the back's top edge turning over the tube, catching the light
    back += `<path d="M${f2(outerX)} ${FT + 9}Q${f2(outerX)} ${FT} ${f2(outerX - sg * 8)} ${FT}H${f2(innerX)}" fill="none" stroke="${P.Glt}" stroke-opacity=".75" stroke-width="1.6" stroke-linecap="round"/>`;
    if (!share && !thumb)
      back += castOff(Math.min(outerX, innerX), Math.max(outerX, innerX), yBackEnd, c, P.Gxd);
    back += `<path d="${bOut}" fill="none" stroke="#000" stroke-opacity=".4" stroke-width=".8"/><path d="${bOut}" fill="none" class="c07v2-rim" stroke-width=".8"/>`;

    // the fringe: the tassel count is the tier
    const n = bare ? 0 : TASSELS[tier];
    const rnd = seeded(hashStr(SK + "fringe" + T));
    const tsw = { HOMA: 22, STADE: 17, PRO: 15, CHAMPION: 13 }[T];
    const fringeLen = { HOMA: 34, STADE: 37, PRO: 39, CHAMPION: 43, BASE: 30 }[T];
    const fx0 = share ? Math.min(bx0, bx1) : X0;
    const fy = share ? yBackEnd : yCast;
    let fringe = "";
    // the tassel count is the tier; the base scarf has loose strands instead, so it counts nothing
    if (bare) fringe = looseFringe(fx0, fx0 + FW, fy - 3, fringeLen, P, rnd);
    for (let i = 0; i < n; i++)
      fringe += tassel(fx0 + (FW * (i + 0.5)) / n, fy - 3, fringeLen + (rnd() * 6 - 3), tsw, P, {
        rnd,
        twisted: binding,
      });
    const H = Math.ceil(fy + fringeLen + 8);

    // the rail (the share draws it wider, between the two halves, so it crosses the whole frame)
    const rx0 = share && o._rail ? o._rail[0] : 1;
    const rw = share && o._rail ? o._rail[1] - o._rail[0] : VW - 2;
    const rail =
      `<rect x="${rx0}" y="${RAIL_Y}" width="${rw}" height="${RAIL_H}" rx="${RAIL_H / 2}" fill="url(#${ids.rail})"/>` +
      `<rect x="${rx0 + 0.5}" y="${RAIL_Y + 0.5}" width="${rw - 1}" height="${RAIL_H - 1}" rx="${RAIL_H / 2 - 0.5}" fill="none" stroke="#4E5661" stroke-width="1"/>` +
      `<path d="M${rx0 + 7} ${RAIL_Y + 3.4}H${rx0 + rw - 7}" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>`;
    const rim = `<path class="c07v2-rim" d="${outline}" fill="none" stroke-width="1"/>`;
    const pt = patch(p, o, px, yOf(L.patch) + 1, pw, ids, P, {
      head: "logo",
      foot,
      note,
      thumb,
    });

    const svg =
      `<svg class="c07v2-svg" viewBox="0 0 ${VW} ${H}" aria-hidden="true" focusable="false" style="direction:ltr">` +
      `<defs>${defs}</defs>` +
      (share ? `<g class="c07v2-fringe">${fringe}</g>` : "") +
      `<g class="c07v2-back">${back}</g>` +
      rail +
      `<g class="c07v2-sway">` +
      (share ? "" : `<g class="c07v2-fringe">${fringe}</g>`) +
      `<g class="c07v2-fabric" clip-path="url(#${ids.clip})">${fab}</g>` +
      bind +
      rim +
      pt.svg +
      `</g>` +
      `</svg>`;
    const cls = `c07v2 c07v2--${T.toLowerCase()}${thumb ? " c07v2--thumb" : ""}${o.motion ? " c07v2--motion" : ""}${beat ? " c07v2--beat-" + beat : ""}${P.wool ? " c07v2--wool" : ""}${share ? " c07v2--share" : ""}`;
    return `<div class="${cls}" dir="${MC.s(o).dir}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="${tier || "none"}" data-art="${f2(Math.min(X0, bx0))} ${f2(Math.max(X1, bx1))}">${svg}</div>`;
  }

  /** The founder's cast-on: five cream rows with 2026 knitted between two cable twists.
      Non-founders cast on plain, in the ground yarn. Digits are never mirrored. `dx` shifts it. */
  function castOn(p, P, ids, y, ar, thumb, dx, beat) {
    const cc = CAST.c;
    const cols = Math.round(FW / cc);
    const h = CAST.rows * cc;
    const founder = !!p.founder;
    const mk = beat === "make" || beat === "founder"; // the rows knit in one at a time: each carries its own texture
    const base = founder ? P.cast : P.G;
    const x0 = X0 + dx;
    const x1 = X1 + dx;
    const yr = founder ? word(String(p.founder), F35, 1) : null;
    const c0 = yr ? Math.round((cols - bw(yr)) / 2) : 0;
    // the stitch texture over the five rows, the cable twists, and the bind-off loops along the edge
    const pat = (y0, hh) =>
      `<rect x="${f2(x0)}" y="${y0}" width="${FW}" height="${hh}" fill="url(#${ids.cast})"/>`;
    let cables = "";
    if (founder && !thumb) {
      const ink = mix(P.cast, "#000000", 0.32);
      const cx = [(x0 + cc + x0 + c0 * cc) / 2, (x0 + (c0 + bw(yr)) * cc + x1 - cc) / 2].map(
        Math.round,
      );
      for (const x of cx) {
        const a = `M${x - 4} ${y}C${x - 4} ${y + 7} ${x + 4} ${y + 10} ${x + 4} ${y + 17.5}C${x + 4} ${y + 25} ${x - 4} ${y + 28} ${x - 4} ${y + 35}`;
        const b = `M${x + 4} ${y}C${x + 4} ${y + 7} ${x - 4} ${y + 10} ${x - 4} ${y + 17.5}C${x - 4} ${y + 25} ${x + 4} ${y + 28} ${x + 4} ${y + 35}`;
        cables += `<rect x="${x - 10}" y="${y}" width="20" height="${h}" fill="${ink}" opacity=".2"/>`;
        cables += `<path d="${b}" stroke="${ink}" stroke-width="7.4" fill="none"/><path d="${b}" stroke="${P.cast}" stroke-width="5.2" fill="none"/>`;
        cables += `<path d="${a}" stroke="${ink}" stroke-width="7.4" fill="none"/><path d="${a}" stroke="${P.cast}" stroke-width="5.2" fill="none"/>`;
        cables += `<path d="${a}" stroke="#fff" stroke-width="1.2" fill="none" opacity=".7" transform="translate(-1 -.6)"/>`;
      }
    }
    let loops = "";
    if (!thumb) {
      let d = "";
      for (let x = x0 + 3.5; x < x1; x += cc)
        d += `M${f2(x - 2.4)} ${f2(y + h - 0.6)}a2.4 1.9 0 0 0 4.8 0`;
      loops = `<path d="${d}" stroke="${founder ? mix(P.cast, "#000000", 0.32) : P.Gdk}" stroke-width="1" fill="none"/>`;
    }
    let s = "";
    for (let r = 0; r < CAST.rows; r++) {
      let row = `<rect x="${f2(x0)}" y="${f2(y + r * cc)}" width="${FW}" height="${cc + (r < CAST.rows - 1 ? 0.6 : 0)}" fill="${base}"/>`;
      if (yr)
        row += `<g fill="${P.castInk}">${bmpRects([yr[r]], x0 + c0 * cc, y + r * cc, cc, cc)}</g>`;
      row += `<rect x="${f2(ar ? x0 : x1 - cc)}" y="${f2(y + r * cc)}" width="${cc}" height="${cc + (r < CAST.rows - 1 ? 0.6 : 0)}" fill="${BLUE}"/>`;
      if (mk) {
        // the foot is knitted first; its row carries the bind-off loops
        row += pat(y + r * cc, cc) + (r === CAST.rows - 1 ? loops : "");
        s += knit(
          beat,
          "cast",
          CAST.rows - 1 - r,
          `<g class="c07v2-co-row" style="--c07v2-i:${r}">${row}</g>`,
        );
      } else s += `<g class="c07v2-co-row" style="--c07v2-i:${r}">${row}</g>`;
    }
    // the cable twists come in once the five rows are knitted
    s += mk
      ? knit(beat, "cast", CAST.rows, `<g class="c07v2-co-after">${cables}</g>`)
      : `<g class="c07v2-co-after">${pat(y, h)}${cables}${loops}</g>`;
    return `<g class="c07v2-cast${founder ? " c07v2-cast--founder" : ""}">${s}</g>`;
  }

  /* ---------- full card: LEGEND, the scarf raised overhead ---------- */
  /** 'Écharpe levée': lifted off the rail and held taut overhead by the supporter, seen from behind
      (the shared avatar, hood up, cropped at the card's foot, its hood seam showing). The arms rise
      in bench-jacket sleeves to two fists wound in the scarf, knuckles showing through the knit (no
      skin tone). The raised span carries the same bands as the hanging scarf: the 84 (13 rows, a
      knitted drop shadow), ALI ·26, and the LEGEND strip. The two ends hang long, outside the fists,
      down to the card's foot: CAP and SEL with the logo on the reading-start end, TRF and CON with
      the ID on the other, then the season's stripes, a cream cast-on (2026) and cast-off, the
      knotted fringe. Portrait, about 1:1.45, the same height budget as the hanging tiers. Drawn in
      LTR units; Arabic mirrors the structure, never the knitted words. */
  const LGC = 8;
  function fullLegend(p, o) {
    const ar = MC.isAr(o);
    const P = palette(p);
    const thumb = !!o.thumb;
    const u = MC.uid(PFX);
    const id = (k) => `${u}-${k}`;
    const ids = {
      base: id("pb"),
      flap: id("pf"),
      cast: id("pc"),
      clip: id("cl"),
      curl: id("cu"),
      soft: id("sf"),
      weave: id("wv"),
      weft: id("wf"),
      satin: id("st"),
      grain: id("gr"),
      sleeve: id("sl"),
      dA: id("da"),
      dB: id("db"),
      arms: id("ar"),
      knit: id("kn"),
      fade: id("fd"),
      mask: id("mk"),
      rail: id("rl"),
    };
    const c = LGC;
    const dg = digitsArt(p.ovr);
    const nm = nameArt(p, o, LEGEND_INNER);
    const tw = tierArt("LEGEND", o);
    const content = Math.max(bw(dg) + 1, bw(nm.bmp), bw(tw));
    // the band's rows (across the scarf): cream selvedge, the 84, the name, the tier strip, Logo Blue selvedge
    const keys = [];
    const R = {};
    const push = (n, k = "") => {
      for (let i = 0; i < n; i++) keys.push(k);
    };
    push(1, "C");
    push(1);
    R.digits = keys.length;
    push(14);
    push(1);
    R.name = keys.length;
    push(nm.bmp.length);
    push(1);
    R.strip = keys.length;
    push(tw.length + 2, "S");
    push(1, "B");
    const nRows = keys.length;
    const BH = nRows * c;
    const BY = 14;
    const mid = BY + BH / 2;
    const top = BY;
    const bot = BY + BH;
    const gather = 18;
    const endW = 90;
    const pad = 6;
    const fa = pad + endW + 4;
    const xs = fa + gather;
    const bandCols = content + 4;
    const xe = xs + bandCols * c;
    const fb = xe + gather;
    const W = fb + 4 + endW + pad;
    // the supporter, from behind: the shared avatar, hood up, the hood about half the span between
    // the fists. The arms are raised straight, about 2.4 hood-heights long, in a V to the fists; the
    // figure stands behind the crowd barrier and fades out under its shoulders (it is cropped there).
    const avS = ((fb - fa) * 0.5) / 96;
    const armLen = 2.4 * 115 * avS;
    const shDx = fa - (W / 2 - 64 * avS);
    const shY = mid + Math.sqrt(Math.max(0, armLen * armLen - shDx * shDx));
    const avY = shY - 184 * avS;
    const avX = W / 2 - 100 * avS;
    const railY = shY + 44 * avS;
    // portrait, about 1:1.45 (taller when a two-line name deepens the band)
    const H = Math.max(Math.round(W * 1.45), Math.round(railY + 72));
    // the grid runs from fist to fist; the words sit on the full-width part
    const cols = Math.round((fb - fa) / c);
    const g = grid(cols, nRows, "G");
    keys.forEach((k, i) => {
      if (k) for (let cc = 0; cc < cols; cc++) g[i][cc] = k;
    });
    const c0 = Math.round((xs - fa) / c);
    const place = (bmp) => c0 + Math.round((bandCols - bw(bmp)) / 2);
    stamp(g, dg, place(dg) + (ar ? -1 : 1), R.digits + 1, { "#": "D" }); // the knitted drop shadow, as at CHAMPION
    stamp(g, dg, place(dg), R.digits, { "#": "F" });
    stamp(g, nm.bmp, place(nm.bmp), R.name, { "#": "N", "*": "Y" });
    stamp(g, tw, place(tw), R.strip + 1, { "#": "T" });
    const PK = { G: P.G, L: P.L, C: P.C, B: P.B, N: P.N, Y: P.Y, S: P.S, D: P.D, F: P.F, T: P.T };

    // the ends: patches, the season, the cream cast-on and cast-off, the fringe
    const pk = 1.3;
    const pw = endW - 12;
    const S = MC.s(o);
    const optA = {
      k: pk,
      head: "logo",
      keys: ["CAP", "SEL"],
      cols: 1,
      foot: [noteOf(p, o)],
      thumb,
      footFs: 4.4,
    };
    const optB = {
      k: pk,
      head: "season",
      keys: ["TRF", "CON"],
      cols: 1,
      foot: [idText(p, o), esc(S.country)],
      thumb,
      footFs: 4.4,
    };
    const ph = Math.max(
      patch(p, o, 0, 0, pw, ids, P, optA).h,
      patch(p, o, 0, 0, pw, ids, P, optB).h,
    );
    const endTop = mid + 20;
    const patchY = mid + 46;
    const LCAST = { c: 5, rows: 5 };
    const fringeLen = 54;
    const yEnd = H - fringeLen - 4;
    const castTop = yEnd - LCAST.rows * LCAST.c;

    let defs =
      stitchPattern(ids.base, c, { gap: 0.48, leg: 0.34, transform: "rotate(-90)" }) +
      stitchPattern(ids.flap, c, { gap: 0.46, leg: 0.32 }) +
      stitchPattern(ids.knit, 6, { gap: 0.4, leg: 0.3 }) +
      stitchPattern(ids.cast, LCAST.c, { gap: 0.18, leg: 0.3, gapC: "#5A4E36" }) +
      `<linearGradient id="${ids.curl}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".08" stop-color="#000" stop-opacity="0"/><stop offset=".88" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".32"/></linearGradient>` +
      `<linearGradient id="${ids.sleeve}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${mix(SLEEVE, "#000000", 0.35)}"/><stop offset=".45" stop-color="${SLEEVE_LT}"/><stop offset="1" stop-color="${mix(SLEEVE, "#000000", 0.45)}"/></linearGradient>` +
      `<filter id="${ids.soft}" x="-10%" y="-10%" width="120%" height="130%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1.5"/></filter>` +
      `<pattern id="${ids.weave}" width="2" height="2" patternUnits="userSpaceOnUse"><path d="M0 .5H1M1 1.5H2" stroke="#000" stroke-opacity=".13" stroke-width=".6"/><path d="M1.5 0V1M.5 1V2" stroke="#fff" stroke-opacity=".2" stroke-width=".6"/></pattern>` +
      `<pattern id="${ids.weft}" width="3" height="1.1" patternUnits="userSpaceOnUse"><rect width="3" height=".42" fill="${P.patch}" opacity=".46"/></pattern>` +
      hatch(ids.satin, P.Gdk, mix(P.Gdk, "#000000", 0.35), 0.55, 0.3, 58) +
      `<clipPath id="${ids.arms}"><rect width="${W}" height="${H}"/></clipPath>`;
    if (!thumb)
      defs += `<filter id="${ids.grain}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="${hashStr(p.serial || "0") % 97}"/><feColorMatrix type="matrix" values="0 0 0 0 .05  0 0 0 0 .05  0 0 0 0 .08  0 0 0 2.2 -1.05"/></filter>`;

    // the band, taut between the fists and gathered into each of them
    const gat = 24;
    const outline =
      `M${fa} ${mid - gat}C${fa + 10} ${mid - gat} ${fa + 12} ${top} ${xs} ${top}` +
      `H${xe}C${fb - 12} ${top} ${fb - 10} ${mid - gat} ${fb} ${mid - gat}` +
      `V${mid + gat}C${fb - 10} ${mid + gat} ${fb - 12} ${bot} ${xe} ${bot}` +
      `H${xs}C${fa + 12} ${bot} ${fa + 10} ${mid + gat} ${fa} ${mid + gat}Z`;
    defs += `<clipPath id="${ids.clip}"><path d="${outline}"/></clipPath>`;
    const len = fb - fa;
    let fab =
      `<rect x="${fa}" y="${BY}" width="${len}" height="${BH}" fill="${P.G}"/>` +
      gridRuns(g, PK, fa, BY, c, c, "G");
    fab += `<rect x="${fa}" y="${BY}" width="${len}" height="${BH}" fill="url(#${ids.base})"/>`;
    fab +=
      `<g pointer-events="none"><rect x="${fa}" y="${BY}" width="${len}" height="${BH}" fill="url(#${ids.curl})"/>` +
      (thumb
        ? ""
        : `<rect x="${fa}" y="${BY}" width="${len}" height="${BH}" filter="url(#${ids.grain})" opacity=".5"/>`) +
      `</g>`;
    let folds = "";
    for (const [f, dir] of [
      [fa, 1],
      [fb, -1],
    ])
      for (const dy of [-1, -0.45, 0.1, 0.65]) {
        const y1 = mid + dy * gat * 0.8;
        const y2 = mid + dy * BH * 0.46;
        folds += `<path d="M${f2(f + dir * 6)} ${f2(y1)}C${f2(f + dir * 14)} ${f2(y1)} ${f2(f + dir * 18)} ${f2(y2)} ${f2(f + dir * (gather + 14))} ${f2(y2)}" stroke="#000" stroke-opacity=".28" stroke-width="1.6" fill="none"/>`;
      }

    // the figure (geometry above)
    const A = MC.AVATAR;
    const figure =
      MC.avatar({
        x: f2(avX),
        y: f2(avY),
        w: f2(200 * avS),
        h: f2(240 * avS),
        hood: true,
        torso: SLEEVE,
        seam: "#7d8796",
        cls: "c07v2-av",
      }) +
      `<svg x="${f2(avX)}" y="${f2(avY)}" width="${f2(200 * avS)}" height="${f2(240 * avS)}" viewBox="${A.viewBox}" aria-hidden="true"><g fill="none" class="c07v2-rim" stroke-width="${f2(1.4 / avS)}"><path d="${A.hood}"/></g></svg>`;
    defs +=
      `<linearGradient id="${ids.fade}" gradientUnits="userSpaceOnUse" x1="0" y1="${f2(shY + 14 * avS)}" x2="0" y2="${f2(railY + 4)}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>` +
      `<mask id="${ids.mask}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#${ids.fade})"/></mask>` +
      steelGrad(ids.rail);
    // the crowd barrier the scarf came off: a top rail at chest height, a lower rail, a few uprights
    const barrier = (() => {
      let b = "";
      const yl = H - 34;
      const inner0 = pad + endW;
      const inner1 = W - pad - endW;
      for (let i = 0; i < 4; i++) {
        const x = inner0 + ((inner1 - inner0) * (i + 0.5)) / 4;
        b += `<rect x="${f2(x - 3)}" y="${f2(railY)}" width="6" height="${f2(yl - railY)}" fill="#3a424d"/><rect x="${f2(x - 3)}" y="${f2(railY)}" width="1.6" height="${f2(yl - railY)}" fill="#fff" opacity=".12"/>`;
      }
      b += `<rect x="0" y="${f2(yl)}" width="${W}" height="9" rx="4.5" fill="url(#${ids.rail})" opacity=".85"/>`;
      b += `<rect x="0" y="${f2(railY - 7)}" width="${W}" height="14" rx="7" fill="url(#${ids.rail})"/><rect x=".5" y="${f2(railY - 6.5)}" width="${W - 1}" height="13" rx="6.5" fill="none" stroke="#4E5661"/>`;
      b += `<path d="M7 ${f2(railY - 3.6)}H${W - 7}" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>`;
      return b;
    })();
    // the arms: bench-jacket sleeves from the shoulders up to the fists
    const shoulder = (side) => ({ x: W / 2 + side * 64 * avS, y: shY });
    const arm = (fx, side) => {
      const sh = shoulder(side);
      const rw = 22 * avS; // half-width at the shoulder
      const fw = 19; // half-width at the wrist
      const d = `M${f2(sh.x - rw)} ${f2(sh.y)}L${f2(fx - fw)} ${f2(mid + 10)}L${f2(fx + fw)} ${f2(mid + 10)}L${f2(sh.x + rw)} ${f2(sh.y)}Z`;
      let a = `<path d="${d}" fill="#020a1c" opacity=".35" filter="url(#${ids.soft})" transform="translate(2 3)"/>`;
      a += `<path d="${d}" fill="url(#${ids.sleeve})"/>`;
      a += `<path d="M${f2(sh.x + side * rw * 0.4)} ${f2(sh.y)}L${f2(fx + side * fw * 0.4)} ${f2(mid + 14)}" stroke="${mix(SLEEVE, "#000000", 0.4)}" stroke-width="1.6"/>`;
      a += `<path d="M${f2(sh.x - side * rw * 0.5)} ${f2(sh.y)}L${f2(fx - side * fw * 0.5)} ${f2(mid + 14)}" stroke="#fff" stroke-opacity=".1" stroke-width="2"/>`;
      // a ribbed cuff in the club colour at the wrist
      a += `<path d="M${f2(fx - fw)} ${f2(mid + 22)}L${f2(fx + fw)} ${f2(mid + 22)}L${f2(fx + fw - 0.6)} ${f2(mid + 34)}L${f2(fx - fw + 0.6)} ${f2(mid + 34)}Z" fill="${P.G}"/>`;
      let rib = "";
      for (let x = fx - fw + 2.5; x < fx + fw - 1; x += 3.2)
        rib += `M${f2(x)} ${f2(mid + 23)}V${f2(mid + 33)}`;
      a += `<path d="${rib}" stroke="#000" stroke-opacity=".28" stroke-width="1"/>`;
      a += `<path d="${d}" fill="none" class="c07v2-rim" stroke-width="1.2"/>`;
      return a;
    };

    // the ends hang outside the fists, in front of the arms, down to the card's foot
    const rnd = seeded(hashStr((p.serial || "0") + "fringe-legend"));
    const startSide = ar ? 1 : -1;
    const drape = (side, kind, clipId) => {
      const f = side < 0 ? fa : fb;
      const xL = side < 0 ? f - 4 - endW : f + 4;
      const xT = xL - side * 6; // the top tucks back under the fist
      const d = `M${f2(xT + 8)} ${endTop}H${f2(xT + endW - 8)}C${f2(xT + endW)} ${endTop + 10} ${f2(xL + endW)} ${endTop + 26} ${f2(xL + endW)} ${endTop + 46}V${yEnd}H${f2(xL)}V${endTop + 46}C${f2(xL)} ${endTop + 26} ${f2(xT)} ${endTop + 10} ${f2(xT + 8)} ${endTop}Z`;
      let s = `<clipPath id="${clipId}"><path d="${d}"/></clipPath>`;
      s += `<path d="${d}" fill="#020a1c" opacity=".4" filter="url(#${ids.soft})" transform="translate(${2 * side} 3)"/>`;
      s += `<g clip-path="url(#${clipId})"><rect x="${f2(xL - 12)}" y="${endTop}" width="${endW + 24}" height="${yEnd - endTop}" fill="${P.G}"/>`;
      // the season down each end: seven stripes between the patch and the cast-on
      const sTop = patchY + ph + 12;
      const pitch = Math.min(12, (castTop - 10 - sTop) / PLAYED);
      if (pitch >= 6)
        for (let i = 0; i < PLAYED; i++)
          s += `<rect x="${f2(xL - 12)}" y="${f2(sTop + i * pitch)}" width="${endW + 24}" height="${f2(pitch / 2)}" fill="${P.S}"/>`;
      if (!thumb)
        s += `<rect x="${f2(xL - 12)}" y="${endTop}" width="${endW + 24}" height="${yEnd - endTop}" fill="url(#${ids.flap})"/>`;
      // the selvedges run down the long edges: cream on the outer edge, Logo Blue on the inner
      const outerX = side < 0 ? xL - 4 : xL + endW - c;
      const innerX = side < 0 ? xL + endW - c : xL - 4;
      s += `<rect x="${f2(outerX)}" y="${endTop}" width="${c + 4}" height="${yEnd - endTop}" fill="${P.C}"/>`;
      s += `<rect x="${f2(innerX)}" y="${endTop}" width="${c + 4}" height="${yEnd - endTop}" fill="${BLUE}"/>`;
      // two stripes under the fist
      for (const yy of [endTop + 10, endTop + 20])
        s += `<rect x="${f2(xL - 12)}" y="${yy}" width="${endW + 24}" height="${c - 3}" fill="${P.S}"/>`;
      // a cream end on both: the founder's cast-on with 2026, and the cast-off on the other end
      const founder = !!p.founder;
      s += `<rect x="${f2(xL - 4)}" y="${castTop}" width="${endW + 8}" height="${LCAST.rows * LCAST.c}" fill="${founder ? P.cast : P.G}"/>`;
      if (founder && kind === "cast") {
        const yr = word(String(p.founder), F35, 1);
        const yx = xL + Math.round((endW - bw(yr) * LCAST.c) / 2);
        s += `<g fill="${P.castInk}">${bmpRects(yr, yx, castTop, LCAST.c, LCAST.c)}</g>`;
      }
      if (!thumb)
        s += `<rect x="${f2(xL - 4)}" y="${castTop}" width="${endW + 8}" height="${LCAST.rows * LCAST.c}" fill="url(#${ids.cast})"/>`;
      s += `<rect x="${f2(xL - 12)}" y="${endTop}" width="${endW + 24}" height="${yEnd - endTop}" fill="url(#${ids.curl})" opacity=".5"/></g>`;
      s += `<path d="${d}" fill="none" stroke="${P.Gdk}" stroke-width="1"/><path d="${d}" fill="none" class="c07v2-rim" stroke-width="1"/>`;
      s += patch(p, o, xL + (endW - pw) / 2, patchY, pw, ids, P, kind === "cast" ? optB : optA).svg;
      let fr = "";
      for (let i = 0; i < TASSELS.LEGEND; i++) {
        const x = xL + (endW * (i + 0.5)) / TASSELS.LEGEND;
        fr += tassel(x, yEnd - 3, fringeLen - 4 - rnd() * 6, 17, P, {
          rnd,
          knotted: true,
          hang: side * 2.5,
        });
      }
      return `<g class="c07v2-fringe">${fr}</g><g class="c07v2-end">${s}</g>`;
    };
    // the fists: the scarf's end wound round each hand, the knuckles a ridge through the knit
    const fist = (cx, dir) => {
      const fw = 52;
      const fh = 60;
      const x = cx - fw / 2;
      const y = mid - fh / 2 - 2;
      const kn = [0, 1, 2, 3].map((i) => x + 9 + i * 11.3);
      const shape =
        `M${x} ${y + 16}` +
        kn.map((kx) => `Q${f2(kx)} ${f2(y - 3)} ${f2(kx + 5.6)} ${f2(y + 4)}`).join("") +
        `Q${x + fw} ${y + 4} ${x + fw} ${y + 18}V${y + fh - 16}Q${x + fw} ${y + fh} ${x + fw - 16} ${y + fh}H${x + 16}Q${x} ${y + fh} ${x} ${y + fh - 16}Z`;
      let s = `<g filter="url(#${ids.soft})" opacity=".45" transform="translate(${dir * 2} 3)"><path d="${shape}" fill="#020a1c"/></g>`;
      s += `<path d="${shape}" fill="${P.G}"/>`;
      if (!thumb) s += `<path d="${shape}" fill="url(#${ids.flap})"/>`;
      // the knuckles catch the light
      s += kn
        .map(
          (kx) =>
            `<path d="M${f2(kx - 2.5)} ${f2(y + 5)}Q${f2(kx + 2)} ${f2(y - 0.5)} ${f2(kx + 6)} ${f2(y + 4)}" stroke="#fff" stroke-opacity=".32" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
        )
        .join("");
      // three turns of the scarf, each edged by a selvedge
      [y + 22, y + 35, y + 48].forEach((yy, i) => {
        const sl = dir * (i - 1) * 2.5;
        s += `<path d="M${x} ${f2(yy + sl)}Q${cx} ${f2(yy - 6)} ${x + fw} ${f2(yy - sl)}" stroke="#000" stroke-opacity=".4" stroke-width="2.2" fill="none"/>`;
        s += `<path d="M${x + 1} ${f2(yy + sl + 2.6)}Q${cx} ${f2(yy - 3.2)} ${x + fw - 1} ${f2(yy - sl + 2.6)}" stroke="${i === 1 ? BLUE : P.C}" stroke-width="2.4" fill="none"/>`;
      });
      s += `<path d="${shape}" fill="none" stroke="${P.Gxd}" stroke-width="1.2"/>`;
      s += `<path d="${shape}" fill="none" class="c07v2-rim" stroke-width="1"/>`;
      return `<g class="c07v2-fist">${s}</g>`;
    };
    const rim = `<path class="c07v2-rim" d="${outline}" fill="none" stroke-width="1.2"/>`;
    const svg =
      `<svg class="c07v2-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false" style="direction:ltr">` +
      `<defs>${defs}</defs>` +
      `<g clip-path="url(#${ids.arms})"><g class="c07v2-arms" mask="url(#${ids.mask})">${arm(fa, -1)}${arm(fb, 1)}${figure}</g>${barrier}</g>` +
      `<g class="c07v2-raise">` +
      `<g class="c07v2-fabric" clip-path="url(#${ids.clip})">${fab}${folds}</g>` +
      rim +
      `</g>` +
      `<g class="c07v2-arms">${drape(startSide, "label", ids.dA)}${drape(-startSide, "cast", ids.dB)}${fist(fa, -1)}${fist(fb, 1)}</g>` +
      `</svg>`;
    const cls = `c07v2 c07v2--legend${thumb ? " c07v2--thumb" : ""}${o.motion ? " c07v2--motion" : ""}${P.wool ? " c07v2--wool" : ""}`;
    return `<div class="${cls}" dir="${MC.s(o).dir}" role="img" aria-label="${esc(MC.label(p, o))}" data-tier="LEGEND" data-art="0 ${W}">${svg}</div>`;
  }

  function full(p, o = {}) {
    return p.tier === "LEGEND" ? fullLegend(p, o) : fullHanging(p, o);
  }

  /* ---------- token (44–80px) and mini (24–32px): whole pixels, no filters ---------- */
  /** A precomputed knit texture: one chevron per stitch, `pc` px wide (the gauge). */
  function chevron(id, pc) {
    const h = Math.max(2, Math.round(pc * 0.9));
    return `<pattern id="${id}" width="${pc}" height="${h}" patternUnits="userSpaceOnUse"><path d="M0 ${f2(h * 0.12)}L${f2(pc / 2)} ${f2(h * 0.78)}L${pc} ${f2(h * 0.12)}" stroke="#000" stroke-opacity=".26" stroke-width="${f2(Math.max(0.5, pc * 0.26))}" fill="none"/><path d="M0 ${f2(h * 0.55)}L${f2(pc / 2)} ${f2(h * 1.2)}" stroke="#fff" stroke-opacity=".1" stroke-width="${f2(Math.max(0.4, pc * 0.18))}" fill="none"/></pattern>`;
  }
  /** Tassels for tokens: a short neck where the strands are gathered, a wrap of the second yarn round
      the head, then two (minis) or three strands hanging and fanning a little to uneven tips. n of
      them hang from y. Whole-pixel tops, plain paths, no filters. */
  function tokTassels(n, x0, x1, y, len, w, P, splay, mini) {
    let s = "";
    const k = mini ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const x = Math.round(n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1));
      const sp = (i - (n - 1) / 2) * splay;
      const neck = Math.max(1, Math.round(len * 0.16));
      const wrap = Math.max(1, Math.round(len * 0.14));
      const ys = y + neck + wrap; // where the strands fall from
      s += `<rect x="${f2(x - w * 0.35)}" y="${y}" width="${f2(w * 0.7)}" height="${neck + 0.5}" fill="${P.G}" class="c07v2-tk-tassel"/>`;
      const sw = Math.max(0.75, (w * 0.95) / k);
      for (let j = 0; j < k; j++) {
        const t = k === 1 ? 0 : (j / (k - 1)) * 2 - 1; // -1 … 1
        const xb = x + t * (w / 2 - sw / 2);
        const xt = x + sp + t * (w / 2 + w * 0.12);
        const yt = y + len - (j % 2 ? 0 : Math.max(1, Math.round(len * 0.1)));
        s += `<path d="M${f2(xb - sw / 2)} ${ys - 0.5}H${f2(xb + sw / 2)}L${f2(xt + sw * 0.35)} ${f2(yt)}H${f2(xt - sw * 0.35)}Z" fill="${P.G}" class="c07v2-tk-tassel"/>`;
      }
      // the wrap round the head, in the second yarn
      s += `<rect x="${f2(x - w * 0.5)}" y="${y + neck}" width="${f2(w)}" height="${wrap}" rx="${f2(Math.min(wrap, w) * 0.3)}" fill="${P.S}" class="c07v2-tk-wrap"/>`;
    }
    return s;
  }
  // the 84 at each token size: [from size, chart, cell px, gap stitches]
  const TOK = [
    [80, D913, 2, 2],
    [64, F710, 2, 1],
    [56, F69, 2, 1],
    [44, D913, 1, 2],
    [32, F710, 1, 1],
    [28, F69, 1, 1],
    [0, F57, 1, 1],
  ];
  /** The dash for a token's number carrier: as tall as the 84 would be there, the dash itself two
      stitches thick (three at 13 rows, the 84's stem weight) and about 60% of the 84's width. */
  function dashFor(ref) {
    const h = ref.length;
    const w = bw(ref);
    const t = h >= 13 ? 3 : 2;
    const dw = Math.max(5, Math.round(w * 0.6));
    const left = Math.floor((w - dw) / 2);
    const top = Math.floor((h - t) / 2);
    return Array.from(
      { length: h },
      (_, r) =>
        ".".repeat(left) +
        (r >= top && r < top + t ? "#" : ".").repeat(dw) +
        ".".repeat(w - left - dw),
    );
  }
  /** The 84 for a token at size s, on whole pixels; steps down while `ok(F)` fails. With no rating
      yet the figure is the dash, in the 84's box. */
  function tokenFigures(p, s, ok) {
    let i = TOK.findIndex(([min]) => s >= min);
    let F = null;
    for (; i < TOK.length; i++) {
      const [, chart, k, gap] = TOK[i];
      const nil = p.ovr == null;
      const bmp = nil ? dashFor(word("84", chart, gap)) : word(String(p.ovr), chart, gap);
      F = { bmp, k, w: bw(bmp) * k, h: bmp.length * k, nil };
      if (!ok || ok(F)) break;
    }
    return F;
  }
  /** The base scarf's fringe on a token: no tassels (their count is the tier), a close comb of loose
      strands along the foot of the drop, whole pixels. */
  function tokFringe(x0, x1, y, len, P, mini) {
    const w = mini ? 1 : x1 - x0 >= 40 ? 2 : 1;
    const step = w + 1;
    let s = "";
    for (let x = x0, i = 0; x + w <= x1; x += step, i++) {
      const l = len - (i % 3 === 1 ? Math.max(1, Math.round(len * 0.14)) : i % 3 === 2 ? 1 : 0);
      s += `<rect x="${x}" y="${y}" width="${w}" height="${l}" fill="${P.G}" class="c07v2-tk-tassel"/>`;
    }
    return s;
  }
  /** Plain rib on a token, in whole pixels: every second column of `cell` px a darker ridge. */
  function tokRib(x, y, w, h, cell) {
    let s = "";
    for (let i = 1; x + i * cell < x + w; i += 2) {
      const cw = Math.min(cell, w - i * cell);
      s += `<rect x="${x + i * cell}" y="${y}" width="${cw}" height="${h}" fill="#000" opacity=".26"/>`;
    }
    return s;
  }
  function token(p, o = {}) {
    const s = Math.max(20, Math.round(o.size || 44));
    const mini = !!o.mini || s <= 32;
    const tier = p.tier || null; // null: the base scarf, before any rating
    const ar = MC.isAr(o);
    const S = MC.s(o);
    const T = MC.onbStr(o);
    const P = palette(p);
    const beat = BEATS[o.beat] ? o.beat : "";
    const yr = p.founder ? ` ·${String(p.founder).slice(-2)}` : "";
    // what a screen reader hears: the name (or the unnamed card), the rating (or none yet, and how
    // many gameweeks are counted), the tier when there is one, the founder year when there is one
    const label = [
      `${p.name ? MC.nameOf(p, o) : T.cardOf}${yr}`,
      p.ovr == null
        ? T.noRating + (p.minRated ? ", " + T.counted(p.counted || 0, p.minRated) : "")
        : `${p.ovr} ${S.ovr}`,
      ...(tier ? [S.tiers[tier]] : []),
      ...(p.founder ? [S.founderLine] : []),
    ].join(", ");
    const u = MC.uid(PFX + "t");
    const b =
      tier === "LEGEND"
        ? tokenLegend(p, P, s, mini, u, ar)
        : tokenHanging(p, P, tier, s, mini, u, ar, beat);
    // the art is drawn left to right and mirrored for Arabic; figures are placed on top, never mirrored
    const mx = (x, w) => (ar ? b.w - x - w : x);
    let figs = `<g transform="translate(${mx(b.dx, b.dw)} ${b.dy})">${b.figs}</g>`;
    if (b.year)
      figs += `<g fill="${b.year.fill}" transform="translate(${mx(b.year.x, b.year.w)} ${b.year.y})" shape-rendering="crispEdges">${bmpRects(b.year.bmp, 0, 0, 1, 1)}</g>`;
    const art = ar ? `<g transform="matrix(-1 0 0 1 ${b.w} 0)">${b.art}</g>` : b.art;
    const clip = `<clipPath id="${u}-cl"><rect width="${b.w}" height="${s}"/></clipPath>`;
    return (
      `<span class="c07v2-tk c07v2-tk--${(tier || "base").toLowerCase()}${mini ? " c07v2-tk--mini" : ""}${P.wool ? " c07v2-tk--wool" : ""}" role="img" aria-label="${esc(label)}" style="width:${b.w}px;height:${s}px">` +
      `<svg width="${b.w}" height="${s}" viewBox="0 0 ${b.w} ${s}" aria-hidden="true" focusable="false"><defs>${b.defs}${clip}</defs><g clip-path="url(#${u}-cl)">${art}${figs}</g></svg></span>`
    );
  }
  function tokenHanging(p, P, tier, s, mini, u, ar, beat = "") {
    const bare = !tier; // the base scarf: no panel, no binding, no tier tassels
    const ry = mini ? 1 : Math.max(2, Math.round(s * 0.05));
    const t = mini ? 2 : Math.max(3, Math.round(s * 0.07));
    const railB = ry + t;
    const top = railB + 1;
    const fb = p.founder ? Math.max(3, Math.round(s * 0.08)) : 0; // the founder's cast-on stripe
    const pro = tier === "PRO"; // PRO's cream panel, at every size (one polarity)
    const champ = tier === "CHAMPION";
    const tl0 = mini ? (s >= 32 ? 9 : s >= 28 ? 8 : 7) : Math.round(s * 0.26);
    let tl = tl0;
    const tlMin = mini ? 5 : Math.round(s * 0.2);
    // the room the figures need: the chart, a stitch of shadow room, the panel's margin
    const need = (F) => F.h + (mini ? 0 : F.k) + 2 * (mini ? 1 : F.k);
    // the counted gameweeks, one stripe each under the number carrier while there is no rating:
    // a one-pixel gap and a stripe of two pixels (one on a mini). They drop if they do not fit.
    const marks = p.ovr == null ? marksOf(p) : null;
    const ts = mini ? 1 : 2;
    const mh = marks ? marks.n * (ts + 1) : 0;
    let F = tokenFigures(p, s, null);
    const place = (withMarks) => {
      const extra = withMarks ? mh : 0;
      while (s - tl - fb - 1 - top < need(F) + extra && tl > tlMin) tl--;
      if (s - tl - fb - 1 - top < need(F) + extra)
        F = tokenFigures(p, s, (G) => s - tl - fb - 1 - top >= need(G) + extra);
      return s - tl - fb - 1 - top >= need(F) + extra;
    };
    let marksOn = !!marks;
    if (marksOn && !place(true)) {
      marksOn = false;
      tl = tl0;
      F = tokenFigures(p, s, null);
    }
    if (!marksOn) place(false);
    const k = F.k;
    const sb = s - tl; // the drop's foot
    const bottom = sb - fb - 1;
    // one width per size, whatever the tier: the figures, their margin, the selvedge, the bound edges
    const blue = mini ? 1 : Math.max(1, Math.round(s * 0.03));
    const bind = mini ? 1 : Math.max(1, Math.round(s * 0.035));
    const m = mini ? 1 : k + 1;
    const sh = mini ? 0 : k;
    const sw = F.w + 2 * m + blue + 2 * bind + sh;
    const oh = mini ? 3 : Math.max(4, Math.round(s * 0.1));
    const sx = oh;
    const W = sx + sw + oh;
    const n = bare ? 0 : TASSELS[tier];
    const pc = {
      HOMA: mini ? 2 : s >= 64 ? 4 : 3,
      STADE: mini ? 2 : 3,
      PRO: 2,
      CHAMPION: 2,
      BASE: 2,
    }[tier || "BASE"];
    const defs = chevron(u + "-cv", pc);
    const tw = mini ? 2 : Math.max(3, Math.round(s * 0.085));
    const splay = mini ? 0.45 : s * 0.014;
    const pm = mini ? 1 : k; // the carrier's margin round the figure
    const fy = marksOn
      ? top + Math.round((bottom - top - need(F) - mh) / 2) + pm
      : top + Math.round((bottom - top - F.h - sh) / 2);
    let a = "";
    // the rail, rounded at both ends
    a += `<rect x="0" y="${ry}" width="${W}" height="${t}" rx="${f2(t / 2)}" fill="#A9B2BE"/><rect x="${f2(t / 3)}" y="${ry}" width="${f2(W - (2 * t) / 3)}" height="${f2(t * 0.4)}" rx="${f2(t * 0.2)}" fill="#E6EBF0"/><rect x="${f2(t / 2)}" y="${f2(ry + t - 1)}" width="${f2(W - t)}" height="1" fill="#4E5661"/>`;
    // the drop, turned over the tube
    const y0 = Math.max(0, ry - (mini ? 1 : 2));
    a += `<rect x="${sx}" y="${y0}" width="${sw}" height="${sb - y0}" fill="${P.G}" class="c07v2-tk-sw"/>`;
    if (pro) {
      a += `<rect x="${sx + bind}" y="${fy - pm}" width="${sw - blue - 2 * bind}" height="${F.h + sh + 2 * pm}" fill="${P.C}"/>`;
    }
    a += `<rect x="${sx}" y="${y0}" width="${sw}" height="${sb - y0}" fill="url(#${u}-cv)"/>`;
    a += `<rect x="${sx}" y="${y0}" width="${sw}" height="${Math.max(1, ry + Math.round(t / 2) - y0)}" fill="#fff" opacity=".16"/><rect x="${sx}" y="${railB}" width="${sw}" height="${mini ? 1 : Math.max(1, Math.round(t * 0.45))}" fill="#000" opacity=".24"/>`;
    // the Logo Blue selvedge at the end; CHAMPION's bound edges in the second yarn
    a += `<rect x="${sx + sw - blue - bind}" y="${y0}" width="${blue}" height="${sb - y0}" fill="${BLUE}"/>`;
    if (champ)
      a += `<rect x="${sx}" y="${y0}" width="${bind}" height="${sb - y0}" fill="${P.S}"/><rect x="${sx + sw - bind}" y="${y0}" width="${bind}" height="${sb - y0}" fill="${P.S}"/>`;
    // no rating yet: the number carrier is plain rib (the dash is placed over it, below)
    const inX = sx + bind; // the knitted width between the selvedge and the bound edge
    const inW = sw - blue - 2 * bind;
    if (F.nil)
      a += `<g class="c07v2-tk-rib">${tokRib(inX, fy - pm, inW, F.h + sh + 2 * pm, k)}</g>`;
    // the counted gameweeks: a knitted stripe in the stripe yarn, or a tacking line (dashes, one pixel
    // high on a token under 64px) for a gameweek still to come
    if (marksOn) {
      const my = fy + F.h + sh + pm;
      const dash = s >= 64 ? 3 : mini ? 1 : 2; // a tacking dash and the gap after it, in pixels
      const newMark = marks.k > 0 && (beat === "tick" || beat === "first");
      for (let i = 0; i < marks.n; i++) {
        const yy = my + i * (ts + 1) + 1;
        if (i < marks.k - (newMark ? 1 : 0)) {
          a += `<rect x="${inX}" y="${yy}" width="${inW}" height="${ts}" fill="${P.S}" class="c07v2-tk-stripe"/>`;
          continue;
        }
        let d = "";
        for (let x = inX; x < inX + inW; x += 2 * dash)
          d += `<rect x="${x}" y="${yy}" width="${Math.min(dash, inX + inW - x)}" height="${s >= 64 ? ts : 1}" fill="${P.S}"/>`;
        a += knit(beat, "tack", marks.n - 1 - i, `<g class="c07v2-tk-tack">${d}</g>`);
        if (newMark && i === marks.k - 1)
          a += knit(
            beat,
            "stripe",
            0,
            `<rect x="${inX}" y="${yy}" width="${inW}" height="${ts}" fill="${P.S}" class="c07v2-tk-stripe"/>`,
          );
      }
    }
    // the founder's cast-on: a cream band at the foot (2026 knitted into it at 80px)
    let year = null;
    if (fb) {
      a += `<rect x="${sx}" y="${sb - fb}" width="${sw}" height="${fb}" fill="${P.cast}" class="c07v2-tk-cast"/>`;
      if (s >= 80 && fb >= 5) {
        const yb = word(String(p.founder), F35, 1);
        year = {
          bmp: yb,
          w: bw(yb),
          x: sx + Math.round((sw - bw(yb)) / 2),
          y: sb - fb + Math.floor((fb - 5) / 2),
          fill: P.castInk,
        };
      }
    }
    // the fringe: the tassel count is the tier; the base scarf has a comb of loose strands instead
    const tm = Math.max(tw, Math.round(sw * 0.16));
    a = bare
      ? a + tokFringe(sx + bind, sx + sw - bind, sb, tl, P, mini)
      : a + tokTassels(n, sx + tm, sx + sw - tm, sb, tl, tw, P, splay, mini);
    // the figures (placed by the caller, never mirrored); CHAMPION's carry a knitted drop shadow
    const fx = sx + bind + m + (sh && ar ? k : 0) + (pro || champ ? 0 : 0);
    const key = { HOMA: mini ? P.R2 : P.R2, STADE: P.L, PRO: P.K, CHAMPION: P.F, BASE: P.dash }[
      tier || "BASE"
    ];
    let figs = "";
    if (champ && sh)
      figs += `<g fill="${P.D}" transform="translate(${ar ? -k : k} ${k})">${bmpRects(F.bmp, 0, 0, k, k)}</g>`;
    figs += `<g fill="${key}">${bmpRects(F.bmp, 0, 0, k, k)}</g>`;
    return {
      w: W,
      h: s,
      art: a,
      defs,
      figs: `<g shape-rendering="crispEdges">${figs}</g>`,
      dx: fx,
      dy: fy,
      dw: F.w,
      year,
    };
  }
  /** LEGEND: the band held overhead by the supporter. The shared avatar's hooded head sits between
      the forearms under the band (cropped at the shoulders), the fists carry a knuckle bump, and
      each end hangs outside its fist with a cream cast-on (≥3px) and a tassel. */
  function tokenLegend(p, P, s, mini, u, ar) {
    const F = tokenFigures(p, s, (G) => G.h <= (mini ? 9 : Math.round(s * 0.36)));
    const k = F.k;
    const sel = mini ? 1 : Math.max(1, Math.round(s * 0.03));
    const m = mini ? 1 : k + 1;
    const sh = mini ? 0 : k;
    const bh = F.h + 2 * m + 2 * sel + sh;
    const by = mini ? 1 : Math.max(2, Math.round(s * 0.04));
    const bwid = F.w + 2 * (m + 1) + sh;
    const fw = mini ? 4 : Math.max(6, Math.round(s * 0.12));
    const fh = Math.round(bh * 0.8);
    const ew = mini ? 3 : Math.max(4, Math.round(s * 0.08));
    const x0 = Math.ceil(fw / 2) + ew;
    const W = 2 * x0 + bwid;
    const fy = by + Math.round((bh - fh) / 2);
    const tl = mini ? 5 : Math.round(s * 0.18);
    const defs = chevron(u + "-cv", 2);
    let a = "";
    // the supporter: the shared avatar, hood up, its head between the forearms, cropped at the shoulders
    const avS = (bwid * 0.4) / 96;
    const hoodTop = by + bh + (mini ? 1 : 2);
    const avY = hoodTop - 58 * avS;
    const avX = W / 2 - 100 * avS;
    const shY = Math.min(s + 1, avY + 186 * avS);
    // the forearms: from each fist down to the shoulders
    const aw = mini ? 3 : Math.max(4, Math.round(s * 0.1));
    for (const [cx, dir] of [
      [x0, -1],
      [x0 + bwid, 1],
    ]) {
      const shx = W / 2 + dir * 62 * avS;
      a += `<path d="M${f2(cx - aw / 2)} ${fy + fh - 1}H${f2(cx + aw / 2)}L${f2(shx + aw * 0.75)} ${f2(shY)}H${f2(shx - aw * 0.75)}Z" fill="${SLEEVE_LT}" class="c07v2-tk-arm"/>`;
    }
    a += MC.avatar({
      x: f2(avX),
      y: f2(avY),
      w: f2(200 * avS),
      h: f2(240 * avS),
      hood: true,
      torso: SLEEVE_LT,
      seam: "#8a94a3",
      cls: "c07v2-tk-av",
    });
    // the ends hanging outside the fists, each with a cream cast-on and a tassel
    for (const [cx, dir] of [
      [x0, -1],
      [x0 + bwid, 1],
    ]) {
      const ex = dir < 0 ? cx - Math.ceil(fw / 2) - ew + 1 : cx + Math.ceil(fw / 2) - 1;
      const eTop = fy + 1;
      const eh = s - tl - eTop;
      a += `<rect x="${ex}" y="${eTop}" width="${ew}" height="${eh}" fill="${P.G}" class="c07v2-tk-sw"/>`;
      const cb = Math.max(3, Math.round(s * 0.08));
      a += `<rect x="${ex}" y="${eTop + eh - cb}" width="${ew}" height="${cb}" fill="${p.founder ? P.cast : P.G}" class="${p.founder ? "c07v2-tk-cast" : ""}"/>`;
      a += tokTassels(1, ex + ew / 2, ex + ew / 2, eTop + eh, tl, Math.max(2, ew - 1), P, 0, mini);
    }
    // the raised band
    a += `<rect x="${x0}" y="${by}" width="${bwid}" height="${bh}" fill="${P.G}" class="c07v2-tk-sw"/>`;
    a += `<rect x="${x0}" y="${by}" width="${bwid}" height="${bh}" fill="url(#${u}-cv)"/>`;
    a += `<rect x="${x0}" y="${by}" width="${bwid}" height="${sel}" fill="${P.C}"/><rect x="${x0}" y="${by + bh - sel}" width="${bwid}" height="${sel}" fill="${BLUE}"/>`;
    // the fists: rounded bundles of the scarf with a ridge of knuckles on top (no cream dash)
    for (const cx of [x0, x0 + bwid]) {
      const fx = cx - fw / 2;
      const nk = mini ? 1 : 3;
      const kr = Math.max(0.8, fw / (2 * nk));
      let top = `M${f2(fx)} ${f2(fy + kr + 1)}`;
      for (let i = 0; i < nk; i++)
        top += `A${f2(kr)} ${f2(kr)} 0 0 1 ${f2(fx + (fw * (i + 1)) / nk)} ${f2(fy + kr + 1)}`;
      a += `<path d="${top}V${fy + fh - 2}Q${f2(fx + fw)} ${fy + fh} ${f2(fx + fw - 2)} ${fy + fh}H${f2(fx + 2)}Q${f2(fx)} ${fy + fh} ${f2(fx)} ${fy + fh - 2}Z" fill="${P.G}" stroke="${P.Gxd}" stroke-width="${mini ? 0.6 : 1}" class="c07v2-tk-fist"/>`;
    }
    const dy = by + sel + m;
    const dx = x0 + Math.round((bwid - F.w - sh) / 2) + (ar && sh ? k : 0);
    const figs = `<g shape-rendering="crispEdges">${sh ? `<g fill="${P.D}" transform="translate(${ar ? -k : k} ${k})">${bmpRects(F.bmp, 0, 0, k, k)}</g>` : ""}<g fill="${P.F}">${bmpRects(F.bmp, 0, 0, k, k)}</g></g>`;
    return { w: W, h: s, art: a, defs, figs, dx, dy, dw: F.w };
  }

  /* ---------- row: the "My position" card, your scarf on a stretch of barrier ---------- */
  function row(p, o = {}) {
    const S = MC.s(o);
    const T = MC.onbStr(o);
    const ar = MC.isAr(o);
    const tier = p.tier || null;
    const tk = token(p, { ...o, size: 56, mini: false });
    const yr = p.founder ? String(p.founder).slice(-2) : "";
    // the supporter year: a thin space, a heavy centred dot, the year at 75%
    const year = yr
      ? ar
        ? `<bdi dir="ltr" class="c07v2-row-yr">${yr}<i class="c07v2-row-dot" aria-hidden="true"></i></bdi>`
        : `<span class="c07v2-row-yr"><i class="c07v2-row-dot" aria-hidden="true"></i>${yr}</span>`
      : "";
    // a guest before naming: the name carrier is a short empty band of plain rib, never a word
    const name = p.name
      ? `${esc(MC.nameOf(p, o))}${year}`
      : `<i class="c07v2-row-nm0" aria-hidden="true"></i>`;
    // no rating yet: « en formation k/N » stands where the tier and the number would be (the dash is
    // in the token's number carrier)
    const line =
      p.ovr == null
        ? (tier ? `${esc(S.tiers[tier])} · ` : "") +
          (p.minRated ? `${esc(T.forming)} ${MC.ltr((p.counted || 0) + "/" + p.minRated)}` : T.dash)
        : `${esc(S.tiers[tier])} · ${MC.ltr(p.ovr + " " + S.ovr)}`;
    return (
      `<div class="c07v2-row c07v2-row--${(tier || "base").toLowerCase()}${o.me ? " is-me" : ""}" dir="${S.dir}">` +
      `<span class="c07v2-row-rail" aria-hidden="true"></span>` +
      `<span class="c07v2-row-rank">${MC.ltr(o.rank)}</span>` +
      `<span class="c07v2-row-token">${tk}</span>` +
      `<span class="c07v2-row-name"><b>${name}</b><small>${line}</small></span>` +
      `<span class="c07v2-row-pts">${MC.ltr(o.pts)}<small>${esc(S.pts)}</small></span>` +
      `</div>`
    );
  }

  /* ---------- share: "Sur la barrière", both halves of the scarf over the rail at night ---------- */
  function share(p, o = {}) {
    const S = MC.s(o);
    const ar = MC.isAr(o);
    const u = MC.uid(PFX + "s");
    const legend = p.tier === "LEGEND";
    const card = full(p, { ...o, motion: false, beat: "", thumb: false, _share: true });
    const vb = (card.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/) || [0, VW, 600]).map(
      Number,
    );
    const art = ((card.match(/data-art="([^"]+)"/) || [0, `0 ${vb[1]}`])[1] || "")
      .split(" ")
      .map(Number);
    const M = 24; // the safe margin round the whole scarf
    const railY = 115;
    let k;
    let left;
    let top;
    if (legend) {
      const avail = 640 - M - (railY - 6);
      k = Math.min((360 - 2 * M) / vb[1], avail / vb[2]);
      left = (360 - vb[1] * k) / 2;
      top = railY - 6;
    } else {
      // both halves inside the margin, from the rail to the fringe's tips
      const railC = RAIL_Y + RAIL_H / 2;
      const artW = art[1] - art[0];
      k = Math.min((360 - 2 * M) / artW, (640 - M - railY) / (vb[2] - railC));
      left = (360 - artW * k) / 2 - art[0] * k;
      top = railY - railC * k;
    }
    const sw = vb[1] * k;
    // the top rail crosses the whole frame, drawn between the two halves
    const cardHTML = legend
      ? card
      : full(p, {
          ...o,
          motion: false,
          beat: "",
          thumb: false,
          _share: true,
          _rail: [f2(-left / k), f2((360 - left) / k)],
        });
    const postX = ar ? M + 6 : 360 - M - 14;
    const bg =
      `<svg class="c07v2-sh-bg" viewBox="0 0 360 640" preserveAspectRatio="none" aria-hidden="true">` +
      `<defs>` +
      `<linearGradient id="${u}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05080F"/><stop offset=".45" stop-color="#0A1220"/><stop offset="1" stop-color="#04070D"/></linearGradient>` +
      `<radialGradient id="${u}-fl" cx="${ar ? 0.15 : 0.85}" cy=".04" r=".8"><stop offset="0" stop-color="#EAF2FF" stop-opacity=".42"/><stop offset=".22" stop-color="#9DB8E6" stop-opacity=".14"/><stop offset=".6" stop-color="#2A3F66" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="${u}-pitch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E2416" stop-opacity="0"/><stop offset=".25" stop-color="#173A22"/><stop offset=".7" stop-color="#1F4A2B"/><stop offset="1" stop-color="#0B1A10"/></linearGradient>` +
      `<filter id="${u}-bl" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="9"/></filter>` +
      steelGrad(u + "-st") +
      `<linearGradient id="${u}-post" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4E5661"/><stop offset=".4" stop-color="#C6CDD6"/><stop offset="1" stop-color="#5E6876"/></linearGradient>` +
      `</defs>` +
      `<rect width="360" height="640" fill="url(#${u}-sky)"/>` +
      // the pitch beyond, out of focus (no stands, no steps)
      `<g filter="url(#${u}-bl)" opacity=".9"><rect x="-20" y="330" width="400" height="330" fill="url(#${u}-pitch)"/>` +
      `<path d="M-20 400H380M-20 480H380M-20 566H380" stroke="#2C6239" stroke-width="24" opacity=".45"/><path d="M-20 350H380" stroke="#DDE8DF" stroke-width="3" opacity=".5"/></g>` +
      `<rect width="360" height="640" fill="url(#${u}-fl)"/>` +
      // the crowd barrier: an upright and a lower rail behind the scarf (the top rail is drawn with the scarf)
      (legend
        ? `<rect x="-8" y="${railY + 360}" width="376" height="10" rx="5" fill="url(#${u}-st)" opacity=".55"/>`
        : `<rect x="${postX}" y="${railY}" width="8" height="${300}" fill="url(#${u}-post)"/>` +
          `<rect x="0" y="${railY + 296}" width="360" height="9" rx="4.5" fill="url(#${u}-st)" opacity=".7"/>`) +
      `</svg>`;
    const logo = MC.logo("wordmark", { variant: "light", w: "100%" });
    const cap = ar ? ["موسمي،", "صفًّا بعد صف"] : ["Ma saison,", "rang par rang"];
    // a provisional rating says so on the image itself: a small sewn-on label, text, never colour alone
    const provWord = ar ? "مبدئي" : "Provisoire";
    const prov = p.provisional ? `<p class="c07v2-sh-prov"><span>${esc(provWord)}</span></p>` : "";
    return (
      `<div class="c07v2-share${legend ? " c07v2-share--legend" : ""}" dir="${S.dir}" role="img" aria-label="${esc(MC.label(p, o) + (p.provisional ? ", " + provWord : ""))}">` +
      bg +
      `<div class="c07v2-sh-logo">${logo}</div>` +
      `<p class="c07v2-sh-cap">${cap.map((l) => `<span>${esc(l)}</span>`).join("")}</p>` +
      `<p class="c07v2-sh-sub"><span dir="ltr">@ali</span> · ${ar ? "مثال" : "Exemple"}</p>` +
      prov +
      `<div class="c07v2-sh-scarf" style="top:${f2(top)}px;left:${f2(left)}px;width:${f2(sw)}px">${cardHTML}</div>` +
      `</div>`
    );
  }

  /* ---------- the sway: drag the scarf and it swings from the rail ---------- */
  function mount(el) {
    if (!el || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches))
      return;
    const g = el.querySelector(".c07v2-sway");
    if (!g) return;
    let a = 0;
    let v = 0;
    let lastX = null;
    let raf = 0;
    const step = () => {
      v += -a * 0.06;
      v *= 0.9;
      a += v;
      g.setAttribute("transform", `rotate(${f2(a)} ${VW / 2} ${RAIL_Y + RAIL_H / 2})`);
      if (Math.abs(a) > 0.02 || Math.abs(v) > 0.02) raf = requestAnimationFrame(step);
      else {
        g.removeAttribute("transform");
        raf = 0;
      }
    };
    el.addEventListener("pointermove", (e) => {
      if (lastX !== null) v += Math.max(-0.5, Math.min(0.5, (e.clientX - lastX) * -0.02));
      lastX = e.clientX;
      if (!raf) raf = requestAnimationFrame(step);
    });
    el.addEventListener("pointerleave", () => (lastX = null));
  }

  const c = {
    id: "c07-v2",
    n: 7,
    slug: "07",
    refinedFrom: "c07",
    name: "Écharpe",
    nameAr: "الوشاح",
    category: "youth",
    philosophy:
      "Your card is your supporter's scarf, folded over the barrier rail in your club's colours: the 84 knitted big, then ALI ·26, then a narrow tier strip over the season's stripes, so the eye steps down the scarf the way it reads a terrace.",
    philosophyAr:
      "بطاقتك وشاحُ المشجّع مطويًّا على حاجز المدرّج بألوان ناديك: الرقم 84 محبوكًا كبيرًا، ثم «علي 26·»، ثم شريط الرتبة فوق خطوط الموسم، فتنزل العين على الوشاح كما تقرأ المدرّج.",
    idea: [
      "The card is a knitted supporter scarf folded over a steel crowd-barrier rail. By default (grids, the detail sheet, the tier strip) the front drop shows a face of about 1:1.5 (PRO, Latin), and the other half of the scarf hangs behind the rail, parallel and in shadow. It shows as a darker strip along the inline-start edge, turns over the rail in a lit fold lip, and ends in a straight cast-off edge above the front's cast-on, so its fringe never adds to the tassel count. The silhouette is the rail overhanging both sides, two layers of drape, and the fringe.",
      "It reads from the rail down, each element on its own band: the 84 (13 rows), then ALI ·26 (8 rows, about 62% of the 84), then a narrow tier strip (a 4-row word, about 31%; the strip is about 40% of the 84's band), then the season, one stripe per gameweek played, with the woven patch sewn over it after the second stripe so the rest run out from under its edges, then the founder's cast-on and the fringe. Weight steps down with size: the figures have three-stitch stems, the name two, the tier word one.",
      "Every knitted glyph comes from a hand-cleaned chart on an integer stitch grid, drawn from Changa 800: figures 9 stitches by 13 rows with open three-stitch counters, Latin capitals on 8 rows with condensed 7- and 6-row sets (still two-stitch stems), tier words on 4 rows, and the Arabic names علي, ياسمين, عثمان, سلمى and حمزة hand-charted in a bold and a condensed weight, joined on a two-row baseline with 2×2 dots, plus the five Arabic tier words.",
      "A name never collapses to an initial. It steps down a fit ladder: 8 rows with ·26 on its baseline, then 7, then 6, then the same with ·26 stacked above the name's end, then two lines broken at a syllable where one exists (the year after the second line, or on a line of its own set at the name's end). Arabic goes bold, bold with the year tucked above the name's end, condensed, then a Changa 800 sample at falling row counts. The tier word stays a step below the name at every rung.",
      "The stats sit on a woven jacquard patch sewn on two stitches in from the scarf's edges: club-secondary ground (#e9e4d6 for the placeholder club), a 2u satin-stitch border in the club's dark yarn, a 1u thickness edge, the unmodified colour BotolaGO wordmark at the top with the sample note 'J.01–J.07 · Exemple' opposite, the four ratings in a row (Manrope 700 tabular figures under 600 caps labels at 70% ink), and BOT #004821 · 2026/27 · MOROCCO woven along the bottom edge.",
      "The ground is the user's club primary and the second yarn its secondary; the placeholder club gives slate (#3b4a5e) and cream (#e9e4d6). A Logo Blue selvedge runs down the inline-end edge at every tier, as the one fixed brand thread. The module computes contrast for any pair of club colours (relief tint or shade, cast-on colour, patch ground, stripe yarn, tier-word yarn). Two unbranded proof colourways, teal and cream and orange and black, are exposed as `colourways` and labelled Exemple.",
    ],
    belonging: [
      "It is the object the Moroccan terrace already lives by: a scarf in your club's colours, knitted with your number, your name and your founding year, hung on the barrier.",
      "Status lives in the knit itself and in the fringe. A chunky single-colour HOMA scarf in raised relief becomes STADE's two-colour jacquard, PRO's fine gauge with a cream panel, and CHAMPION's double-knit with bound edges and twisted cords. At LEGEND you lift it off the rail and hold it up. Friends compare tassels at a glance: two, three, four, five.",
      "ALI ·26 is the supporter-group form of a founding year, so a founder's scarf says 'I was here from the start' the way a curva's banner does.",
      "The season is knitted in: one stripe per gameweek, running out from under the patch. The share image hangs both halves of the scarf on a barrier at night under 'Ma saison, rang par rang'.",
    ],
    founderMark: [
      "Written into the name band: ALI ·26, the year knitted at about 60% of the name's height (5 rows beside 8; 4 rows beside a 7- or 6-row or Arabic name) on the name's baseline, in the club's second colour. On HOMA's single-colour scarf the year is knitted in the same relief as the name, so it never outranks it. In Arabic it reads 26· علي, the dot between the year and the name.",
      "The craft mark: the first five rows ever knitted, just above the fringe, are a cream cable cast-on with 2026 knitted between two cable twists. They keep one gauge at every tier and read at arm's length. Non-founders cast on plain, in the ground yarn.",
      "On tokens and minis the founder mark is a cream cast-on stripe at the foot, at least 3px tall at 24px (both ends of the raised LEGEND scarf carry one). 2026 is knitted into it only at 80px. The row writes ALI ·26 and never 'FOUNDER 2026'.",
      "Ceremony 'la première maille' (motion on, replayable): the five cast-on rows knit across in turn, then the cables appear. The 84 stays visible throughout; reduced motion shows the finished state.",
    ],
    small: [
      "44–80px token: a hanging segment with a steel rail (rounded end caps) overhanging both sides and the club-primary drop turned over the tube, filled with a precomputed chevron knit pattern (an SVG pattern, no filters) whose stitch size is the gauge (4px at HOMA from 64px, 3px at STADE, 2px at PRO and CHAMPION). The token is one width per size at every tier. The 84 steps down evenly on whole pixels, through optical sizes of the knit chart: 26px at 80, 20 at 64, 18 at 56, 13 at 44, 10 at 32, 9 at 28, 7 at 24.",
      "One polarity at every size: PRO is always slate figures on its cream panel, STADE and CHAMPION cream on the club colour, HOMA a light relief on the one yarn (about 6:1 on tokens). Tassels have a wrapped head in the second yarn and split into two or three strands at the tip, drawn as plain paths.",
      "24–32px mini, inside the ranking row's name cell: the same object on a 1px grid. The tassel count carries the tier (2, 3, 4, 5), and the founder's 3px cast-on stripe sits at the foot. LEGEND changes the outline: a raised band held by two fists with a knuckle bump, the forearms meeting the shared avatar's hooded head between them, the ends hanging outside with a cream cast-on each.",
      "Row (the 'My position' card): the barrier rail runs along the top of the card and the 56px token hangs from it in a fixed 64px slot, so every name starts at the same x. Beside it are ALI ·26 in Changa 800 (a heavy centred dot after a thin space, the year at 75%), then the tier with '84 OVR', then the points.",
    ],
    rtl: [
      "The scarf is a textile with no logo rule, so its structure mirrors: the Logo Blue selvedge goes to the left edge, the back drop to the right, and the patch's ratings run right to left from CAP. The knitted words are charted in visual order and never mirrored, and the BotolaGO wordmark stays Latin.",
      "The five sample Arabic names are hand-charted in two weights, bold (two-stitch strokes, about 12 rows with the descenders) and condensed (one-stitch uprights on the same two-row baseline), with joins on the baseline and 2×2 dots: the ain opens on a short stem, lam and alif rise from the baseline, sin has three teeth, tha its three dots, and the final yā and nun hang their bowls below it. Other Arabic names fall back to Changa 800 sampled at 12 rows and down; those have not been hand-checked. The five Arabic tier words are hand-charted on 7–8 rows with one-stitch strokes.",
      "The patch sets Arabic in Noto Sans Arabic 600 with no letter-spacing. Figures, BOT #004821 and 2026/27 stay left to right. In the row the year is a left-to-right run (26·) after علي, so the dot sits between them; the name cell keeps line-height 1.7 so the yā's dots are never clipped.",
    ],
    tiers: {
      HOMA: "Chunky single-colour acrylic: 30 stitches across, the coarsest gauge. The 84, the name, its year and the tier word are knitted in raised relief on the one yarn: V stitches in a light tint, each with a cast shadow and a lit edge: about 4:1 against the ground on the card and about 6:1 on tokens, measured from rasterised pixels. The tier strip is a garter-ridge band, the season stripes are raised ridges. The full outline is kept, with the Logo Blue selvedge and 2 tassels.",
      STADE:
        "Two-colour jacquard, 33 across: the 84 in the second colour on the ground, then its one jacquard band (a two-row stripe), the name band, the tier word on a strip of the second yarn, the season's stripes. 3 tassels.",
      PRO: "A finer gauge, 37 across (0.81× HOMA's stitch). The 84 is knitted in the ground colour on a cream panel, the tier word in the ground on a strip of the second yarn. 4 tassels.",
      CHAMPION:
        "Double-knit, 42 across, with plumper stitches. The cream 84 carries a knitted one-stitch drop shadow in a third, near-black yarn. A woven tape in the club's second colour binds both long edges, with a Logo Blue thread down the end-side tape. 5 two-ply twisted cords end in brushed tips.",
      LEGEND:
        "'Écharpe levée': lifted off the rail and held overhead by the supporter, the shared avatar seen from behind, hood up, cropped at the card's foot with its hood seam showing. The arms rise in graphite bench-jacket sleeves with club-colour cuffs to two fists wound in the scarf, the knuckles a ridge through the knit (no skin tone). The raised span carries the same bands at the same chart sizes: the 84 with its drop shadow, ALI ·26, and the LEGEND strip. The two ends hang long outside the fists: CAP and SEL with the logo on the reading-start end, TRF and CON with the ID and country on the other, the season's stripes, a cream cast-on (2026) and a cream cast-off, and knotted fringes. Portrait, about 1:1.45.",
    },
    legend: [
      "The outline changes from hanging (rail, drape, fringe) to raised: a wide band over a hooded head, held by two fists on a V of forearms, the ends hanging beside them. It is visible at 24px, where the figure reads as arms raised round a head.",
      "The stats stay on the front, on the two hanging ends, at 1.3× the hanging card's patch. The 84 is knitted from the same 13-row chart as every other tier.",
      "Its richness comes from the object's physics and the gesture: the drop-shadowed 84, the long hand-knotted fringe, the scarf wound round the fists, and the supporter under it. There is no precious metal anywhere.",
      "The moment (motion on, replayable, the 84 visible throughout): the arms come up, the band lifts and settles taut, and the fringe swings once. Reduced motion shows the raised final state.",
    ],
    advantages: [
      "It is the supporter's own object, in your club's colours, and reads as neither FUT, Sorare, an NFT nor a bank card.",
      "The tier ladder is physical: gauge, colour count, panel, binding, cord and finally the gesture. The tassel count makes it readable down to 24px on both grounds.",
      "The type is clean and robust: hand-cleaned stitch charts for figures, three Latin sizes and the Arabic in two weights, a fit ladder that never cuts a name to its initial, and three sizes and stroke weights keeping the hierarchy.",
      "The ratings are always on the front, on a patch that reads as textile, and the ID has a physical carrier woven into the patch's edge.",
      "Folded over the rail it stays compact in a grid or a profile, while the share image shows the whole scarf.",
    ],
    risks: [
      "It sits near ultras culture and near Codex's Terrace theme. ALI ·26 is the supporter-group form by design, so free-text names need moderation, and the share keeps stands and steps out of the background.",
      "The card has no fixed height: the coarse HOMA knit, Arabic names and long names all make the scarf longer, so any screen that holds it must let it grow downwards.",
      "Splitting a single-word name over two lines (YAS / MINE ·26) is legible but not how a person writes their name; it happens only where the scarf has too few stitches for the condensed 7- and 6-row capitals, and the break prefers a syllable (between two consonants).",
      "In the share image the 84 is a little smaller than planned, because the whole scarf, both halves and the fringe, has to fit inside the story's safe margin.",
      "The placeholder club colour is a slate close to navy, so the sample still reads cool. The module's contrast logic has been rendered for the two proof colourways, not for real club palettes, and red with green should appear only when a club's own data says so.",
      "Not built: the band that knits on at gameweek close, a league 'mur des écharpes' share, long-press on the patch, and the multi-segment sway (the drag sway is a single pendulum from the rail).",
      "The Arabic charts (the five names in two weights, the five tier words), the caption and مثال need review by a native MSA reader. Other Arabic names use a sampled fallback that has not been hand-checked.",
    ],
    refinementNotes: [
      {
        title: "Knit typography",
        items: [
          "Every glyph comes from a hand-cleaned stitch chart drawn from Changa 800: figures 9×13 with three-stitch stems and open counters (no '+' in the 8, no blob, no star artefacts in A), Latin capitals on 8 rows with condensed 7- and 6-row sets, tier words on 4 rows.",
          "A fit ladder replaces the fall-back to an initial: 8 → 7 → 6 rows with ·26 on the baseline, then ·26 stacked above the name's end, then two lines. Every sample name now knits in full at every tier in both scripts.",
          "Hand-charted the five sample Arabic names (علي, ياسمين, عثمان, سلمى, حمزة) in a bold and a condensed weight, joined on a two-row baseline with 2×2 dots; the five Arabic tier words are knitted.",
        ],
      },
      {
        title: "Hierarchy and the season",
        items: [
          "Sizes step down: 84 (13 rows), ALI ·26 (8 rows), the tier word (4 rows) on a narrow strip about 40% of the 84's band. Stroke weight steps down with them (three, two and one stitches), and the tier word stays a step below the name at every rung of the ladder.",
          "The season is back on the folded face: one stripe per gameweek played (J.01–J.07, Exemple), the woven patch sewn over it after the second stripe so the rest run out from under its edges.",
        ],
      },
      {
        title: "Founder mark",
        items: [
          "ALI ·26 is knitted into the name band at about 60% of the name height; on HOMA the year is in the same relief as the name, so it never outranks it. The cream cable cast-on with 2026 stays as the craft mark.",
          "Tokens and minis carry a cast-on stripe at least 3px tall at 24px (on both ends at LEGEND), with 2026 knitted in only at 80px. The row shows ALI ·26 with a heavy centred dot, never 'FOUNDER 2026'.",
        ],
      },
      {
        title: "Stats patch",
        items: [
          "A woven jacquard patch: club-secondary ground, a 2u satin-stitch border, a 1u thickness edge, two stitches in from the scarf's edges, and a weft texture over the text. The unmodified colour logo at the top, the ratings in a row, BOT #004821 · 2026/27 · MOROCCO woven along the bottom edge, 'J.01–J.07 · Exemple' labelled.",
        ],
      },
      {
        title: "Tier physics and LEGEND",
        items: [
          "HOMA: single-colour chunky relief, now with V stitches, a cast shadow and a lit edge on every raised stitch (measured about 4:1 on the card, up from 2.3:1, and about 6:1 on tokens). STADE: two-colour jacquard with one band. PRO: 0.81× gauge and a cream panel. CHAMPION: double-knit, woven binding tape and twisted cords.",
          "LEGEND is portrait (about 1:1.45, the hanging tiers' height budget): the shared avatar from behind, hood up, arms raised to fists with knuckles under the knit, the ends hanging long with patches at 1.3×, the season's stripes and cream ends. At 24–28px the figure reads as arms raised round a head.",
        ],
      },
      {
        title: "Silhouette, small sizes and share",
        items: [
          "The back drop is now the other half of the scarf: opaque, darker, parallel to the front, with a lit fold lip over the rail and a straight cast-off edge.",
          "Tokens: one width per size at every tier, one polarity (PRO always slate on cream), an 84 that steps down evenly (26/20/18/13/10/9/7px), 2026 only at 80px, and tassels with a wrapped head in the second yarn and a two- or three-strand split. Rows put every token in a fixed 64px slot and set ·26 with a heavy centred dot.",
          "Share: both halves hang over the rail inside the 24px margin, the front with the 84, ALI ·26, the tier and the patch, the back with the season's stripes, the 2026 cast-on and the fringe; the 84 is about 1.5× its first-pass v2 size.",
        ],
      },
    ],
    onboarding: [
      "No rating yet: the finished scarf with an empty carrier, like a new one with no rows. The number band keeps its 13 rows, now plain rib (every second stitch a purl ridge) with a knitted dash, 14 stitches by 3 rows, in the 84's own yarn (cream or charcoal on the base scarf, whichever stands out from the ground: at least 4.5:1 measured from pixels on the card, 5:1 on tokens). Never 0, never blank.",
      "No tier: the base scarf. Its own gauge (36 stitches), a tone-on-tone name band (a darker lot of the ground yarn, which carries the name and, with no name yet, stays an empty band of plain rib), no tier strip, no panel, no binding, and a close fringe of loose strands instead of tassels (the tassel count is the tier). No club: undyed wool. No founder: no cast-on mark and no year, as for any non-founder.",
      "k of N: one stripe per counted gameweek under the name, N slots. A knitted stripe is two rows of the stripe yarn; one still to come is a one-row tacking line (three stitches knitted, two left). Tokens carry the same marks from 44px, one pixel on a mini, and drop them at 24px if they do not fit. With a rating they stay (complete) until the counted gameweeks pass the minimum, then the season's stripes under the patch carry on.",
      "Empty fields: stats are a dash on the patch, the ID carrier reads BOT then a dash, a guest's name carrier is the empty band, the row says « en formation k/N » in place of the number and shows an empty band of rib for the name. share() prints « Provisoire » on a small sewn-on label when the rating is provisional.",
      "Beats (o.beat, CSS only, off under reduced motion): make (birth, 650ms at most) knits the cast-on rows from the foot, runs in the tacking lines and knits the name band row by row; first (first rating, 490ms) knits the last counted stripe in over its tacking line; tick (one more gameweek, 360ms on the card, 270ms on a token) does the same; founder (the grant, 520ms) knits the founder's cream cast-on in from its foot row, 2026 with it, then the cable twists. Rows are revealed stitch by stitch from the inline start, slowing at the end of the row; the number, the name's stitches, the serial and the patch never animate.",
    ],
    colourways: [
      { label: "Exemple", labelAr: "مثال", primary: "#0f6b67", secondary: "#efe6cf" },
      { label: "Exemple", labelAr: "مثال", primary: "#e4570f", secondary: "#151515" },
    ],
    gridWidth: 210,
    detailWidth: 340,
    full,
    token,
    row,
    share,
    mount,
    // the o.beat values this direction plays (a screen asks before it passes "founder")
    beats: ["make", "first", "tick", "founder"],
  };
  MC.register(c);
})();
