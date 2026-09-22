import type {
  FantasyPlayer,
  FantasyTeam,
  FixtureDifficulty,
  GameweekResult,
  League,
  LeagueStanding,
  PlayerPointsBreakdown,
} from "@/types/fantasy";
import { clubs } from "@/mocks/data";

// Build a broad player pool: for each club, generate 3 players per position
// so squad-building is realistic. Prices/points/form vary.

type Seed = {
  fr: string;
  ar: string;
  pos: "GK" | "DEF" | "MID" | "FWD";
  price: number;
  form: number;
  pts: number;
  own: number;
  status?: FantasyPlayer["status"];
  xp?: number;
};

const clubPlayers: Record<string, Seed[]> = {
  war: [
    {
      fr: "Ahmed Reda Tagnaouti",
      ar: "أحمد رضا تكناوتي",
      pos: "GK",
      price: 5.0,
      form: 5.2,
      pts: 82,
      own: 28.4,
    },
    { fr: "Adam Aznou", ar: "آدم أزنو", pos: "DEF", price: 4.9, form: 5.6, pts: 74, own: 15.1 },
    {
      fr: "Yahya Attiat-Allah",
      ar: "يحيى عطية الله",
      pos: "DEF",
      price: 6.2,
      form: 6.4,
      pts: 87,
      own: 42.1,
    },
    {
      fr: "Mohamed Nahiri",
      ar: "محمد ناهيري",
      pos: "DEF",
      price: 5.5,
      form: 5.1,
      pts: 71,
      own: 21.8,
      status: "doubtful",
    },
    { fr: "Reda Jaadi", ar: "رضا جعدي", pos: "MID", price: 6.8, form: 6.9, pts: 88, own: 24.6 },
    {
      fr: "Zouhair El Moutaraji",
      ar: "زهير المتراجي",
      pos: "MID",
      price: 7.4,
      form: 7.1,
      pts: 95,
      own: 33.2,
    },
    { fr: "Bouly Sambou", ar: "بولي سامبو", pos: "FWD", price: 8.0, form: 7.2, pts: 96, own: 31.5 },
    {
      fr: "Cassius Mailula",
      ar: "كاسيوس ماييولا",
      pos: "FWD",
      price: 7.6,
      form: 6.5,
      pts: 82,
      own: 18.9,
    },
  ],
  rca: [
    { fr: "Anas Zniti", ar: "أنس زنيتي", pos: "GK", price: 4.8, form: 4.9, pts: 76, own: 19.7 },
    {
      fr: "Mohsine Moutouali",
      ar: "محسن متولي",
      pos: "DEF",
      price: 5.3,
      form: 5.4,
      pts: 72,
      own: 12.6,
    },
    {
      fr: "Abdelhak Ben Nasser",
      ar: "عبد الحق بن ناصر",
      pos: "DEF",
      price: 5.1,
      form: 4.8,
      pts: 68,
      own: 10.1,
    },
    {
      fr: "Abdelilah Hafidi",
      ar: "عبد الإله حافظي",
      pos: "MID",
      price: 7.1,
      form: 6.2,
      pts: 82,
      own: 24.3,
      status: "injured",
    },
    {
      fr: "Nassim Boujellab",
      ar: "نسيم بوجلاب",
      pos: "MID",
      price: 6.9,
      form: 6.4,
      pts: 84,
      own: 22.0,
    },
    { fr: "Ben Malango", ar: "بن مالانغو", pos: "FWD", price: 8.9, form: 7.9, pts: 104, own: 38.4 },
    {
      fr: "Ayoub El Kaabi",
      ar: "أيوب الكعبي",
      pos: "FWD",
      price: 9.5,
      form: 8.6,
      pts: 118,
      own: 51.2,
      xp: 8.4,
    },
    {
      fr: "Yassine Meriah",
      ar: "ياسين مرياح",
      pos: "DEF",
      price: 4.6,
      form: 4.5,
      pts: 61,
      own: 8.4,
    },
  ],
  asfar: [
    {
      fr: "Anas Bach",
      ar: "أنس باش",
      pos: "GK",
      price: 5.2,
      form: 6.0,
      pts: 89,
      own: 34.5,
      xp: 5.1,
    },
    { fr: "Achraf Dari", ar: "أشرف داري", pos: "DEF", price: 6.0, form: 6.6, pts: 91, own: 39.2 },
    {
      fr: "Anass Salah-Eddine",
      ar: "أنس صلاح الدين",
      pos: "DEF",
      price: 5.7,
      form: 6.1,
      pts: 79,
      own: 22.7,
    },
    {
      fr: "Ismael Baouf",
      ar: "إسماعيل باعوف",
      pos: "DEF",
      price: 4.9,
      form: 5.3,
      pts: 70,
      own: 14.0,
    },
    {
      fr: "Mohamed Rabie Hrimat",
      ar: "محمد ربيع حريمات",
      pos: "MID",
      price: 6.7,
      form: 6.8,
      pts: 78,
      own: 19.5,
    },
    {
      fr: "Oussama Lamlaoui",
      ar: "أسامة لملاوي",
      pos: "MID",
      price: 7.0,
      form: 7.4,
      pts: 92,
      own: 27.9,
    },
    {
      fr: "Sabir Bougrine",
      ar: "صابر بوكرين",
      pos: "FWD",
      price: 7.8,
      form: 7.6,
      pts: 98,
      own: 29.1,
    },
  ],
  fus: [
    { fr: "Ayoub Lakred", ar: "أيوب لكرد", pos: "GK", price: 4.4, form: 4.6, pts: 63, own: 6.8 },
    {
      fr: "Marouane Saadane",
      ar: "مروان سعدان",
      pos: "DEF",
      price: 4.5,
      form: 4.7,
      pts: 62,
      own: 5.9,
    },
    {
      fr: "Youssef El Fahli",
      ar: "يوسف الفهلي",
      pos: "DEF",
      price: 4.7,
      form: 4.9,
      pts: 66,
      own: 7.1,
    },
    {
      fr: "Zakaria Draoui",
      ar: "زكرياء الدراوي",
      pos: "MID",
      price: 6.0,
      form: 6.0,
      pts: 74,
      own: 12.3,
    },
    { fr: "Reda Slim", ar: "رضا سليم", pos: "MID", price: 6.4, form: 6.3, pts: 80, own: 15.4 },
    { fr: "Ilias Haddad", ar: "إلياس حداد", pos: "FWD", price: 7.2, form: 6.9, pts: 85, own: 18.3 },
  ],
  rsb: [
    {
      fr: "Munir Mohamedi",
      ar: "منير محمدي",
      pos: "GK",
      price: 4.6,
      form: 5.0,
      pts: 71,
      own: 11.2,
    },
    {
      fr: "Issoufou Dayo",
      ar: "إيسوفو دايو",
      pos: "DEF",
      price: 5.4,
      form: 5.7,
      pts: 76,
      own: 17.8,
    },
    {
      fr: "Mehdi Attouchi",
      ar: "مهدي عتوشي",
      pos: "DEF",
      price: 5.0,
      form: 5.2,
      pts: 69,
      own: 9.6,
    },
    {
      fr: "Bakr El Helali",
      ar: "بكر الهلالي",
      pos: "MID",
      price: 6.5,
      form: 6.5,
      pts: 81,
      own: 20.5,
    },
    { fr: "Youssef Mehri", ar: "يوسف مهري", pos: "MID", price: 6.2, form: 5.9, pts: 72, own: 13.7 },
    {
      fr: "Youssoupha Mbodji",
      ar: "يوسوفا مبودجي",
      pos: "FWD",
      price: 7.5,
      form: 7.0,
      pts: 90,
      own: 24.4,
    },
  ],
  mat: [
    { fr: "Mehdi Benabid", ar: "مهدي بنعبيد", pos: "GK", price: 4.3, form: 4.4, pts: 58, own: 5.1 },
    {
      fr: "Anass Serrhir",
      ar: "أنس السرغيني",
      pos: "DEF",
      price: 4.4,
      form: 4.6,
      pts: 60,
      own: 5.5,
    },
    {
      fr: "Mohamed Aabid",
      ar: "محمد عابد",
      pos: "MID",
      price: 5.8,
      form: 5.7,
      pts: 68,
      own: 8.9,
      status: "suspended",
    },
    { fr: "Youssef Fakhr", ar: "يوسف فخر", pos: "FWD", price: 6.8, form: 6.2, pts: 74, own: 12.6 },
  ],
  hus: [
    { fr: "Mohamed Amsif", ar: "محمد أمصيف", pos: "GK", price: 4.5, form: 4.8, pts: 65, own: 8.0 },
    { fr: "Aziz Boura", ar: "عزيز بورة", pos: "DEF", price: 4.6, form: 4.8, pts: 64, own: 6.4 },
    {
      fr: "Mohamed Ali Bemammer",
      ar: "محمد علي بامامر",
      pos: "MID",
      price: 6.1,
      form: 6.0,
      pts: 76,
      own: 14.2,
    },
    {
      fr: "Karim El Berkaoui",
      ar: "كريم البركاوي",
      pos: "FWD",
      price: 7.0,
      form: 6.6,
      pts: 82,
      own: 16.1,
    },
  ],
  moas: [
    {
      fr: "Zouhir Laâroubi",
      ar: "زهير العروبي",
      pos: "GK",
      price: 4.2,
      form: 4.3,
      pts: 55,
      own: 4.2,
    },
    {
      fr: "Rabii Alhous",
      ar: "الربيع الحوس",
      pos: "DEF",
      price: 4.5,
      form: 4.6,
      pts: 61,
      own: 6.0,
    },
    { fr: "Amine Bassi", ar: "أمين باسي", pos: "MID", price: 5.9, form: 5.8, pts: 70, own: 10.7 },
    { fr: "Ayoub Nanah", ar: "أيوب نانا", pos: "FWD", price: 6.5, form: 6.0, pts: 71, own: 11.4 },
  ],
};

// Build fantasyPlayers array with deterministic ids p<clubIdx>_<i>
export const fantasyPlayers: FantasyPlayer[] = [];
Object.entries(clubPlayers).forEach(([clubId, seeds], ci) => {
  seeds.forEach((s, i) => {
    // pick a next opponent from the clubs list (rotate)
    const opponents = clubs.filter((c) => c.id !== clubId);
    const opp = opponents[(ci + i) % opponents.length];
    const difficulty = (((ci + i) % 5) + 1) as 1 | 2 | 3 | 4 | 5;
    fantasyPlayers.push({
      id: `fp_${clubId}_${i + 1}`,
      name: { fr: s.fr, ar: s.ar },
      clubId,
      position: s.pos,
      price: s.price,
      totalPoints: s.pts,
      form: s.form,
      ownership: s.own,
      status: s.status ?? "available",
      nextOpponentClubId: opp.id,
      nextIsHome: (ci + i) % 2 === 0,
      nextFixtureDifficulty: difficulty,
      expectedPoints:
        s.xp ??
        Math.round((s.form * 0.9 + (s.pos === "FWD" ? 2 : s.pos === "MID" ? 1.4 : 1)) * 10) / 10,
      chanceOfPlaying:
        s.status === "injured"
          ? 0
          : s.status === "doubtful"
            ? 50
            : s.status === "suspended"
              ? 0
              : 100,
      news:
        s.status === "injured"
          ? {
              fr: "Blessure musculaire — indisponible cette journée.",
              ar: "إصابة عضلية — غائب هذه الجولة.",
            }
          : s.status === "doubtful"
            ? {
                fr: "Incertain — test décisif à l'entraînement.",
                ar: "مشكوك في مشاركته — التداريب الأخيرة حاسمة.",
              }
            : s.status === "suspended"
              ? { fr: "Suspendu (cumul de cartons).", ar: "موقوف بسبب تراكم البطاقات." }
              : undefined,
    });
  });
});

export function getFP(id: string): FantasyPlayer | undefined {
  return fantasyPlayers.find((p) => p.id === id);
}

// A default 15-man squad the user "owns"
const pickIds = (clubId: string, pos: string, n: number) =>
  fantasyPlayers
    .filter((p) => p.clubId === clubId && p.position === pos)
    .slice(0, n)
    .map((p) => p.id);

const squadIds: string[] = [
  // GK (2)
  ...pickIds("asfar", "GK", 1),
  ...pickIds("war", "GK", 1),
  // DEF (5)
  ...pickIds("war", "DEF", 2),
  ...pickIds("asfar", "DEF", 2),
  ...pickIds("rsb", "DEF", 1),
  // MID (5)
  ...pickIds("rca", "MID", 2),
  ...pickIds("war", "MID", 2),
  ...pickIds("fus", "MID", 1),
  // FWD (3)
  ...pickIds("rca", "FWD", 2),
  ...pickIds("war", "FWD", 1),
];

// Ensure exactly 15 (fallback fill)
while (squadIds.length < 15) {
  const filler = fantasyPlayers.find((p) => !squadIds.includes(p.id));
  if (!filler) break;
  squadIds.push(filler.id);
}

// Formation 4-4-2: XI slots 1..11 : 1=GK, 2-5=DEF, 6-9=MID, 10-11=FWD, bench 12=GK,13-15=outfield
export const fantasyTeam: FantasyTeam = {
  managerName: "BotolaGO Manager",
  teamName: "Atlas XI",
  formation: "4-4-2",
  bank: 1.4,
  freeTransfers: 1,
  pendingTransfers: 0,
  squad: [
    { playerId: squadIds[0], slot: 1 }, // GK1
    { playerId: squadIds[2], slot: 2 }, // DEF
    { playerId: squadIds[3], slot: 3 },
    { playerId: squadIds[4], slot: 4 },
    { playerId: squadIds[5], slot: 5 },
    { playerId: squadIds[7], slot: 6 }, // MID
    { playerId: squadIds[8], slot: 7 },
    { playerId: squadIds[9], slot: 8 },
    { playerId: squadIds[10], slot: 9 },
    { playerId: squadIds[12], slot: 10, isCaptain: true }, // FWD - captain
    { playerId: squadIds[13], slot: 11, isViceCaptain: true },
    // bench
    { playerId: squadIds[1], slot: 12 }, // sub GK
    { playerId: squadIds[6], slot: 13 }, // sub DEF
    { playerId: squadIds[11], slot: 14 }, // sub MID
    { playerId: squadIds[14], slot: 15 }, // sub FWD
  ],
};

// League data
export const leagues: League[] = [
  {
    id: "lg1",
    name: "Casablanca Derby",
    type: "private",
    members: 24,
    rank: 3,
    previousRank: 5,
    score: 612,
    leaderName: "Youssef A.",
    code: "CASA-24",
  },
  {
    id: "lg2",
    name: "Amis du Wydad",
    type: "private",
    members: 12,
    rank: 1,
    previousRank: 2,
    score: 612,
    leaderName: "You",
    code: "WYDAD-12",
  },
  {
    id: "lg3",
    name: "BotolaGO Officielle",
    type: "public",
    members: 18420,
    rank: 12483,
    previousRank: 15100,
    score: 612,
    leaderName: "Karim F.",
  },
  {
    id: "lg4",
    name: "Overall",
    type: "public",
    members: 142310,
    rank: 12483,
    previousRank: 15100,
    score: 612,
    leaderName: "Achraf B.",
  },
  {
    id: "lg5",
    name: "Coupe BotolaGO",
    type: "cup",
    members: 128,
    rank: 41,
    previousRank: 60,
    score: 58,
    leaderName: "—",
  },
];

export const leagueStandings: Record<string, LeagueStanding[]> = {
  lg1: [
    {
      managerId: "m1",
      managerName: "Youssef A.",
      teamName: "Aigles de Casa",
      rank: 1,
      previousRank: 1,
      gameweekScore: 74,
      totalScore: 680,
    },
    {
      managerId: "m2",
      managerName: "Salma B.",
      teamName: "Green Machine",
      rank: 2,
      previousRank: 3,
      gameweekScore: 69,
      totalScore: 651,
    },
    {
      managerId: "me",
      managerName: "You",
      teamName: "Atlas XI",
      rank: 3,
      previousRank: 5,
      gameweekScore: 58,
      totalScore: 612,
    },
    {
      managerId: "m4",
      managerName: "Karim F.",
      teamName: "Rabat Rebels",
      rank: 4,
      previousRank: 2,
      gameweekScore: 41,
      totalScore: 605,
    },
    {
      managerId: "m5",
      managerName: "Nadia E.",
      teamName: "Berkane FC",
      rank: 5,
      previousRank: 4,
      gameweekScore: 52,
      totalScore: 590,
    },
  ],
  lg2: [
    {
      managerId: "me",
      managerName: "You",
      teamName: "Atlas XI",
      rank: 1,
      previousRank: 2,
      gameweekScore: 58,
      totalScore: 612,
    },
    {
      managerId: "m6",
      managerName: "Anas M.",
      teamName: "Rouge & Blanc",
      rank: 2,
      previousRank: 1,
      gameweekScore: 55,
      totalScore: 601,
    },
    {
      managerId: "m7",
      managerName: "Hicham T.",
      teamName: "Derby Kings",
      rank: 3,
      previousRank: 4,
      gameweekScore: 62,
      totalScore: 588,
    },
  ],
};

// Points breakdown for GW14 (current)
const captainId = fantasyTeam.squad.find((s) => s.isCaptain)!.playerId;
export const currentGameweekBreakdown: PlayerPointsBreakdown[] = fantasyTeam.squad.map((s, i) => {
  const bench = s.slot >= 12;
  const base = 2; // appearance
  const goals = i % 4 === 0 && !bench ? 1 : 0;
  const assists = i % 5 === 0 && !bench ? 1 : 0;
  const cs =
    fantasyPlayers.find((p) => p.id === s.playerId)?.position !== "FWD" && i % 3 === 0 && !bench
      ? 1
      : 0;
  const bonus = i === 0 ? 3 : i === 4 ? 2 : i === 8 ? 1 : 0;
  // BG-0075: one line per scoring category, already multiplied out — the same
  // shape `app.fantasy_player_point_events` stores and `scorePlayerFixture`
  // emits. The old shape invented a `kind` union and a separate `count`
  // multiplier that no backend has ever written.
  const events = [
    { category: "appearance", points: bench ? 0 : base + 1 },
    ...(goals ? [{ category: "goal", points: 5 * goals }] : []),
    ...(assists ? [{ category: "assist", points: 3 * assists }] : []),
    ...(cs ? [{ category: "clean_sheet", points: 4 }] : []),
    ...(bonus ? [{ category: "bonus", points: bonus }] : []),
  ];
  const tp = events.reduce((sum, e) => sum + e.points, 0);
  return {
    playerId: s.playerId,
    totalPoints: s.isCaptain ? tp * 2 : tp,
    minutesPlayed: bench ? 0 : 78 + (i % 3) * 4,
    isCaptain: s.isCaptain,
    isViceCaptain: s.isViceCaptain,
    isBench: bench,
    status: i < 6 ? "final" : i < 10 ? "live" : "provisional",
    events,
  };
});

export const gameweekResults: GameweekResult[] = [
  {
    gameweek: 14,
    totalPoints: currentGameweekBreakdown
      .filter((b) => !b.isBench)
      .reduce((s, b) => s + b.totalPoints, 0),
    benchPoints: currentGameweekBreakdown
      .filter((b) => b.isBench)
      .reduce((s, b) => s + b.totalPoints, 0),
    captainId,
    averagePoints: 46,
    highestPoints: 92,
    autoSubs: [],
    breakdown: currentGameweekBreakdown,
  },
  {
    gameweek: 13,
    totalPoints: 62,
    benchPoints: 3,
    captainId,
    averagePoints: 44,
    highestPoints: 88,
    autoSubs: [],
    breakdown: [],
  },
  {
    gameweek: 12,
    totalPoints: 48,
    benchPoints: 7,
    captainId,
    averagePoints: 41,
    highestPoints: 79,
    autoSubs: [],
    breakdown: [],
  },
  {
    gameweek: 11,
    totalPoints: 71,
    benchPoints: 2,
    captainId,
    averagePoints: 49,
    highestPoints: 96,
    autoSubs: [],
    breakdown: [],
  },
];

// Fixture difficulty matrix: 6 upcoming gameweeks for each club
export const fixtureDifficulties: FixtureDifficulty[] = (() => {
  const out: FixtureDifficulty[] = [];
  const startGW = 14;
  clubs.forEach((c, ci) => {
    for (let g = 0; g < 6; g++) {
      const opp = clubs[(ci + g + 1) % clubs.length];
      // Vary difficulty deterministically
      const diff = (((ci * 3 + g * 2) % 5) + 1) as 1 | 2 | 3 | 4 | 5;
      const isDouble = ci === 1 && g === 2; // RCA has a double gw
      const isBlank = ci === 3 && g === 4; // FUS has a blank
      out.push({
        clubId: c.id,
        gameweek: startGW + g,
        opponentClubId: opp.id,
        isHome: (ci + g) % 2 === 0,
        difficulty: diff,
        isDouble,
        isBlank,
      });
    }
  });
  return out;
})();

// Top 5 players of the week — deterministic mock built off fantasyPlayers.
import type { TopPlayerOfWeek } from "@/types/fantasy";

function pickTop(gw: number): TopPlayerOfWeek[] {
  // BG-0071 — `form` is nullable on the domain model now (null = no gameweek
  // has scored). The mock fixtures always carry a number; `?? 0` keeps this
  // deterministic ordering honest for the shape rather than the data.
  const weight = (player: (typeof fantasyPlayers)[number]) =>
    (player.form ?? 0) + player.ownership / 20;
  const pool = [...fantasyPlayers].sort((a, b) => weight(b) - weight(a));
  const seeds = [
    { g: 2, a: 1, cs: 0, mins: 90, pts: 15 },
    { g: 1, a: 2, cs: 0, mins: 90, pts: 13 },
    { g: 1, a: 1, cs: 1, mins: 90, pts: 12 },
    { g: 0, a: 2, cs: 1, mins: 88, pts: 11 },
    { g: 1, a: 0, cs: 0, mins: 84, pts: 10 },
  ];
  return pool.slice(0, 5).map((p, i) => {
    const s = seeds[i];
    // Clean sheets only meaningful for defenders/GK
    const cs = p.position === "GK" || p.position === "DEF" ? s.cs : 0;
    return {
      playerId: p.id,
      rank: (i + 1) as TopPlayerOfWeek["rank"],
      gameweek: gw,
      weeklyPoints: s.pts + (gw % 3),
      goals: s.g,
      assists: s.a,
      cleanSheets: cs,
      minutes: s.mins,
      price: p.price,
      ownershipPercent: p.ownership,
      form: p.form,
    };
  });
}

export const topPlayersByGameweek: Record<number, TopPlayerOfWeek[]> = {
  12: pickTop(12),
  13: pickTop(13),
  14: pickTop(14),
};
