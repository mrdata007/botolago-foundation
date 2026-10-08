/* Onboarding fixtures: sample managers in every card state (ONBOARDING_PLAN.md section 7).
   Each is labelled "sample". `profile` is what a card object draws (CONTRACT.md "Onboarding
   states"); `ctx` is what the screen around it knows. Serials never start with a zero (D14). */
(function () {
  const MC = window.MC;
  const ONB = (MC.ONB = MC.ONB || {});

  const SERIAL = "482913";
  const ALI = { lat: "ALI", ar: "علي" };
  const EMPTY = Object.freeze({ CAP: null, SEL: null, TRF: null, CON: null });
  const FULL = Object.freeze({ CAP: 91, SEL: 82, TRF: 86, CON: 78 });

  /** A profile built on MC.ALI (country, season, club) with the onboarding fields set. */
  const card = (over) =>
    Object.freeze({
      ...MC.ALI,
      name: ALI,
      ovr: null,
      tier: null,
      provisional: false,
      counted: 0,
      minRated: 3,
      minFinal: 5,
      serial: SERIAL,
      id: "BOT #" + SERIAL,
      founder: null,
      stats: EMPTY,
      statReason: {},
      ...over,
    });

  const base = {
    feature: true,
    online: true,
    audience: "manager",
    firstGw: 5,
    ratingGws: [5, 6, 7],
    deadline: { lat: "sam. 16:30", ar: "السبت 16:30" },
    pending: [],
  };
  const fx = (label, profile, ctx = {}) =>
    Object.freeze({ label, sample: true, profile, ctx: { ...base, ...ctx } });

  ONB.SERIAL = SERIAL;
  ONB.FIX = {
    guest: fx("Guest, before naming", card({ name: null, serial: null, id: null, club: null }), {
      audience: "guest",
    }),
    signedNoTeam: fx("Signed in, no squad yet", card({ serial: null, id: null, club: null }), {
      audience: "signedNoTeam",
    }),
    clubNull: fx("Signed in, club skipped", card({ serial: null, id: null, club: null }), {
      audience: "signedNoTeam",
    }),
    born0: fx("Squad saved, serial not yet assigned", card({ serial: null, id: null }), {
      pending: ["card_created"],
      nextGw: 5,
    }),
    born0Serial: fx("Squad saved, serial assigned", card({}), {
      pending: ["card_created"],
      nextGw: 5,
    }),
    forming1: fx("Forming, 1 of 3", card({ counted: 1 }), { nextGw: 6 }),
    eve2: fx("Eve of the first rating, 2 of 3, J7 locked", card({ counted: 2 }), {
      nextGw: 7,
      nextGwState: "locked",
    }),
    notFinal2: fx("J7 over, not final yet, 2 of 3", card({ counted: 2 }), {
      nextGw: 7,
      nextGwState: "provisional",
    }),
    insufficient3: fx(
      "3 of 3 counted, rating still waits for a stat",
      card({
        counted: 3,
        stats: { CAP: 91, SEL: 82, TRF: null, CON: null },
        statReason: { TRF: "no_transfers", CON: "pending_minimum" },
      }),
      { nextGw: 8, ovrNullReason: "too_few_stats" },
    ),
    rated: fx(
      "First rating, provisional",
      card({ ovr: 84, tier: "PRO", provisional: true, counted: 3, stats: FULL }),
      {
        pending: ["first_rating"],
        firstRatedGw: 7,
        latestGw: 7,
        nextGw: 8,
      },
    ),
    ratedTrfNull: fx(
      "First rating, no transfer yet (TRF empty)",
      card({
        ovr: 84,
        tier: "PRO",
        provisional: true,
        counted: 3,
        stats: { CAP: 91, SEL: 82, TRF: null, CON: 78 },
        statReason: { TRF: "no_transfers" },
      }),
      { pending: ["first_rating"], firstRatedGw: 7, latestGw: 7, nextGw: 8 },
    ),
    cleared: fx(
      "No longer provisional",
      card({ ovr: 85, tier: "PRO", counted: 5, stats: { ...FULL, SEL: 84 } }),
      {
        pending: ["provisional_cleared"],
        firstRatedGw: 7,
        latestGw: 9,
      },
    ),
    tierUp: fx(
      "First time at CHAMPION",
      card({
        ovr: 88,
        tier: "CHAMPION",
        counted: 8,
        stats: { CAP: 94, SEL: 86, TRF: 89, CON: 83 },
      }),
      {
        pending: ["tier_changed:champion"],
        previousTier: "PRO",
        latestGw: 12,
      },
    ),
    tierDown: fx(
      "Fell to STADE",
      card({ ovr: 79, tier: "STADE", counted: 9, stats: { CAP: 84, SEL: 76, TRF: 81, CON: 75 } }),
      {
        previousTier: "PRO",
        latestGw: 13,
      },
    ),
    founder: fx(
      "Founder granted",
      card({ ovr: 84, tier: "PRO", counted: 6, stats: FULL, founder: 2026 }),
      {
        pending: ["founder_granted"],
        latestGw: 10,
      },
    ),
    seasonClosed: fx(
      "Season 2026/27 closed",
      card({ ovr: 86, tier: "PRO", counted: 30, stats: { CAP: 92, SEL: 84, TRF: 88, CON: 80 } }),
      {
        pending: ["season_closed"],
        latestGw: 30,
        seasonGws: 30,
      },
    ),
    seasonStarted: fx(
      "New season 2027/28, forming, last season shown",
      card({ season: "2027/28", counted: 0 }),
      {
        pending: ["season_started"],
        previousSeason: { season: "2026/27", ovr: 86, tier: "PRO" },
        nextGw: 1,
        firstGw: 1,
        ratingGws: [1, 2, 3],
      },
    ),
    launchArrival: fx(
      "Launch: existing manager, already rated",
      card({ ovr: 84, tier: "PRO", counted: 7, stats: FULL }),
      {
        pending: ["card_created", "first_rating"],
        firstRatedGw: 7,
        latestGw: 7,
      },
    ),
    returning: fx(
      "Returning: first rating 84 at J3, today 81",
      card({ ovr: 81, tier: "STADE", counted: 6, stats: { CAP: 86, SEL: 79, TRF: 80, CON: 77 } }),
      {
        pending: ["first_rating", "provisional_cleared"],
        firstRating: { ovr: 84, gw: 3, tier: "PRO" },
        latestGw: 6,
      },
    ),
    offline: fx(
      "Card read failed",
      card({ ovr: 84, tier: "PRO", provisional: true, counted: 3, stats: FULL }),
      { online: false },
    ),
    featureOff: fx(
      "Feature switched off",
      card({ ovr: 84, tier: "PRO", provisional: true, counted: 3, stats: FULL }),
      {
        feature: false,
      },
    ),
  };
  /** Fixtures that draw a card object (the guest's is unnamed and local). */
  ONB.CARD_FIXTURES = Object.keys(ONB.FIX).filter((k) => k !== "featureOff" && k !== "offline");
})();
