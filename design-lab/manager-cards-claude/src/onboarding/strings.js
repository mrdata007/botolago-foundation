/* Onboarding strings: every French and Arabic string of ONBOARDING_PLAN.md sections 3, 4 and 5,
   copied as the plan writes them, under the proposed dictionary keys `card.onboarding.<moment>.<name>`
   so the product build can lift them. `app.*` keys are the labels of the mocked app chrome, copied
   from the app's own dictionaries (src/i18n/dictionary-fr.ts, dictionary-ar.ts).

   Placeholders: {n} (min rounds rated, 3), {nf} (min rounds final, 5), {k} (rounds counted),
   {gw} (a gameweek number), {gws} (a gameweek list, see MC.ONB.gwListText), {serial} (BOT #482913),
   {ovr} (84), {first} (a first rating), {tier} (a tier word), {from} (a tier threshold),
   {season} (2026/27), {prev}, {best}, {name}, {names}, {league}, {link}, {date}, {deadline}, {a}, {b}.

   Strings marked "proposed" are not written in the plan (it gives French only, or no text, for
   them) and need the owner's review before the product build uses them.

   env.t(key, vars) returns HTML-escaped text; in Arabic it wraps Western digits and Latin codes
   (BOT #482913, 84 OVR, 2026/27, 1/3, ·26, 16:30) in <bdi dir="ltr">. env.text(key, vars) returns
   the same text with no markup, safe in an attribute. A var made with MC.ONB.raw(html, text) is
   inserted as is. MC.ONB.addStrings({fr: {}, ar: {}}) lets a screen file add or override keys. */
(function () {
  const MC = (window.MC = window.MC || {});
  const ONB = (MC.ONB = MC.ONB || {});

  const P = "card.onboarding.";
  const fr = {
    /* Shared words */
    [P + "common.close"]: "Fermer",
    [P + "common.provisional"]: "Provisoire",
    [P + "common.no_rating"]: "pas encore de note",

    /* M1 · first_contact */
    [P + "m1.intro.title"]: "Votre carte de manager",
    [P + "m1.intro.body"]:
      "Elle démarre avec votre équipe. Sa note arrive après {n} journées terminées.",
    [P + "m1.save.line"]:
      "À l'enregistrement, votre carte de manager démarre avec votre équipe. Sa note arrive après {n} journées terminées.",
    [P + "m1.register.hint"]:
      "Sert de nom affiché sur votre carte et dans les classements. Modifiable à l'étape suivante.",
    [P + "m1.setup.name_hint"]:
      "Ce nom figure sur votre carte et dans les classements. Un prénom ou un surnom suffit.",
    [P + "m1.setup.club_hint"]:
      "Votre club donne sa couleur à votre carte. Modifiable dans votre profil.",
    [P + "m1.builder.line"]: "Compte créé. Il reste à enregistrer votre équipe.",

    /* M2 · card_created */
    [P + "m2.heading"]: "Votre carte de manager",
    [P + "m2.line1"]: "Sa note arrive après {n} journées terminées : {gws}.",
    [P + "m2.line1_from"]: "Sa note arrive après {n} journées terminées, à partir de la J{gw}.",
    [P + "m2.line2"]: "Elle mesurera vos choix : capitaine, titulaires, transferts, régularité.",
    [P + "m2.serial"]: "Son numéro, {serial}, ne changera jamais.",
    [P + "m2.invite"]:
      "Invitez vos amis avant la date limite de la J{gw} : leurs journées compteront en même temps que les vôtres.",
    [P + "m2.invite_button"]: "Inviter des amis",
    [P + "m2.arrival"]:
      "Nouveau : votre carte est calculée à partir de votre équipe. Sa note arrive après {n} journées terminées ({k}/{n}).",

    /* M3 · formation */
    [P + "m3.label"]: "Carte en formation",
    [P + "m3.counter"]: "{k}/{n}",
    [P + "m3.line"]:
      "Note après {n} journées terminées · prochaine : J{gw} · date limite {deadline}",
    [P + "m3.first_counted"]: "Première journée comptée : J{gw}.",
    [P + "m3.eve"]: "Dernière journée avant votre note : J{gw}.",
    [P + "m3.over"]: "J{gw} terminée, pas encore définitive. La note arrive dès qu'elle l'est.",
    [P + "m3.insufficient"]: "{n} journées comptées. La note attend encore une statistique.",
    [P + "m3.late"]: "Saison terminée avant votre première note : elle viendra en {season}.",
    [P + "m3.recap"]: "Journée comptée pour votre carte : {k}/{n}",
    [P + "m3.hint.cap"]: "Votre capitaine compte pour CAP sur votre carte.",
    [P + "m3.hint.sel"]: "Votre onze de départ compte pour SEL.",
    [P + "m3.hint.trf"]: "Vos transferts comptent pour TRF. Sans transfert, TRF reste vide (—).",
    [P + "m3.first_transfer"]: "TRF mesurera ce transfert après {n} journées terminées.",
    [P + "m3.builder.sel"]: "SEL mesurera le choix de vos titulaires.",
    [P + "m3.builder.cap"]: "CAP mesurera vos choix de capitaine, journée après journée.",
    [P + "m3.fact.cap"]: "CAP · votre capitaine : {a} pts, le meilleur de votre XI : {b} pts",
    [P + "m3.fact.sel_excluded"]: "SEL ne compte pas les semaines Bench Boost.",

    /* M4 · first_rating */
    [P + "m4.hero.fresh.label"]: "Première note · J{gw}",
    [P + "m4.hero.fresh.line"]: "Provisoire jusqu'à {nf} journées terminées.",
    [P + "m4.hero.arrival.label"]: "Votre carte de manager est là",
    [P + "m4.hero.arrival.line"]: "Calculée sur {k} journées terminées de votre saison.",
    [P + "m4.hero.coalesced.label"]:
      "Première note : {first} (J{gw}). Aujourd'hui : {ovr}, {tier}.",
    [P + "m4.hero.coalesced.line"]: "Provisoire jusqu'à {nf} journées terminées.",
    [P + "m4.hero.detail"]: "Voir le détail",
    [P + "m4.hero.share"]: "Partager",
    [P + "m4.sheet.heading"]: "Votre première note : {ovr} OVR",
    [P + "m4.sheet.line"]:
      "Provisoire jusqu'à {nf} journées terminées. Elle vient de vos décisions :",
    [P + "m4.sheet.tile.cap"]: "CAP · Vos capitaines",
    [P + "m4.sheet.tile.sel"]: "SEL · Votre onze de départ",
    [P + "m4.sheet.tile.trf"]: "TRF · Vos transferts",
    [P + "m4.sheet.tile.con"]: "CON · Votre régularité",
    [P + "m4.sheet.footer"]: "La note est la moyenne des statistiques disponibles.",
    [P + "m4.sheet.tier_distance"]: "{tier} à partir de {from}.",
    [P + "m4.sheet.share"]: "Partager ma carte",
    [P + "m4.sheet.league"]: "Voir ma ligue",
    [P + "m4.sheet.replay"]: "Revoir",
    // proposed: the plan names the story's aria-label "n sur 3" without writing it out
    [P + "m4.story.progress"]: "{k} sur {n}",

    /* M5 · league and head-to-head */
    [P + "m5.band"]: "Nouvelles notes après la J{gw} : {names}",
    [P + "m5.row.forming"]: "en formation {k}/{n}",
    [P + "m5.hint.compare"]: "Touchez un manager pour comparer vos cartes.",
    [P + "m5.h2h.score"]: "Vous {a} · {name} {b}",
    [P + "m5.h2h.close"]: "Fermer",

    /* M6 · share */
    [P + "m6.whatsapp"]: "WhatsApp",
    [P + "m6.native"]: "Partager l'image",
    [P + "m6.copy"]: "Copier le lien",
    [P + "m6.image.provisional"]: "Note provisoire · J{gw}",
    [P + "m6.msg.league"]:
      "Ma carte BotolaGO : {ovr} (provisoire). Et toi ? Rejoins ma ligue « {league} » : {link}",
    [P + "m6.msg.plain"]: "Ma carte BotolaGO : {ovr}. Et toi ? {link}",

    /* M7 · provisional_cleared */
    [P + "m7.line"]: "Votre note n'est plus provisoire : {ovr} après {nf} journées.",

    /* M8 · tier_changed */
    [P + "m8.up.heading"]: "Votre carte passe {tier}.",
    [P + "m8.up.line"]:
      "{ovr} OVR après la J{gw}. Le palier suit votre note, journée après journée.",
    [P + "m8.view"]: "Voir ma carte",
    [P + "m8.down.line"]: "Palier actuel : {tier}. Meilleur cette saison : {best}.",

    /* M9 · founder_granted */
    [P + "m9.heading"]: "Fondateur 2026",
    [P + "m9.line"]:
      "Votre année s'inscrit après votre nom : {name} ·26. Cette marque a été accordée une seule fois et ne le sera plus.",
    [P + "m9.cutoff"]: "Accordée aux équipes 2026/27 créées avant le {date}.",

    /* M10 · season_closed, season_started */
    [P + "m10.closed"]: "Saison {season} terminée : {ovr}, {tier}. Elle reste sur votre carte.",
    [P + "m10.started"]:
      "Saison {season} : votre carte garde sa note {prev} jusqu'à votre première note de la saison, après {n} journées terminées.",

    /* M12 · card page and replay */
    [P + "m12.replay"]: "Revoir",
    [P + "m12.replay.line"]: "À la J{gw} : {then}. Aujourd'hui : {now}.",
    [P + "m12.item.first_rating"]: "La première note · J{gw}",
    [P + "m12.item.founder"]: "Fondateur 2026",
    [P + "m12.item.tier"]: "Première fois {tier} · J{gw}",
    [P + "m12.item.season"]: "Saison {season}",
    // proposed: the card page's history heading is named in the plan, not written
    [P + "m12.history"]: "Historique",

    /* Section 4 · states and edges */
    [P + "state.no_rating"]: "pas encore de note",
    [P + "state.trf.no_transfers"]: "pas encore de transfert",
    [P + "state.trf.window_open"]: "calculé {n} journées après le transfert",
    // proposed: the plan says "the server's reason code" without wording
    [P + "state.reason.pending_minimum"]: "pas encore assez de journées",
    [P + "state.reason.excluded_weeks_only"]: "semaines non comptées",
    [P + "state.reason.board_not_final"]: "classement pas encore définitif",
    [P + "state.cap.default_captain"]: "J{gw} non comptée : capitaine attribué par défaut.",
    [P + "state.deletion"]:
      "Votre carte de manager et son numéro {serial} seront supprimés. Ce numéro ne sera jamais réattribué.",
    // proposed: the plan says the serial part is dropped when the serial is null
    [P + "state.deletion_noserial"]: "Votre carte de manager sera supprimée.",
    [P + "state.offline.text"]: "Impossible de charger votre carte.",
    [P + "state.offline.retry"]: "Réessayer",

    /* App chrome (mocked) */
    "app.nav.primary": "Navigation principale",
    "app.nav.home": "Accueil",
    "app.nav.news": "Actualités",
    "app.nav.fantasy": "Fantasy",
    "app.nav.matches": "Matches",
    "app.nav.pepites": "Pépites",
    "app.nav.profile": "Profil",
    "app.search": "Rechercher",
    "app.notifications": "Notifications",
    "app.language": "Langue",
    "app.fantasy.title": "Fantasy",
    "app.back": "Retour",
    "app.close": "Fermer",
    "app.loading": "Chargement…",
    "app.gameweek": "Journée",
    "app.deadline": "Date limite",
    "app.next_deadline": "Prochaine date limite",
    "app.hours": "Heures",
    "app.minutes": "Minutes",
    "app.seconds": "Secondes",
    "app.value": "Valeur",
    "app.bank": "Banque",
    "app.rank": "Rang",
    "app.average": "Moyenne",
    "app.highest": "Meilleur",
    "app.total": "Total",
    "app.gw_points": "Points de la journée",
    "app.points": "Points",
    "app.my_points": "Mes points J{gw}",
    "app.my_players": "Mes joueurs en J{gw}",
    "app.no_match": "Pas de match",
    "app.transfers": "Transferts",
    "app.free_transfers": "Transferts gratuits",
    "app.pick_team": "Composer l’équipe",
    "app.create_team": "Créer mon équipe",
    "app.enter_squad": "Entrer l’effectif",
    "app.captain": "Capitaine",
    "app.vice_captain": "Vice-capitaine",
    "app.team_name_label": "Nom de l'équipe",
    "app.create.guest_note":
      "Votre brouillon est gardé sur cet appareil. Un compte gratuit est demandé à l’enregistrement.",
    "app.create.sign_in_reason":
      "Créez un compte gratuit ou connectez-vous pour enregistrer votre équipe.",
    "app.no_team_yet": "Vous n’avez pas encore d’équipe.",
    "app.my_leagues": "Mes ligues",
    "app.general_leagues": "Ligues générales",
    "app.private_leagues": "Ligues privées",
    "app.overall": "Général",
    "app.join_leagues": "Rejoindre des ligues",
    "app.configure_leagues": "Gérer les ligues",
    "app.create_invite": "Créer une ligue et inviter",
    "app.cups": "Coupes",
    "app.members": "membres",
    "app.leader": "Leader",
    "app.view_all": "Tout voir",
    "app.rules": "Règles du jeu",
    "app.shortcut.fixtures": "Calendrier",
    "app.shortcut.fdr": "Difficulté des matchs",
    "app.shortcut.stats": "Statistiques joueurs",
    "app.shortcut.top": "Meilleurs joueurs",
    "app.intro.title": "Devenez manager en Botola Pro",
    "app.intro.lede":
      "BotolaGO Fantasy est un jeu gratuit : vos joueurs de Botola Pro vous rapportent des points selon leurs vrais matchs, journée après journée, et vous défiez vos amis dans des ligues privées.",
    "app.intro.prizes": "Des lots récompensent les meilleurs managers.",
    "app.intro.how_title": "Comment ça marche",
    "app.intro.squad_title": "Un effectif de {size} joueurs",
    "app.intro.squad_body":
      "2 gardiens, 5 défenseurs, 5 milieux et 3 attaquants, dont 11 titulaires à aligner à chaque journée.",
    "app.intro.budget_title": "Un budget de {budget} M",
    "app.intro.budget_body":
      "Chaque joueur a son prix, et {max} joueurs au maximum par club : à vous de trouver le bon équilibre.",
    "app.intro.captain_title": "Un capitaine qui compte double",
    "app.intro.captain_body":
      "Choisissez-le à chaque journée : ses points sont doublés. S’il ne joue pas, le vice-capitaine prend le relais.",
    "app.intro.deadline_title": "Une date limite par journée",
    "app.intro.deadline_body":
      "Transferts, titulaires et capitaine se règlent avant la date limite. Ensuite, votre équipe est verrouillée jusqu’à la fin de la journée.",
    "app.intro.sign_in_note":
      "Composez votre équipe dès maintenant : un compte gratuit n’est demandé qu’au moment d’enregistrer.",
    "app.register.full_name": "Nom complet",
    "app.setup.step": "Étape",
    "app.setup.of": "sur",
    "app.setup.display_name": "Nom affiché",
    "app.setup.fav_club": "Club favori",
    "app.share.native": "Partager l'image",
    "app.share.download": "Télécharger l'image",
    "app.share.whatsapp": "Envoyer sur WhatsApp",
    "app.share.copy": "Copier le lien",
    "app.rankings.title": "Classement général",
    "app.profile.title": "Profil",
    "app.delete.title": "Supprimer mon compte",
    "app.delete.desc":
      "Votre compte est fermé immédiatement et supprimé définitivement sous 7 jours.",
    "app.delete.confirm_title": "Supprimer votre compte ?",
    "app.delete.confirm_body":
      "Vous êtes déconnecté partout et votre nom disparaît des classements. Sous 7 jours, le compte et ses données sont effacés, sans retour possible.",
    "app.delete.checkbox": "Je comprends que la suppression est définitive.",
    "app.delete.cta": "Supprimer définitivement",
    "app.delete.cancel": "Annuler",
    "app.leagues.title": "Ligues",
    "app.leagues.join": "Rejoindre une ligue",
    "app.leagues.create": "Créer une ligue",
    "app.leagues.code": "Code de la ligue",
    "app.leagues.invite": "Inviter",
    "app.my_rank": "Mon classement",
    "app.pts": "Points",
    "app.create.enrolment_next":
      "La Journée {current} est clôturée. Votre équipe jouera à partir de la Journée {n}.",
  };

  const ar = {
    /* Shared words */
    [P + "common.close"]: "إغلاق",
    [P + "common.provisional"]: "مبدئي",
    [P + "common.no_rating"]: "لا تقييم بعد",

    /* M1 · first_contact */
    [P + "m1.intro.title"]: "بطاقتك كمدرّب",
    [P + "m1.intro.body"]: "تبدأ مع فريقك، ويأتي تقييمها بعد {n} جولات منتهية.",
    [P + "m1.save.line"]: "عند حفظ فريقك تبدأ بطاقتك كمدرّب، ويأتي تقييمها بعد {n} جولات منتهية.",
    [P + "m1.register.hint"]:
      "يُستخدم اسمًا معروضًا على بطاقتك وفي الترتيب، ويمكن تغييره في الخطوة التالية.",
    [P + "m1.setup.name_hint"]: "يظهر هذا الاسم على بطاقتك وفي الترتيب. يكفي اسم أول أو لقب.",
    [P + "m1.setup.club_hint"]: "يمنح ناديك لونه لبطاقتك، ويمكن تغييره من ملفك الشخصي.",
    [P + "m1.builder.line"]: "تمّ إنشاء حسابك. بقي حفظ فريقك.",

    /* M2 · card_created */
    [P + "m2.heading"]: "بطاقتك كمدرّب",
    [P + "m2.line1"]: "يأتي تقييمها بعد {n} جولات منتهية: {gws}.",
    [P + "m2.line1_from"]: "يأتي تقييمها بعد {n} جولات منتهية، ابتداءً من الجولة {gw}.",
    [P + "m2.line2"]: "ستقيس قراراتك: القائد، والتشكيلة، والانتقالات، والثبات.",
    [P + "m2.serial"]: "رقمها {serial} لن يتغيّر أبدًا.",
    [P + "m2.invite"]:
      "إذا انضمّ أصدقاؤك قبل الموعد النهائي للجولة {gw}، تُحتسب جولاتهم مع جولاتك.",
    [P + "m2.invite_button"]: "دعوة الأصدقاء",
    [P + "m2.arrival"]:
      "جديد: تُحسب بطاقتك انطلاقًا من فريقك. يأتي تقييمها بعد {n} جولات منتهية ({k}/{n}).",

    /* M3 · formation */
    [P + "m3.label"]: "البطاقة قيد التكوين",
    [P + "m3.counter"]: "{k}/{n}",
    [P + "m3.line"]:
      "التقييم بعد {n} جولات منتهية · التالية: الجولة {gw} · الموعد النهائي {deadline}",
    [P + "m3.first_counted"]: "أول جولة محتسبة: الجولة {gw}.",
    [P + "m3.eve"]: "آخر جولة قبل تقييمك: الجولة {gw}.",
    [P + "m3.over"]: "انتهت الجولة {gw} ولم تُعتمد نهائيًا بعد. يظهر التقييم فور اعتمادها.",
    [P + "m3.insufficient"]: "احتُسبت {n} جولات. ينتظر التقييم إحصاءً آخر.",
    [P + "m3.late"]: "انتهى الموسم قبل تقييمك الأول: يأتي في موسم {season}.",
    [P + "m3.recap"]: "جولة محتسبة لبطاقتك: {k}/{n}",
    [P + "m3.hint.cap"]: "اختيار القائد يُحتسب في خانة «القائد» على بطاقتك.",
    [P + "m3.hint.sel"]: "التشكيلة الأساسية تُحتسب في خانة «التشكيلة».",
    [P + "m3.hint.trf"]: "الانتقالات تُحتسب في خانة «الانتقالات». من دون انتقالات تبقى فارغة (—).",
    [P + "m3.first_transfer"]: "يُقاس هذا الانتقال في خانة «الانتقالات» بعد {n} جولات منتهية.",
    [P + "m3.builder.sel"]: "ستقيس خانة «التشكيلة» اختيار الأساسيين.",
    [P + "m3.builder.cap"]: "ستقيس خانة «القائد» اختيارات القائد، جولةً بعد جولة.",
    [P + "m3.fact.cap"]: "القائد · قائدك: {a}، أفضل لاعب في تشكيلتك: {b}",
    [P + "m3.fact.sel_excluded"]: "لا تُحتسب جولات تعزيز الاحتياط في خانة «التشكيلة».",

    /* M4 · first_rating */
    [P + "m4.hero.fresh.label"]: "أول تقييم · الجولة {gw}",
    [P + "m4.hero.fresh.line"]: "يبقى مبدئيًا حتى {nf} جولات منتهية.",
    [P + "m4.hero.arrival.label"]: "بطاقتك كمدرّب هنا",
    [P + "m4.hero.arrival.line"]: "حُسبت من {k} جولات منتهية هذا الموسم.",
    [P + "m4.hero.coalesced.label"]: "أول تقييم: {first} (الجولة {gw}). اليوم: {ovr}، {tier}.",
    [P + "m4.hero.coalesced.line"]: "يبقى مبدئيًا حتى {nf} جولات منتهية.",
    [P + "m4.hero.detail"]: "عرض التفاصيل",
    [P + "m4.hero.share"]: "مشاركة",
    [P + "m4.sheet.heading"]: "تقييمك الأول: {ovr}",
    [P + "m4.sheet.line"]: "مبدئي حتى {nf} جولات منتهية، وهو نابع من قراراتك:",
    [P + "m4.sheet.tile.cap"]: "القائد · قرارات القائد",
    [P + "m4.sheet.tile.sel"]: "التشكيلة · اختيار التشكيلة",
    [P + "m4.sheet.tile.trf"]: "الانتقالات · قرارات الانتقالات",
    // the plan writes «الثبات · الثبات» and says the tile then shows it once
    [P + "m4.sheet.tile.con"]: "الثبات",
    [P + "m4.sheet.footer"]: "التقييم هو متوسط الإحصاءات المتوفرة.",
    [P + "m4.sheet.tier_distance"]: "فئة {tier} ابتداءً من {from}.",
    [P + "m4.sheet.share"]: "مشاركة بطاقتي",
    [P + "m4.sheet.league"]: "عرض الدوري",
    [P + "m4.sheet.replay"]: "إعادة العرض",
    // proposed: «من» is the app's own word (auth.setup.of)
    [P + "m4.story.progress"]: "{k} من {n}",

    /* M5 · league and head-to-head */
    [P + "m5.band"]: "تقييمات جديدة بعد الجولة {gw}: {names}",
    [P + "m5.row.forming"]: "قيد التكوين {k}/{n}",
    [P + "m5.hint.compare"]: "للمقارنة بين البطاقتين، يكفي لمس اسم مدرّب.",
    [P + "m5.h2h.score"]: "أنت {a} · {name} {b}",
    [P + "m5.h2h.close"]: "إغلاق",

    /* M6 · share */
    [P + "m6.whatsapp"]: "واتساب",
    [P + "m6.native"]: "مشاركة الصورة",
    [P + "m6.copy"]: "نسخ الرابط",
    [P + "m6.image.provisional"]: "تقييم مبدئي · الجولة {gw}",
    // the plan puts U+200F before the number in both messages
    [P + "m6.msg.league"]:
      "بطاقتي في BotolaGO: ‏{ovr} (مبدئي). وأنت؟ انضمّ إلى دوريي « {league} »: {link}",
    [P + "m6.msg.plain"]: "بطاقتي في BotolaGO: ‏{ovr}. وأنت؟ {link}",

    /* M7 · provisional_cleared */
    [P + "m7.line"]: "لم يعد تقييمك مبدئيًا: {ovr} بعد {nf} جولات.",

    /* M8 · tier_changed */
    [P + "m8.up.heading"]: "بطاقتك الآن في فئة {tier}.",
    [P + "m8.up.line"]: "{ovr} بعد الجولة {gw}. تتبع الفئة تقييمك جولةً بعد جولة.",
    [P + "m8.view"]: "عرض بطاقتي",
    [P + "m8.down.line"]: "الفئة الحالية: {tier}. الأفضل هذا الموسم: {best}.",

    /* M9 · founder_granted */
    [P + "m9.heading"]: "عضو مؤسس 2026",
    [P + "m9.line"]:
      "تُكتب سنتك بعد اسمك: {name} ·26. مُنحت هذه العلامة مرة واحدة ولن تُمنح مجددًا.",
    [P + "m9.cutoff"]: "مُنحت لفرق موسم 2026/27 المُنشأة قبل {date}.",

    /* M10 · season_closed, season_started */
    [P + "m10.closed"]: "انتهى موسم {season}: {ovr}، {tier}. يبقى على بطاقتك.",
    [P + "m10.started"]:
      "موسم {season}: تحتفظ بطاقتك بتقييم {prev} حتى أول تقييم لك هذا الموسم، بعد {n} جولات منتهية.",

    /* M12 · card page and replay */
    [P + "m12.replay"]: "إعادة العرض",
    [P + "m12.replay.line"]: "في الجولة {gw}: {then}. اليوم: {now}.",
    // proposed: the plan writes these list items in French only; first_rating, founder and season
    // reuse the Arabic of M4, M9 and M10
    [P + "m12.item.first_rating"]: "أول تقييم · الجولة {gw}",
    [P + "m12.item.founder"]: "عضو مؤسس 2026",
    [P + "m12.item.tier"]: "أول مرة في فئة {tier} · الجولة {gw}",
    [P + "m12.item.season"]: "موسم {season}",
    [P + "m12.history"]: "السجل",

    /* Section 4 · states and edges */
    [P + "state.no_rating"]: "لا تقييم بعد",
    [P + "state.trf.no_transfers"]: "لا انتقالات بعد",
    [P + "state.trf.window_open"]: "يُحسب بعد {n} جولات من الانتقال",
    [P + "state.reason.pending_minimum"]: "لا جولات كافية بعد",
    [P + "state.reason.excluded_weeks_only"]: "جولات غير محتسبة",
    [P + "state.reason.board_not_final"]: "الترتيب لم يُعتمد بعد",
    [P + "state.cap.default_captain"]: "لا تُحتسب الجولة {gw}: عُيّن القائد تلقائيًا.",
    [P + "state.deletion"]:
      "ستُحذف بطاقتك كمدرّب ورقمها {serial}، ولن يُعاد إسناد هذا الرقم أبدًا.",
    [P + "state.deletion_noserial"]: "ستُحذف بطاقتك كمدرّب.",
    [P + "state.offline.text"]: "تعذّر تحميل البطاقة.",
    [P + "state.offline.retry"]: "إعادة المحاولة",

    /* App chrome (mocked) */
    "app.nav.primary": "التنقل الرئيسي",
    "app.nav.home": "الرئيسية",
    "app.nav.news": "الأخبار",
    "app.nav.fantasy": "فانتازي",
    "app.nav.matches": "المباريات",
    "app.nav.pepites": "جواهر",
    "app.nav.profile": "الملف الشخصي",
    "app.search": "بحث",
    "app.notifications": "الإشعارات",
    "app.language": "اللغة",
    "app.fantasy.title": "فانتازي",
    "app.back": "رجوع",
    "app.close": "إغلاق",
    "app.loading": "جارٍ التحميل…",
    "app.gameweek": "الجولة",
    "app.deadline": "الموعد النهائي",
    "app.next_deadline": "الموعد النهائي القادم",
    "app.hours": "ساعات",
    "app.minutes": "دقائق",
    "app.seconds": "ثوانٍ",
    "app.value": "القيمة",
    "app.bank": "الرصيد",
    "app.rank": "الترتيب",
    "app.average": "المعدل",
    "app.highest": "الأعلى",
    "app.total": "المجموع",
    "app.gw_points": "نقاط الجولة",
    "app.points": "النقاط",
    "app.my_points": "نقاطي ج{gw}",
    "app.my_players": "لاعبيّ في ج{gw}",
    "app.no_match": "بلا مباراة",
    "app.transfers": "الانتقالات",
    "app.free_transfers": "انتقالات مجانية",
    "app.pick_team": "اختيار الفريق",
    "app.create_team": "إنشاء فريقي",
    "app.enter_squad": "إدخال التشكيلة",
    "app.captain": "القائد",
    "app.vice_captain": "نائب القائد",
    "app.team_name_label": "اسم الفريق",
    "app.create.guest_note": "مسودتك محفوظة على هذا الجهاز. يُطلب حساب مجاني عند الحفظ.",
    "app.create.sign_in_reason": "أنشئ حسابًا مجانيًا أو سجّل الدخول لحفظ فريقك.",
    "app.no_team_yet": "ليس لديك فريق بعد.",
    "app.my_leagues": "دورياتي",
    "app.general_leagues": "الدوريات العامة",
    "app.private_leagues": "الدوريات الخاصة",
    "app.overall": "العام",
    "app.join_leagues": "الانضمام إلى دوريات",
    "app.configure_leagues": "إدارة الدوريات",
    "app.create_invite": "أنشئ دوريًا وادعُ أصدقاءك",
    "app.cups": "الكؤوس",
    "app.members": "عضواً",
    "app.leader": "المتصدر",
    "app.view_all": "عرض الكل",
    "app.rules": "قواعد اللعبة",
    "app.shortcut.fixtures": "المباريات",
    "app.shortcut.fdr": "صعوبة المباريات",
    "app.shortcut.stats": "إحصائيات اللاعبين",
    "app.shortcut.top": "أفضل اللاعبين",
    "app.intro.title": "كن مدرّباً في البطولة الاحترافية",
    "app.intro.lede":
      "فانتازي BotolaGO لعبة مجانية: يجمع لك لاعبوك من البطولة الاحترافية النقاط حسب أدائهم في مبارياتهم الحقيقية جولةً بعد جولة، وتتحدى أصدقاءك في دوريات خاصة.",
    "app.intro.prizes": "جوائز بانتظار أفضل المدربين.",
    "app.intro.how_title": "طريقة اللعب",
    "app.intro.squad_title": "تشكيلة من {size} لاعباً",
    "app.intro.squad_body":
      "حارسان و5 مدافعين و5 لاعبي وسط و3 مهاجمين، تختار منهم 11 أساسياً في كل جولة.",
    "app.intro.budget_title": "ميزانية {budget} م",
    "app.intro.budget_body":
      "لكل لاعب سعره، وبحد أقصى {max} لاعبين من النادي نفسه: عليك أن تجد التوازن المناسب.",
    "app.intro.captain_title": "قائد بنقاط مضاعفة",
    "app.intro.captain_body": "اختر قائدك في كل جولة لتُضاعَف نقاطه، وإذا لم يلعب يحلّ نائبه محله.",
    "app.intro.deadline_title": "موعد نهائي لكل جولة",
    "app.intro.deadline_body":
      "أجرِ انتقالاتك واختر أساسييك وقائدك قبل الموعد النهائي، وبعده يُقفَل فريقك حتى نهاية الجولة.",
    "app.intro.sign_in_note": "كوّن فريقك الآن: لا يُطلب حساب مجاني إلا عند الحفظ.",
    "app.register.full_name": "الاسم الكامل",
    "app.setup.step": "الخطوة",
    "app.setup.of": "من",
    "app.setup.display_name": "الاسم المعروض",
    "app.setup.fav_club": "النادي المفضل",
    "app.share.native": "مشاركة الصورة",
    "app.share.download": "تنزيل الصورة",
    "app.share.whatsapp": "إرسال عبر واتساب",
    "app.share.copy": "نسخ الرابط",
    "app.rankings.title": "الترتيب العام",
    "app.profile.title": "الملف الشخصي",
    "app.delete.title": "حذف حسابي",
    "app.delete.desc": "يُغلق حسابك فوراً ويُحذف نهائياً خلال 7 أيام.",
    "app.delete.confirm_title": "هل تريد حذف حسابك؟",
    "app.delete.confirm_body":
      "يتم تسجيل خروجك من كل الأجهزة ويختفي اسمك من الترتيبات. خلال 7 أيام، يُحذف الحساب وبياناته دون رجعة.",
    "app.delete.checkbox": "أدرك أن الحذف نهائي.",
    "app.delete.cta": "حذف نهائياً",
    "app.delete.cancel": "إلغاء",
    "app.leagues.title": "الدوريات",
    "app.leagues.join": "الانضمام إلى دوري",
    "app.leagues.create": "إنشاء دوري",
    "app.leagues.code": "رمز الدوري",
    "app.leagues.invite": "دعوة",
    "app.my_rank": "ترتيبي",
    "app.pts": "النقاط",
    "app.create.enrolment_next": "الجولة {current} مغلقة. سيشارك فريقك ابتداءً من الجولة {n}.",
  };

  /* ---------- lookup and formatting ---------- */
  const STR = (ONB.STR = ONB.STR || { fr: {}, ar: {} });
  Object.assign(STR.fr, fr);
  Object.assign(STR.ar, ar);

  /** Adds or overrides keys: MC.ONB.addStrings({ fr: { "card.onboarding.x": "…" }, ar: { … } }). */
  ONB.addStrings = (more) => {
    Object.assign(STR.fr, more.fr || {});
    Object.assign(STR.ar, more.ar || {});
  };

  /** A var for env.t that is inserted as is (html), with a plain-text twin for env.text. */
  ONB.raw = (html, text) => ({ __raw: String(html), __text: text == null ? null : String(text) });

  // Latin codes and Western digits that must stay left-to-right inside Arabic text.
  const LTR_RUN = /BOT\s#\d+|\d+\s?OVR|·\d+|\d+(?:[/:.,]\d+)*|\b[A-Z]{2,}\b/g;
  const warned = new Set();
  const warn = (msg) => {
    if (warned.has(msg)) return;
    warned.add(msg);
    console.warn("[onboarding strings] " + msg);
  };

  /** Escapes a plain segment; in Arabic isolates the left-to-right runs in <bdi dir="ltr">. */
  const wrap = (s, ar) => {
    if (!ar) return MC.esc(s);
    let out = "";
    let last = 0;
    s.replace(LTR_RUN, (m, off) => {
      out += MC.esc(s.slice(last, off)) + '<bdi dir="ltr">' + MC.esc(m) + "</bdi>";
      last = off + m.length;
      return m;
    });
    return out + MC.esc(s.slice(last));
  };

  /**
   * ONB.fmt(lang, key, vars, html = true). lang is "fr" or "ar".
   * html: escaped text, with <bdi> isolation in Arabic. Otherwise: escaped text only.
   */
  ONB.fmt = (lang, key, vars = {}, html = true) => {
    const l = lang === "ar" ? "ar" : "fr";
    const tpl = STR[l][key];
    if (tpl == null) {
      warn(`missing ${l} string ${key}`);
      return MC.esc(`[${key}]`);
    }
    const raws = [];
    const filled = tpl.replace(/\{(\w+)\}/g, (m, name) => {
      if (!(name in vars) || vars[name] == null) {
        warn(`${key} needs {${name}}`);
        return m;
      }
      const v = vars[name];
      if (typeof v === "object" && "__raw" in v) {
        raws.push(html ? v.__raw : (v.__text ?? v.__raw.replace(/<[^>]*>/g, "")));
        return `\u0001${raws.length - 1}\u0001`;
      }
      return String(v);
    });
    return filled
      .split("\u0001")
      .map((seg, i) => (i % 2 ? raws[Number(seg)] : html ? wrap(seg, l === "ar") : MC.esc(seg)))
      .join("");
  };
})();
