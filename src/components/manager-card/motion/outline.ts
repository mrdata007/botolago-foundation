/** The card's cut-cornered outline in percentages (the corner is 13 % of the width, 8.03 % of the height). */
const CUT_X = 13;
const CUT_Y = 8.03;

export const cardOutline = (rtl: boolean): string =>
  rtl
    ? `polygon(0 0, 100% 0, 100% 100%, ${CUT_X}% 100%, 0 ${100 - CUT_Y}%)`
    : `polygon(0 0, 100% 0, 100% ${100 - CUT_Y}%, ${100 - CUT_X}% 100%, 0 100%)`;
