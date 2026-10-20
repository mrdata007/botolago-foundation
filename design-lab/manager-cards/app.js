/* Local visual study. Every value is fictional and fixed. No product imports or network services. */
const palette = {
  ink: "#0e2f5c",
  cyan: "#79e9ef",
  paper: "#edeade",
  white: "#f8f8f2",
  muted: "#b2c6d9",
};
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const T = (
  x,
  y,
  s,
  size = 12,
  fill = palette.white,
  weight = 700,
  anchor = "start",
  font = "Manrope",
  extra = "",
) =>
  `<text x="${x}" y="${y}" font-family="${font},sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" ${extra}>${esc(s)}</text>`;
const R = (x, y, w, h, fill, rx = 0, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
const P = (d, fill, extra = "") => `<path d="${d}" fill="${fill}" ${extra}/>`;
const L = (x1, y1, x2, y2, col = "#ffffff40", width = 1, extra = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${width}" ${extra}/>`;
const C = (x, y, r, fill, extra = "") =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
const wordmarkLight = "../../src/assets/brand/botolago-wordmark-light.svg";
const wordmarkColor = "../../src/assets/brand/botolago-wordmark-color.svg";
const logo = (x, y, w = 95, light = true) =>
  `<image x="${x}" y="${y}" width="${w}" height="${(w * 288) / 1615}" href="${light ? wordmarkLight : wordmarkColor}"/>`;
const crest = (x, y, col = palette.white) =>
  `<g transform="translate(${x} ${y})" aria-label="Generic favourite club crest">${P("M0 0H20V13Q10 25 0 13Z", "none", `stroke="${col}" stroke-width="1.3"`)}${L(5, 4, 15, 14, col)}${L(15, 4, 5, 14, col)}${C(10, 10, 2, col)}</g>`;
const flag = (x, y) =>
  `<g transform="translate(${x} ${y})">${R(0, 0, 20, 13, "#b72436", 1)}${P("M10 2 12.3 10 6 5H14L7.7 10Z", "none", 'stroke="#65b893" stroke-width="1"')}</g>`;
const origin = (x, y, col = palette.white, label = "MOROCCO") =>
  `${flag(x, y - 10)}${T(x + 27, y, label, 9, col, 700)}${crest(x + 101, y - 13, col)}`;
const seal = (x, y, col = palette.cyan, round = false) =>
  round
    ? `<g transform="translate(${x} ${y})">${C(0, 0, 26, "none", `stroke="${col}"`)}${C(0, 0, 22, "none", `stroke="${col}" stroke-dasharray="1 3"`)}${T(0, -3, "FOUNDER", 7, col, 800, "middle")}${T(0, 10, "2026", 12, col, 800, "middle")}</g>`
    : `<g transform="translate(${x} ${y})">${P("M0 0H107V22H0Z", "none", `stroke="${col}"`)}${P("M9 5 11 9 15 10 11 12 9 17 7 12 3 10 7 9Z", col)}${T(20, 14, "FOUNDER 2026", 8, col, 800)}</g>`;
const avatar = (x, y, w = 120, h = 150, body = "#193e68", head = "#b8c8cd", detail = "#79e9ef") =>
  `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 120 150" overflow="hidden" aria-label="Neutral manager avatar"><path d="M8 150 13 111Q17 100 40 93L46 85H74L80 93Q103 100 107 111L113 150Z" fill="${body}"/><path d="M44 81H76V98L60 111 44 98Z" fill="${head}"/><path d="M35 39Q35 15 60 15T85 39V64Q83 83 60 93 37 84 35 64Z" fill="${head}"/><path d="M60 17Q83 18 84 40V63Q80 82 60 92Z" fill="#000" opacity=".13"/><path d="M34 43 33 33Q32 9 62 10 89 11 87 41L77 31 57 35 42 31 38 45Z" fill="${body}"/><path d="M40 94 60 111 80 94 86 102 69 124 60 116 51 124 34 102Z" fill="${detail}"/><path d="M60 116V150M19 119 42 127M101 119 78 127" fill="none" stroke="${detail}" stroke-width="1.5"/><path d="M91 132H98" stroke="${detail}" stroke-width="3"/></svg>`;
const stats = (x, y, gap = 65, col = palette.white, mode = "normal") =>
  ["CAP", "SEL", "TRF", "CON"]
    .map((label, i) => {
      const v = [91, 82, 86, 78][i];
      return mode === "inline"
        ? `${T(x + i * gap, y, label, 9, col, 600)}${T(x + i * gap + 29, y, v, 13, col, 800)}`
        : `${T(x + i * gap, y, v, 25, col, 800, "start", "Manrope", 'style="font-variant-numeric:tabular-nums"')}${T(x + i * gap, y + 18, label, 9, col, 700)}`;
    })
    .join("");
const ovr = (x, y, size = 78, col = palette.white) =>
  `${T(x, y, "84", size, col, 800, "start", "Changa")}${T(x + 3, y + 16, "OVR", 10, col, 800)}`;
const meta = (x, y, col = palette.muted) =>
  `${T(x, y, "BOT #004821", 9, col, 700)}${T(x, y + 16, "2026/27", 9, col, 600)}`;
function defs(id) {
  return `<defs><linearGradient id="${id}-metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#627d94"/><stop offset=".22" stop-color="#e2e9e1"/><stop offset=".43" stop-color="#8aa8b8"/><stop offset=".64" stop-color="#c3c6e2"/><stop offset="1" stop-color="#507b87"/></linearGradient><linearGradient id="${id}-glass" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#254664"/><stop offset="1" stop-color="#101d35"/></linearGradient><radialGradient id="${id}-light"><stop stop-color="#a4f8ff" stop-opacity=".28"/><stop offset="1" stop-color="#4acddd" stop-opacity="0"/></radialGradient><pattern id="${id}-grain" width="7" height="9" patternUnits="userSpaceOnUse"><circle cx="1" cy="3" r=".5" fill="#fff" opacity=".16"/><circle cx="5" cy="7" r=".4" fill="#000" opacity=".25"/></pattern><pattern id="${id}-lines" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 0V5" stroke="#fff" opacity=".06"/></pattern></defs>`;
}
const design = [
  // 01 STREET — a wheat-pasted neighbourhood tournament poster.
  (id) =>
    `${P("M10 23 104 16 110 7 207 12 310 3 304 130 315 135 308 308 315 317 306 448 188 444 180 453 66 445 4 452 10 284 3 276Z", "#d7dacd")}${P("M18 28 303 13 298 430 17 438Z", "#173e66")}${R(18, 25, 280, 410, `url(#${id}-grain)`)}${P("M27 191 285 73M18 304 298 188", "none", 'stroke="#e2e5d0" stroke-width="2" opacity=".23"')}${P("M43 24 162 18 165 54 42 60Z", "#ede7c9")}${logo(53, 32, 98, false)}${T(270, 45, "01 / HOMA DNA", 8, "#cee4e1", 700, "end")}${T(24, 175, "84", 100, "#eff0d6", 800, "start", "Changa")}${T(31, 191, "OVR", 11, "#eff0d6", 800)}${R(30, 208, 59, 27, "#bde78c")}${T(59, 227, "PRO", 15, "#133c53", 800, "middle", "Changa")}${P("M155 98 284 82 281 268 139 271Z", "#a6c4cc")}${avatar(148, 107, 137, 172, "#143252", "#c4d4d1", "#d5ef97")}${P("M137 255 287 242 291 274 140 287Z", "#d9e9b2")}${T(208, 269, "FROM THE BLOCK", 9, "#153953", 800, "middle")}${T(27, 306, "ALI", 48, "#eff0d6", 800, "start", "Changa")}${origin(163, 306, "#eff0d6")}${L(28, 323, 287, 323, "#c6d6ce", 1)}${stats(28, 354, 67, "#eff0d6")}${seal(29, 394, "#eff0d6")}${T(283, 403, "BOT #004821", 9, "#eff0d6", 700, "end")}${T(283, 421, "2026/27", 9, "#eff0d6", 600, "end")}`,
  // 02 STADIUM PASS — a proper credential, not a trading-card shield.
  (id) =>
    `${P("M47 8H273Q292 8 292 27V351Q279 351 279 363T292 375V438Q292 452 278 452H42Q28 452 28 438V375Q41 375 41 363T28 351V27Q28 8 47 8Z", "#efeee2")}${R(117, 21, 86, 10, "#172534", 5)}${logo(51, 57, 117, false)}${T(267, 72, "26/27", 10, "#173e66", 800, "end")}${T(51, 105, "MANAGER ACCESS", 10, "#547084", 800)}${L(51, 120, 269, 120, "#b6c7c9")}${R(50, 139, 122, 151, "#cad8d8", 4)}${avatar(50, 139, 122, 151)}${T(185, 206, "84", 65, "#0e2f5c", 800, "start", "Changa")}${T(189, 224, "OVR", 10, "#345877", 800)}${R(186, 245, 69, 29, "#0e2f5c", 3)}${T(220, 265, "PRO", 16, "#92e8ec", 700, "middle", "Changa")}${T(50, 330, "ALI", 40, "#0e2f5c", 800, "start", "Changa")}${origin(146, 327, "#0e2f5c")}${L(42, 363, 279, 363, "#8ca4ad", 1, 'stroke-dasharray="3 4"')}${stats(49, 393, 57, "#0e2f5c")}${T(51, 437, "BOT #004821", 8, "#355775", 700)}${T(267, 437, "2026/27", 8, "#355775", 600, "end")}${seal(211, 103, "#214c70", true)}`,
  // 03 FUTURE BOTOLA — an optically layered slab, edge foil only.
  (id) =>
    `${P("M43 7H274L311 44V414L274 452H10V42Z", `url(#${id}-metal)`)}${P("M45 13H272L304 47V411L271 445H17V45Z", `url(#${id}-glass)`)}${R(21, 47, 278, 363, `url(#${id}-lines)`)}${C(167, 200, 138, `url(#${id}-light)`)}${P("M29 53 292 316V370L29 107Z", "#d5ebff", 'opacity=".035"')}${logo(39, 32, 99)}${T(277, 49, "PRO", 17, "#b7f8f1", 700, "end", "Changa")}${ovr(37, 134, 73, "#e4f7ef")}${T(278, 78, "2026/27", 9, "#c7dadd", 600, "end")}${C(177, 200, 88, "none", 'stroke="#6c939f" stroke-width=".8"')}${C(177, 200, 75, "none", 'stroke="#92e6e1" stroke-width="2" stroke-dasharray="110 362" transform="rotate(-40 177 200)"')}${C(177, 200, 64, "#1e405c")}${avatar(118, 133, 122, 153, "#19344d", "#b5d3d5", "#acedea")}${L(45, 244, 95, 244, "#8be3e3")}${T(42, 235, "MGR", 8, "#9fc6d3", 600)}${T(160, 319, "ALI", 47, "#e4f7ef", 800, "middle", "Changa")}${stats(39, 355, 68, "#dfefef")}${L(38, 387, 282, 387, "#709199")}${origin(38, 410, "#cde5e8")}${seal(182, 397, "#bed3d6")}${T(39, 433, "BOT #004821", 8, "#bcd4dc")}`,
  // 04 TERRACE — the supporter banner becomes the object.
  (id) =>
    `${P("M21 10H299V442L268 453 236 442 204 453 173 442 141 453 109 442 77 453 45 442 21 448Z", "#12394e")}${R(31, 10, 5, 424, "#a3bdc6")}${R(284, 10, 5, 424, "#a3bdc6")}${R(41, 10, 239, 415, `url(#${id}-lines)`)}${logo(49, 29, 101)}${T(271, 47, "2026/27", 9, "#d0e3e8", 600, "end")}${Array.from({ length: 8 }, (_, i) => P(`M42 ${130 + i * 13}Q160 ${57 + i * 13} 278 ${130 + i * 13}`, "none", 'stroke="#b4d2d7" stroke-opacity=".14" stroke-width="6"')).join("")}${L(51, 90, 269, 90, "#b6d8dd", 2)}${Array.from({ length: 10 }, (_, i) => R(53 + i * 23, 82, 11, 4, "#dbe7d8")).join("")}${C(168, 201, 76, "#295367")}${avatar(106, 133, 125, 156, "#0d293b", "#bccfd1", "#d9dfb5")}${R(43, 113, 67, 96, "#d9dfb5", 1)}${T(76, 168, "84", 47, "#183c4a", 800, "middle", "Changa")}${T(76, 187, "OVR", 10, "#183c4a", 800, "middle")}${T(263, 224, "PRO", 17, "#d9dfb5", 800, "end", "Changa")}${T(160, 307, "ALI", 54, "#f0eedb", 800, "middle", "Changa", 'letter-spacing="10"')}${L(50, 321, 270, 321, "#adc6c9")}${stats(51, 350, 60, "#ebebd6")}${origin(49, 394, "#c3d9dc")}${T(270, 394, "BOT #004821", 8, "#c3d9dc", 700, "end")}${seal(106, 410, "#d9dfb5")}`,
  // 05 BROADCAST — a landscape lower-third with a vertical rating channel.
  (id) =>
    `${R(2, 70, 316, 318, "#e9eff0", 8)}${R(2, 70, 316, 43, "#0e2f5c", 8)}${R(2, 104, 316, 12, "#0e2f5c")}${logo(21, 84, 95)}${T(300, 98, "MANAGER / PRO", 10, "#a1eef1", 800, "end")}${R(18, 132, 164, 159, "#b7d1d8", 3)}${P("M18 249 182 142V169L18 276Z", "#88aebc")}${avatar(41, 137, 122, 154, "#244664", "#c7d5d5", "#79e9ef")}${R(197, 131, 104, 160, "#0e2f5c", 3)}${T(248, 215, "84", 76, "#f1f6ed", 800, "middle", "Changa")}${T(248, 237, "OVR", 9, "#a2dce8", 800, "middle")}${L(214, 249, 284, 249, "#6a88a7")}${T(248, 276, "PRO", 20, "#79e9ef", 700, "middle", "Changa")}${R(18, 252, 164, 39, "#244df0")}${T(29, 281, "ALI", 30, "#fff", 800, "start", "Changa")}${origin(21, 317, "#0e2f5c")}${T(299, 317, "2026/27", 9, "#365773", 700, "end")}${stats(21, 348, 73, "#0e2f5c", "inline")}${L(20, 360, 300, 360, "#b3c8d3")}${T(21, 378, "BOT #004821", 8, "#0e2f5c", 700)}${T(300, 378, "✦ FOUNDER 2026", 8, "#0e2f5c", 800, "end")}`,
  // 06 MINIMAL LUXURY — quiet debossing, not animated rarity.
  (id) =>
    `${R(25, 8, 270, 444, "#121e2b", 29)}${R(31, 14, 258, 432, "none", 25, 'stroke="#56606a" stroke-width=".65"')}${R(33, 16, 254, 428, `url(#${id}-grain)`, 24)}${logo(52, 41, 105)}${T(267, 58, "PRO", 12, "#d5c9ad", 700, "end", "Changa")}${ovr(50, 164, 85, "#e8e3d3")}${C(221, 143, 45, "#263645", 'stroke="#847d6d" stroke-width=".7"')}${avatar(181, 100, 80, 100, "#172535", "#b1b9b7", "#acb6b4")}${T(51, 250, "ALI", 48, "#e8e3d3", 600, "start", "Changa", 'letter-spacing="4"')}${T(53, 271, "BOTOLAGO MANAGER", 8, "#a6b4c1", 600, "start", "Manrope", 'letter-spacing="2"')}${L(53, 293, 267, 293, "#6e746e", 0.6)}${stats(53, 325, 57, "#e8e3d3")}${origin(54, 374, "#b6c2ca")}${seal(244, 392, "#c6b797", true)}${T(53, 412, "BOT #004821", 8, "#aeb9c2", 600)}${T(53, 428, "2026/27", 8, "#aeb9c2", 600)}`,
  // 07 DIGITAL PASSPORT — wide, document-like, serialized.
  (id) =>
    `${P("M4 83H285L317 115V384H4Z", "#dce6e4")}${R(4, 83, 11, 301, "#225475")}${logo(30, 104, 101, false)}${T(289, 119, "MA / PRO", 11, "#0e2f5c", 800, "end")}${T(30, 146, "MANAGER IDENTITY", 9, "#486879", 700, "start", "Manrope", 'letter-spacing="2"')}${L(30, 158, 291, 158, "#9eb9be")}${R(30, 177, 96, 119, "#a8c2c9", 1)}${avatar(30, 177, 96, 119, "#274c62", "#d3dfd9", "#96dbd9")}${T(146, 215, "ALI", 36, "#0e2f5c", 800, "start", "Changa")}${T(286, 249, "84", 55, "#0e2f5c", 800, "end", "Changa")}${T(285, 266, "OVR", 9, "#0e2f5c", 800, "end")}${T(147, 238, "BOT #004821", 9, "#365c71", 700)}${T(147, 258, "2026/27", 9, "#365c71", 700)}${origin(146, 287, "#0e2f5c")}${stats(30, 320, 70, "#0e2f5c", "inline")}${L(30, 335, 291, 335, "#9eb9be")}${T(30, 357, "BGO<<ALI<004821<MA", 10, "#234d66", 600, "start", "monospace")}${T(30, 373, "2026/27<<PRO<84<<<<", 10, "#234d66", 600, "start", "monospace")}${seal(257, 359, "#234d66", true)}`,
  // 08 ARCADE — a physical cartridge with block numerals and a save badge.
  (id) =>
    `${P("M47 8H269V26H303V421H285V452H35V430H17V26H47Z", "#2455da")}${P("M47 8H269V26H47Z", "#547fff")}${R(30, 41, 260, 243, "#102b59", 8)}${R(39, 50, 242, 225, "none", 3, 'stroke="#6d94ce"')}${logo(53, 63, 91)}${T(267, 78, "PRO", 17, "#bfe788", 800, "end", "Changa")}${R(53, 97, 91, 84, "#bfe788", 2)}${T(97, 155, "84", 61, "#14366c", 800, "middle", "Changa")}${T(98, 172, "OVR", 9, "#14366c", 800, "middle")}${R(191, 114, 35, 13, "#c8d7d1")}${R(182, 127, 52, 42, "#c8d7d1")}${R(181, 112, 54, 17, "#557a94")}${R(175, 123, 11, 25, "#557a94")}${R(198, 169, 23, 13, "#c8d7d1")}${P("M169 188H191V177H225V188H248V243H169Z", "#557a94")}${P("M189 181 210 202 230 181V194L210 216 189 194Z", "#bfe788")}${L(209, 211, 209, 243, "#bfe788", 3)}${T(54, 223, "ALI", 35, "#f5f1dd", 800, "start", "Changa")}${T(54, 252, "PLAYER / 004821", 8, "#bbd4ec", 700)}${stats(42, 320, 65, "#f5f1dd")}${R(39, 355, 242, 51, "#163774", 4)}${origin(51, 380, "#cddfed")}${T(270, 379, "2026/27", 8, "#cddfed", 600, "end")}${T(270, 395, "BOT #004821", 8, "#cddfed", 600, "end")}${seal(108, 416, "#f0cd88")}${[0, 1, 2, 3].map((i) => R(47 + i * 11, 420, 5, 18, "#0e2f5c")).join("")}`,
  // 09 STADIUM ARCHITECTURE — the tunnel is the silhouette.
  (id) =>
    `${P("M11 452V137Q11 12 160 7 309 12 309 137V452H11Z", "#a0b7bc")}${P("M18 445V137Q18 20 160 14 302 20 302 137V445Z", "#0d2d47")}${[0, 1, 2, 3, 4].map((i) => P(`M${29 + i * 14} 382V151Q${29 + i * 14} ${37 + i * 13} 160 ${30 + i * 13}Q${291 - i * 14} ${37 + i * 13} ${291 - i * 14} 151V382`, "none", `stroke="${i === 2 ? "#8dafb8" : "#466375"}" stroke-width="${i === 2 ? 3 : 1}"`)).join("")}${C(160, 173, 104, `url(#${id}-light)`)}${logo(108, 46, 104)}${T(160, 143, "84", 69, "#ecf2e6", 800, "middle", "Changa")}${T(160, 159, "OVR / PRO", 10, "#9de4e8", 800, "middle")}${P("M112 193 96 304H224L208 193Z", "#274c61")}${avatar(99, 178, 122, 153, "#0f2b43", "#c8d6d7", "#b0e0dc")}${P("M30 330H290V373H30Z", "#e0e6d9")}${T(48, 362, "ALI", 33, "#153c55", 800, "start", "Changa")}${origin(156, 354, "#153c55")}${stats(37, 405, 67, "#dbe9e4")}${T(37, 439, "BOT #004821", 8, "#c9dee0")}${T(284, 439, "2026/27", 8, "#c9dee0", 600, "end")}${seal(256, 290, "#d2e4d8", true)}`,
  // 10 TOUCHLINE — two interlocking leaves and an open central channel.
  (id) =>
    `${P("M15 11H113Q128 11 128 26V173Q128 188 143 188H169V229H127V415Q127 447 98 447H15Z", "#2d5be3")}${P("M144 11H290Q305 11 305 27V447H144V259H184V212H159Q144 212 144 197Z", "#e1e7d5")}${R(24, 25, 4, 407, "#92bdf0")}${logo(161, 36, 126, false)}${T(66, 140, "84", 74, "#f2f6e9", 800, "middle", "Changa")}${T(67, 160, "OVR", 10, "#e2edff", 800, "middle")}${T(67, 198, "PRO", 22, "#eef2df", 700, "middle", "Changa")}${P("M161 93H289V240H185V195H161Z", "#abc1c2")}<defs><clipPath id="${id}-portrait">${P("M161 93H289V240H185V195H161Z", "#fff")}</clipPath></defs><g clip-path="url(#${id}-portrait)">${avatar(166, 99, 120, 150, "#194e68", "#d0dcce", "#81babc")}</g>${T(210, 287, "ALI", 48, "#164660", 800, "middle", "Changa")}${L(162, 300, 288, 300, "#9bb4af")}${[
      "CAP",
      "SEL",
      "TRF",
      "CON",
    ]
      .map((s, i) => {
        const x = 171 + (i % 2) * 71,
          y = 327 + Math.floor(i / 2) * 45;
        return `${T(x, y, [91, 82, 86, 78][i], 22, "#164660", 800)}${T(x, y + 13, s, 8, "#365d6a", 700)}`;
      })
      .join(
        "",
      )}${crest(49, 230, "#e5eeec")}${flag(50, 268)}${T(66, 298, "MOROCCO", 8, "#e5eeec", 700, "middle")}${seal(69, 350, "#e5eeec", true)}${T(68, 411, "2026/27", 9, "#e5eeec", 700, "middle")}${T(162, 417, "BOT #004821", 9, "#164660", 800)}${T(162, 434, "THE TOUCHLINE", 8, "#365d6a", 700)}`,
];
let renderSerial = 0;
function card(i) {
  const id = `bgo-${i}-${++renderSerial}`;
  return `<svg class="card-svg" viewBox="0 0 320 460" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(concepts[i].name)}: ALI, 84 OVR, PRO, Morocco, generic club, 2026/27, BOT #004821, FOUNDER 2026, CAP 91, SEL 82, TRF 86, CON 78" direction="ltr" style="font-variant-numeric:tabular-nums">${defs(id)}${design[i](id)}</svg>`;
}
const concepts = [
  {
    name: "Street",
    material: "Wheat-paste / concrete / cloth tape",
    thesis: "A neighbourhood tournament poster you have earned the right to wear.",
    emotion:
      "It says “I came from here.” Tape, oversized jersey numerals and the imperfect edge evoke neighbourhood football without using decorative clichés.",
    own: "The ragged asymmetric sheet, taped BotolaGO wordmark and slashed portrait are a credible HOMA-to-PRO visual language. Poster styling alone is not exclusive; the edge and number placement must stay consistent.",
    progress:
      "HOMA: uncoated paper. STADE: overprinted club ink. PRO: layered poster and cloth patch. CHAMPION: reflective screen-print. LEGEND: enamel corner and a restrained moving overprint. Keep the torn outline at every tier.",
    risk: "Intentional roughness can look inexpensive at thumbnail size. Preserve the clean OVR silhouette and avoid adding more stickers.",
    rank: "Strong local belonging and youth appeal; the most emotional direction after the tunnel and pass, but less universally premium.",
  },
  {
    name: "Stadium Pass",
    material: "Laminated credential / perforated stock",
    thesis: "Belong to the football world, with a credential that feels earned.",
    emotion:
      "A pass makes the manager feel admitted, recognized and part of matchday. The permanent founder seal reads as a credential accumulated over time.",
    own: "The narrow body, lanyard slot and offset perforation make a memorable family. It is grounded in football, but ownability depends on maintaining this exact cut and BotolaGO typography.",
    progress:
      "HOMA: paper pass. STADE: laminated stock. PRO: engraved identity and stamped founder seal. CHAMPION: metal eyelet and silver edge. LEGEND: translucent credential with a single light sweep. The punched slot stays.",
    risk: "It may feel administrative rather than aspirational. Keep ALI and 84 prominent, and do not add fake access rights or scannable codes.",
    rank: "The most natural football artifact, extremely readable and easy to scale. Third because the silhouette is less exclusive than the two leading concepts.",
  },
  {
    name: "Future Botola",
    material: "Optical resin / edge foil / etched glass",
    thesis: "A precise optical object, with prestige held in the edge rather than the glow.",
    emotion:
      "Light, translucent layers and the orbital portrait suggest an object worth keeping. The quiet foil detail rewards a closer look.",
    own: "The diagonal upper cut and asymmetric lower return can be standardized, but a glass collectible is a crowded category. BotolaGO blue and Changa keep the connection to the app.",
    progress:
      "HOMA: opaque resin. STADE: etched ring. PRO: layered glass with foil edge. CHAMPION: a second optical plane. LEGEND: slow parallax with an optional edge shimmer. Text stays on a flat, opaque reading plane.",
    risk: "Closest to generic gaming collectibles. More shine would weaken it; reduced-motion and low-power variants are essential.",
    rank: "Premium and collectible, but the material language is less ownable and can drift toward the NFT aesthetic the brief rejects.",
  },
  {
    name: "Terrace",
    material: "Woven banner / stadium steel / floodlight",
    thesis: "Turn the shared energy of the stands into a personal banner.",
    emotion:
      "The stitched edges, tiered stands and floodlight rhythm make status feel collective. It belongs to a supporter before it belongs to a gamer.",
    own: "The alternating banner hem and parallel stitched rails offer a recognizable family. Contemporary stadium geometry provides Moroccan football context without literal ornament.",
    progress:
      "HOMA: plain fabric. STADE: stitched rails. PRO: woven founder patch and floodlight bar. CHAMPION: embroidered metallic thread. LEGEND: one subtle banner lift or light sequence. No smoke obscures the identity.",
    risk: "Supporter aesthetics can imply a specific ultras group. Keep the palette and motifs neutral, with no slogans or group insignia.",
    rank: "Excellent belonging and collectibility, slightly behind Street because a hanging banner is harder to adapt to compact horizontal contexts.",
  },
  {
    name: "Broadcast",
    material: "Score graphic / enamel blue / frosted white",
    thesis: "Make the manager look like the headline of the match coverage.",
    emotion:
      "A broadcast title treatment gives an ordinary fan the status of someone worth talking about. Every important figure reads immediately.",
    own: "The blue name strap and dedicated rating channel suit BotolaGO sports coverage. The wide silhouette is useful, though less distinctive than a physical object.",
    progress:
      "HOMA: flat panel. STADE: club-colored strap. PRO: segmented rating channel. CHAMPION: metallic name plate. LEGEND: a short optional broadcast reveal. Retain the crisp static version for standings.",
    risk: "It can feel like a stat graphic instead of a collectible. Avoid live badges, invented performance metrics and extra dashboard panels.",
    rank: "Best for practical in-app use and social crops; weaker as an iconic standalone collectible.",
  },
  {
    name: "Minimal Luxury",
    material: "Midnight anodized metal / champagne deboss",
    thesis: "Prestige that does not need to announce itself with effects.",
    emotion:
      "The restrained finish and generous negative space feel personal and durable. A founder stamp becomes a quiet sign of early membership.",
    own: "The rounded monolith and low-contrast double edge create a disciplined family, but the category is familiar. The permanent founder medallion and typography must do more work.",
    progress:
      "HOMA: matte polymer. STADE: brushed metal. PRO: debossed lettering and champagne seal. CHAMPION: inset ceramic. LEGEND: platinum edge and a fine engraved season archive. Never add particles.",
    risk: "May underwhelm younger players or look like a premium bank card. Test emotional appeal; do not assume minimalism equals desirability.",
    rank: "The strongest mature premium treatment. Sixth because it sacrifices youthful energy and silhouette ownership for restraint.",
  },
  {
    name: "Digital Passport",
    material: "Security paper / serial type / cut laminate",
    thesis: "Your season identity, officially issued by the world of BotolaGO.",
    emotion:
      "The serial number and founder stamp make membership feel permanent. It suggests a history that can be collected season after season.",
    own: "The cut upper corner, navy binding and machine-readable-style identity line form a repeatable system. This is a fictional game credential, not a government document.",
    progress:
      "HOMA: paper identity. STADE: laminated document. PRO: security linework and founder stamp. CHAMPION: foil binding. LEGEND: animated verification motif and archived season pages. No real scanning or verification is implied.",
    risk: "Dense metadata and document cues can feel bureaucratic. The compact form must drop the serial lines and prioritize face, ALI and 84.",
    rank: "Excellent identity and season-history fit, but lower emotional energy and flex appeal than the higher-ranked directions.",
  },
  {
    name: "Arcade",
    material: "Molded cartridge / pixel portrait / foil save seal",
    thesis: "A football identity that feels like a favourite game you never put down.",
    emotion:
      "A tangible cartridge evokes play, mastery and keeping a save file. The block portrait also makes anonymity feel intentional.",
    own: "The stepped shoulders, side ribs and founder save seal are easy to recognize. The blue and green come from BotolaGO’s energetic sports palette, with no neon halo.",
    progress:
      "HOMA: two-color cartridge. STADE: printed label. PRO: molded casing with foil founder seal. CHAMPION: translucent shell. LEGEND: a brief optional pixel boot animation. Keep the OVR completely static while reading.",
    risk: "The most likely to feel childish to an older fantasy player. Photo uploads need a clean rectangular treatment rather than forced pixelation.",
    rank: "Memorable and playful but has the narrowest age fit; retain it as a genuine alternative, not the default recommendation.",
  },
  {
    name: "Stadium Architecture",
    material: "Tunnel ribs / cast aluminum / stadium light",
    thesis: "The walk onto the pitch becomes the shape of your identity.",
    emotion:
      "A stadium tunnel is the threshold between watching and belonging. The avatar stands at the entrance; the manager feels ready to step into the game.",
    own: "The broad structural arch, five receding ribs and straight base create a silhouette that can survive without a logo. It is a stadium tunnel, not a historic arch or a shield.",
    progress:
      "HOMA: one concrete rib. STADE: painted structure. PRO: five ribs and embedded light. CHAMPION: brushed structural metal and lit seams. LEGEND: deep stadium parallax and a single matchday light reveal. The arch is constant.",
    risk: "The high arch consumes space. Compact versions need just one rib and a face; excessive ribs can become decorative architecture.",
    rank: "First for combining an ownable silhouette, immediate football emotion, premium materials and a convincing prestige ladder.",
  },
  {
    name: "Touchline",
    material: "Interlocking leaves / cobalt enamel / chalk composite",
    thesis: "Two sides of a manager: the person and the decisions, joined at the touchline.",
    emotion:
      "An open central channel makes the object feel assembled and personal. The cobalt rating spine stays with the manager while the identity leaf can carry seasons and achievements.",
    own: "The offset split, right-angle return and exposed central bridge are the biggest original bet. The negative space becomes the mark, even when the logo is removed.",
    progress:
      "HOMA: one flat cut sheet. STADE: two bonded leaves. PRO: enamel rating spine and chalk-composite identity. CHAMPION: machined interlock. LEGEND: a very short optional assembly motion and polished inner edges. Keep the void open.",
    risk: "The conceptual split is less immediately football-specific. The 24px version needs a simplified notch, and uploaded portraits must not cross the open channel.",
    rank: "Second for originality and silhouette ownership. It could become the signature, but needs more recognition testing than the tunnel.",
  },
];
const localConcepts = {
  fr: [
    ["Street", "Une affiche de tournoi de quartier que l’on mérite de porter."],
    ["Stadium Pass", "Un accès au monde du football qui se gagne."],
    ["Future Botola", "Un objet optique précis, dont le prestige tient à la matière."],
    ["Terrace", "L’énergie des tribunes devient une bannière personnelle."],
    ["Broadcast", "Le manager devient le sujet principal de la rencontre."],
    ["Minimal Luxury", "Un prestige discret, sans effets superflus."],
    ["Digital Passport", "L’identité de votre saison dans l’univers BotolaGO."],
    ["Arcade", "Une identité football comme un jeu que l’on ne quitte jamais."],
    ["Stadium Architecture", "L’entrée sur la pelouse devient votre silhouette."],
    ["Touchline", "La personne et ses décisions, reliées par la ligne de touche."],
  ],
  ar: [
    ["الحي", "هوية مستوحاة من ملصق بطولة الحي، تستحق أن تحملها."],
    ["بطاقة الملعب", "انتماء إلى عالم كرة القدم تستحقه بأدائك."],
    ["مستقبل البطولة", "قطعة دقيقة تستمد مكانتها من المادة والضوء."],
    ["المدرج", "طاقة المدرجات تتحول إلى رايتك الخاصة."],
    ["البث الرياضي", "المدرب في صدارة المشهد الرياضي."],
    ["فخامة هادئة", "مكانة تظهر بالتفاصيل دون مؤثرات زائدة."],
    ["جواز المدرب", "هوية موسمك داخل عالم BotolaGO."],
    ["أركيد", "هوية كروية تشبه لعبتك المفضلة."],
    ["هندسة الملعب", "لحظة دخول الملعب تصبح شكل هويتك."],
    ["خط التماس", "الشخص وقراراته، يجمعهما خط التماس."],
  ],
};
const strings = {
  en: {
    eyebrow: "IDENTITY EXPLORATION · SEASON 2026/27",
    title: "More than a profile.<br>A place in the game.",
    intro:
      "Ten possible identities for the BotolaGO manager. Same player. Same ability. Ten very different ways to belong.",
    edition: "MANAGER CARD<br>CONCEPT COLLECTION",
    fiction: "Visual study · fictional profile",
    gallery: "The collection",
    overview: "All ten at a glance",
    ranking: "Design ranking",
    inspect: "Select a card to explore its details.",
    legend: "CAP Captain · SEL Selection · TRF Transfers · CON Consistency",
    footer: "Ten directions. No final selection. Materials and tier evolution are proposals.",
    surround: "Light surround",
    darkSurround: "Dark surround",
    compact: "LEADERBOARD IDENTITY",
    avatarNote:
      "One avatar slot. Photo, illustration or anonymous silhouette. No portrait required.",
    inspectButton: "Explore",
    notes: "DESIGN NOTES · ENGLISH",
    rankTitle: "The case for a signature.",
    rankIntro:
      "A design judgment, not user research. Ownable BotolaGO identity comes first, followed by emotional appeal, collectibility, status, youth appeal, premium finish, sharing, scalability, originality and iconic potential. All ten remain available.",
    reasonLabels: [
      "Emotional connection",
      "BotolaGO ownership",
      "The five-tier evolution",
      "Biggest risk",
    ],
    detailLabel: "CONCEPT",
    mini: "FOUNDER 2026 · Morocco",
  },
  fr: {
    eyebrow: "RECHERCHE D’IDENTITÉ · SAISON 2026/27",
    title: "Plus qu’un profil.<br>Une place dans le jeu.",
    intro:
      "Dix identités possibles pour le manager BotolaGO. Même joueur. Même niveau. Dix façons très différentes d’appartenir au jeu.",
    edition: "CARTE MANAGER<br>COLLECTION DE CONCEPTS",
    fiction: "Étude visuelle · profil fictif",
    gallery: "La collection",
    overview: "Les dix en un regard",
    ranking: "Classement design",
    inspect: "Sélectionnez une carte pour découvrir ses détails.",
    legend: "CAP Capitaine · SEL Sélection · TRF Transferts · CON Régularité",
    footer: "Dix directions. Aucun choix final. Matières et évolution des niveaux proposées.",
    surround: "Fond clair",
    darkSurround: "Fond sombre",
    compact: "IDENTITÉ AU CLASSEMENT",
    avatarNote:
      "Un emplacement pour une photo, une illustration ou une silhouette anonyme. Aucun portrait requis.",
    inspectButton: "Explorer",
    notes: "NOTES DE DESIGN · EN ANGLAIS",
    rankTitle: "À la recherche d’une signature.",
    rankIntro:
      "Un avis de design, pas une étude utilisateurs. Priorité à l’identité BotolaGO, puis à l’émotion, la collection, le statut, l’attrait des jeunes, la qualité, le partage, l’adaptabilité et l’originalité. Les dix concepts restent disponibles. Analyse détaillée en anglais.",
    reasonLabels: [
      "Lien émotionnel",
      "Identité BotolaGO",
      "Évolution des cinq niveaux",
      "Risque principal",
    ],
    detailLabel: "CONCEPT",
    mini: "FOUNDER 2026 · Maroc",
  },
  ar: {
    eyebrow: "استكشاف الهوية · موسم 2026/27",
    title: "أكثر من ملف شخصي.<br>مكانك في اللعبة.",
    intro: "عشر هويات محتملة لمدرب BotolaGO. نفس اللاعب ونفس المستوى، وعشر طرق مختلفة للانتماء.",
    edition: "بطاقة المدرب<br>مجموعة التصاميم",
    fiction: "دراسة بصرية · ملف خيالي",
    gallery: "المجموعة",
    overview: "العشرة معاً",
    ranking: "ترتيب التصاميم",
    inspect: "اختر بطاقة لاستكشاف تفاصيلها.",
    legend: "CAP القائد · SEL الاختيار · TRF الانتقالات · CON الاستمرارية",
    footer: "عشرة اتجاهات دون اختيار نهائي. الخامات وتطور المستويات مجرد مقترحات.",
    surround: "خلفية فاتحة",
    darkSurround: "خلفية داكنة",
    compact: "الهوية في الترتيب",
    avatarNote: "مساحة واحدة لصورة أو رسم أو شخصية مجهولة. التصميم لا يعتمد على صورة حقيقية.",
    inspectButton: "استكشف",
    notes: "ملاحظات التصميم · باللغة الإنجليزية",
    rankTitle: "نحو هوية مميزة.",
    rankIntro:
      "تقييم تصميمي وليس بحثاً مع المستخدمين. الأولوية لهوية BotolaGO ثم الارتباط العاطفي وقابلية الجمع والمكانة وجاذبية الشباب والجودة والمشاركة والتكيف والأصالة. جميع التصاميم متاحة. التحليل المفصل باللغة الإنجليزية.",
    reasonLabels: ["الارتباط العاطفي", "هوية BotolaGO", "تطور المستويات الخمسة", "أبرز المخاطر"],
    detailLabel: "التصميم",
    mini: "FOUNDER 2026 · المغرب",
  },
};
let language = "en",
  view = "gallery",
  selected = 0,
  returnFocus = null;
const $ = (s) => document.querySelector(s);
const copy = () => strings[language];
const name = (i) => localConcepts[language]?.[i][0] || concepts[i].name;
const thesis = (i) => localConcepts[language]?.[i][1] || concepts[i].thesis;
const rankOrder = [8, 9, 1, 0, 3, 5, 4, 2, 6, 7];
function compact(i) {
  const shapes = [
    "M3 6 35 2 39 42 34 54 2 52Z",
    "M6 2H36V38Q30 41 36 44V54H6V44Q12 41 6 38Z",
    "M9 2H33L40 9V45L32 54H2V9Z",
    "M4 2H38V53L30 49 22 54 14 49 4 53Z",
    "M1 12H41V46H1Z",
    "M9 2H33Q40 2 40 9V47Q40 54 33 54H9Q2 54 2 47V9Q2 2 9 2Z",
    "M1 12H32L41 21V46H1Z",
    "M8 2H34V7H40V48H34V54H8V49H2V7H8Z",
    "M2 54V20Q2 2 21 2T40 20V54Z",
    "M2 2H15V24H24V29H15V54H2ZM19 2H40V54H19V34H28V24H19Z",
  ];
  return `<svg class="mini-art" viewBox="0 0 42 56" aria-hidden="true">${P(shapes[i], ["#264c6c", "#e8e6d9", "#789cae", "#28566a", "#d8e4e5", "#263444", "#d8e4dc", "#2455da", "#315b72", "#4273e9"][i])}${i === 8 ? P("M7 49V21Q7 8 21 7T35 21V49", "none", 'stroke="#b1d8db"') : ""}${C(i === 9 ? 29 : 21, 24, 6, i === 1 || i === 4 || i === 6 ? "#0e2f5c" : "#d6e2d9")}${P(i === 9 ? "M21 44V37Q29 28 37 37V44Z" : "M10 44V37Q21 25 32 37V44Z", i === 1 || i === 4 || i === 6 ? "#0e2f5c" : "#d6e2d9")}</svg>`;
}
function renderGallery() {
  const gallery = $("#gallery");
  gallery.classList.toggle("overview", view === "overview");
  gallery.hidden = view === "ranking";
  $("#rankings").hidden = view !== "ranking";
  gallery.innerHTML = concepts
    .map(
      (c, i) =>
        `<article class="concept"><button class="card-button" data-open="${i}" aria-label="${esc(copy().inspectButton + " " + name(i))}">${card(i)}</button><div class="concept-info"><div class="concept-top"><span class="concept-no">${String(i + 1).padStart(2, "0")}</span><h3>${esc(name(i))}</h3></div><p>${esc(thesis(i))}</p><div class="concept-material" lang="en" dir="ltr">${esc(c.material)}</div></div></article>`,
    )
    .join("");
  $("#rankings").innerHTML =
    `<div class="ranking-intro"><p class="eyebrow">DESIGN REVIEW / 01</p><h2>${copy().rankTitle}</h2><p>${copy().rankIntro}</p></div>` +
    rankOrder
      .map(
        (i, r) =>
          `<article class="rank-row"><span class="rank-num">${String(r + 1).padStart(2, "0")}</span>${card(i)}<div><h3>${esc(name(i))}</h3><p lang="en" dir="ltr">${esc(concepts[i].rank)}</p></div><button data-open="${i}">${copy().inspectButton} ↗</button></article>`,
      )
      .join("");
}
function translate() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  document.querySelectorAll("[data-t]").forEach((el) => (el.innerHTML = copy()[el.dataset.t]));
  $("#theme span").textContent =
    copy()[document.body.classList.contains("light") ? "darkSurround" : "surround"];
  renderGallery();
  if ($("#detail").open) fillDetail();
}
function fillDetail() {
  const c = concepts[selected];
  $("#detail-title").textContent = name(selected);
  $("#detail-thesis").textContent = thesis(selected);
  $("#detail-label").textContent =
    `${copy().detailLabel} ${String(selected + 1).padStart(2, "0")} / 10`;
  $("#detail-count").textContent = `BOTOLAGO / ${String(selected + 1).padStart(2, "0")} — 10`;
  $("#detail-card").innerHTML = card(selected);
  $("#mini").innerHTML =
    `<div class="mini-row">${compact(selected)}<div class="mini-name">ALI<small>${copy().mini}</small></div><div class="mini-ovr">84<small>PRO</small></div></div>`;
  $("#reasoning").innerHTML =
    `<p class="eyebrow">${copy().notes}</p>` +
    ["emotion", "own", "progress", "risk"]
      .map(
        (key, i) =>
          `<section class="reason"><h4>${copy().reasonLabels[i]}</h4><p lang="en" dir="ltr">${esc(c[key])}</p>${key === "progress" ? '<div class="tier-rail" dir="ltr"><span>HOMA</span><span>STADE</span><span>PRO</span><span>CHAMPION</span><span>LEGEND</span></div>' : ""}</section>`,
      )
      .join("");
}
function openDetail(i) {
  selected = i;
  returnFocus = document.activeElement;
  fillDetail();
  $("#detail").showModal();
  document.body.style.overflow = "hidden";
  $("#close").focus();
}
function closeDetail() {
  $("#detail").close();
}
$("#detail").addEventListener("close", () => {
  document.body.style.overflow = "";
  returnFocus?.focus();
});
document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-open]");
  if (target) openDetail(Number(target.dataset.open));
});
document.querySelectorAll("[data-view]").forEach((button) =>
  button.addEventListener("click", () => {
    view = button.dataset.view;
    document.querySelectorAll("[data-view]").forEach((b) => {
      b.classList.toggle("active", b === button);
      b.setAttribute("aria-pressed", String(b === button));
    });
    renderGallery();
  }),
);
$("#language").addEventListener("change", (e) => {
  language = e.target.value;
  translate();
});
$("#theme").addEventListener("click", () => {
  document.body.classList.toggle("light");
  $("#theme span").textContent =
    copy()[document.body.classList.contains("light") ? "darkSurround" : "surround"];
});
$("#close").addEventListener("click", closeDetail);
function move(n) {
  selected = (selected + n + 10) % 10;
  fillDetail();
  $("#detail").scrollTop = 0;
}
$("#previous").addEventListener("click", () => move(-1));
$("#next").addEventListener("click", () => move(1));
$("#detail").addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") {
    e.preventDefault();
    move(language === "ar" ? -1 : 1);
  }
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    move(language === "ar" ? 1 : -1);
  }
});
$("#detail").addEventListener("click", (e) => {
  if (e.target === $("#detail")) {
    const b = $("#detail").getBoundingClientRect();
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom)
      closeDetail();
  }
});
translate();
// Non-production export for deterministic local capture and review.
window.ManagerCardLab = { card, concepts, rankOrder, openDetail, compact };
