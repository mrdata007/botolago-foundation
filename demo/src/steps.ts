/**
 * The seven stops of the pitch, in order. The presenter page reads this list
 * (the build injects it), so the steps and their talking points live in one
 * place. Talking points are French and English; the app itself switches
 * between French and Arabic.
 */
export interface DemoStep {
  id: string;
  path: string;
  title: { fr: string; en: string };
  lead: { fr: string; en: string };
  tip: { fr: string; en: string };
}

export const DEMO_STEPS: DemoStep[] = [
  {
    id: "welcome",
    path: "/",
    title: { fr: "Bienvenue", en: "Welcome" },
    lead: {
      fr: "La porte d’entrée de BotolaGO : l’actualité, les matchs et le Fantasy du football marocain, en français et en arabe.",
      en: "BotolaGO’s front door: Moroccan football news, matches and Fantasy, in French and Arabic.",
    },
    tip: {
      fr: "Touchez « Explorer BotolaGO ».",
      en: "Tap “Explorer BotolaGO”.",
    },
  },
  {
    id: "hub",
    path: "/fantasy",
    title: { fr: "Le hub Fantasy", en: "Fantasy hub" },
    lead: {
      fr: "La journée en cours, sa date limite et le compte à rebours. La journée porte le nom d’un partenaire, et un nouveau manager crée son équipe en un geste.",
      en: "The current gameweek, its deadline and a live countdown. The gameweek carries a partner’s name, and a new manager builds a team in one tap.",
    },
    tip: {
      fr: "Touchez « Créer mon équipe ».",
      en: "Tap “Créer mon équipe” (create my team).",
    },
  },
  {
    id: "build",
    path: "/fantasy/create",
    title: { fr: "Vos 11 joueurs", en: "Pick your 11" },
    lead: {
      fr: "Les vrais effectifs 2026/27 de la Botola Pro : 603 joueurs, 16 clubs. Un budget de 80 M, trois joueurs au plus par club, et un capitaine dont les points comptent double.",
      en: "The real 2026/27 Botola Pro squads: 603 players across 16 clubs. An 80M budget, at most three players per club, and a captain whose points count double.",
    },
    tip: {
      fr: "Touchez un maillot vide pour choisir un joueur, ou « Compléter l’équipe » pour aller vite. Touchez ensuite un joueur pour le nommer capitaine.",
      en: "Tap an empty shirt to pick a player, or “Complete the team” to go fast. Then tap a player to make them captain.",
    },
  },
  {
    id: "points",
    path: "/fantasy/points",
    title: { fr: "Vos points", en: "Your points" },
    lead: {
      fr: "La journée 12 est jouée. Chaque but, passe décisive, clean sheet ou carton devient des points, calculés par le moteur de score de BotolaGO.",
      en: "Gameweek 12 has been played. Every goal, assist, clean sheet or card becomes points, worked out by BotolaGO’s own scoring engine.",
    },
    tip: {
      fr: "Passez en vue « Liste » pour le détail de chaque joueur.",
      en: "Switch to “Liste” (list) for each player’s breakdown.",
    },
  },
  {
    id: "table",
    path: "/matches/standings",
    title: { fr: "Classement Botola", en: "League table" },
    lead: {
      fr: "Le classement de la Botola Pro, recalculé à chaque résultat, avec les places continentales et la relégation, à domicile, à l’extérieur et la forme.",
      en: "The Botola Pro table, recalculated after every result, with the continental and relegation places, home, away and form.",
    },
    tip: {
      fr: "Touchez « Forme » pour les cinq derniers résultats de chaque club.",
      en: "Tap “Forme” (form) for each club’s last five results.",
    },
  },
  {
    id: "leaderboard",
    path: "/fantasy/rankings",
    title: { fr: "Classement des managers", en: "Leaderboard" },
    lead: {
      fr: "Le rang du manager dans la journée et sur la saison, face à tous les autres. C’est ce qui fait revenir les fans chaque semaine.",
      en: "The manager’s rank this gameweek and over the season, against everyone else. It is what brings fans back every week.",
    },
    tip: {
      fr: "Passez de « Journée » à « Général ».",
      en: "Switch between “Journée” (gameweek) and “Général” (overall).",
    },
  },
  {
    id: "sponsor",
    path: "/prizes",
    title: { fr: "Partenaire", en: "Sponsor" },
    lead: {
      fr: "Une marque s’installe dans le jeu : la journée présentée par, le classement présenté par, les lots offerts par.",
      en: "A brand lives inside the game: the gameweek presented by, the leaderboard presented by, the prizes offered by.",
    },
    tip: {
      fr: "Saisissez le nom du partenaire et ajoutez son logo : chaque emplacement se met à jour.",
      en: "Type the partner’s name and add their logo: every placement updates live.",
    },
  },
];

export function stepIndexForPath(path: string): number {
  return DEMO_STEPS.findIndex((step) => step.path === path);
}
