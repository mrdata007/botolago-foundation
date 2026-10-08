/* S01 to S04 · M1 first_contact: the card is named, never shown off (ONBOARDING_PLAN.md section 3).
   S01 the hub's guest intro with the fifth "how it works" point (M1a), S02 the name step of the
   builder with the one line and the unnamed token (M1b), S03 the register hint and profile setup
   steps 1 and 2 with the live token (M1c), S04 back in the builder with focus on the save (M1c).

   Each screen mocks the real component: FantasyGuestIntro.tsx (open state), the name step of
   fantasy.create.tsx, auth.register.tsx and auth.profile-setup.tsx (inside AuthShell). Labels
   come from the app's dictionaries, copied exactly under `app.*` keys; the card's lines come from
   strings.js. Sample values the person would type, and the sample clubs, are `lab.sample.*` keys:
   fictional, never to be lifted into the product.

   Decision 5 (approved): until the server resolves the favourite club into the card's club, no
   copy promises a club colour. So in step 2 the card keeps its own material and says nothing
   about colour (variants `club`, `skipped`); the plan's club hint and the recoloured token exist
   only in `clubResolved`, labelled as conditional on that resolution.

   No screen here moves: M1 names the card and never shows it off, the plan's beats start at M2,
   and the name is never animated. */
(function () {
  const MC = window.MC;
  const ONB = MC.ONB;
  if (!ONB || !ONB.screen) return;
  const esc = MC.esc;
  const K = "card.onboarding.";

  ONB.addStrings({
    fr: {
      "app.intro.join_by": "Date limite pour jouer dès la Journée {n} :",
      "app.fpl.squad_selection": "Sélection de l’effectif",
      "app.fpl.squad": "Effectif",
      "app.fpl.players_selected": "{n}/15 joueurs",
      "app.fpl.left_in_bank": "Reste en banque",
      "app.fpl.team_name": "Nom de l’équipe",
      "app.fpl.team_name_help":
        "3 à 30 caractères : lettres, chiffres, espaces, - ’ . _ — le nom qui apparaîtra dans les classements.",
      "app.fantasy.kicker": "Fantasy",
      "app.auth.back": "Retour",
      "app.auth.brand_tagline": "Le football marocain, réuni.",
      "app.auth.register.title": "Créer votre compte",
      "app.auth.register.subtitle": "Rejoignez la communauté BotolaGO en moins d'une minute.",
      "app.auth.register.cta": "Créer mon compte",
      "app.auth.register.full_name_placeholder": "Votre nom complet",
      "app.auth.register.username": "Nom d'utilisateur",
      "app.auth.register.username_placeholder": "ex : rachid_1998",
      "app.auth.register.confirm_password": "Confirmer le mot de passe",
      "app.auth.register.accept_terms.lead": "J'accepte les ",
      "app.auth.register.accept_terms.terms_link": "Conditions d'utilisation",
      "app.auth.register.accept_terms.middle": " et la ",
      "app.auth.register.accept_terms.privacy_link": "Politique de confidentialité",
      "app.auth.register.accept_terms.tail": ".",
      "app.auth.register.have_account": "Vous avez déjà un compte ?",
      "app.auth.register.login_link": "Se connecter",
      "app.auth.email": "Adresse e-mail",
      "app.auth.email_placeholder": "vous@exemple.com",
      "app.auth.password": "Mot de passe",
      "app.auth.show_password": "Afficher le mot de passe",
      "app.auth.terms_notice.lead": "En continuant, vous acceptez nos ",
      "app.auth.terms_notice.terms_link": "Conditions d'utilisation",
      "app.auth.terms_notice.middle": " et notre ",
      "app.auth.terms_notice.privacy_link": "Politique de confidentialité",
      "app.auth.terms_notice.tail": ".",
      "app.setup.title": "Personnalisez votre profil",
      "app.setup.subtitle": "Quelques choix rapides pour adapter BotolaGO à vos préférences.",
      "app.setup.avatar": "Photo de profil",
      "app.setup.upload": "Choisir une image",
      "app.setup.fav_club_hint": "Nous mettrons ses actualités en avant.",
      "app.setup.skip": "Passer",
      "app.setup.next": "Suivant",
      "app.setup.previous": "Précédent",
      "lab.sample.name": "Ali",
      "lab.sample.team": "Casa Stars",
      "lab.sample.username": "ali_fan",
      "lab.sample.club.1.name": "Club Médina",
      "lab.sample.club.1.city": "Casablanca",
      "lab.sample.club.2.name": "Club Kasbah",
      "lab.sample.club.2.city": "Marrakech",
      "lab.sample.club.3.name": "Club Océan",
      "lab.sample.club.3.city": "Agadir",
      "lab.sample.club.4.name": "Club Safran",
      "lab.sample.club.4.city": "Meknès",
      "lab.sample.club.5.name": "Club Corniche",
      "lab.sample.club.5.city": "Tanger",
    },
    ar: {
      "app.intro.join_by": "الموعد النهائي للمشاركة ابتداءً من الجولة {n}:",
      "app.fpl.squad_selection": "اختيار التشكيلة",
      "app.fpl.squad": "التشكيلة",
      "app.fpl.players_selected": "{n}/15 لاعبًا",
      "app.fpl.left_in_bank": "المتبقي في الرصيد",
      "app.fpl.team_name": "اسم الفريق",
      "app.fpl.team_name_help":
        "من 3 إلى 30 حرفًا: حروف وأرقام ومسافات و - ' . _ — الاسم الذي سيظهر في الترتيب.",
      "app.fantasy.kicker": "فانتازي",
      "app.auth.back": "رجوع",
      "app.auth.brand_tagline": "كرة القدم المغربية، في مكان واحد.",
      "app.auth.register.title": "إنشاء حسابك",
      "app.auth.register.subtitle": "انضم إلى مجتمع BotolaGO في أقل من دقيقة.",
      "app.auth.register.cta": "إنشاء حسابي",
      "app.auth.register.full_name_placeholder": "اسمك الكامل",
      "app.auth.register.username": "اسم المستخدم",
      "app.auth.register.username_placeholder": "مثال: rachid_1998",
      "app.auth.register.confirm_password": "تأكيد كلمة المرور",
      "app.auth.register.accept_terms.lead": "أوافق على ",
      "app.auth.register.accept_terms.terms_link": "شروط الاستخدام",
      "app.auth.register.accept_terms.middle": " و",
      "app.auth.register.accept_terms.privacy_link": "سياسة الخصوصية",
      "app.auth.register.accept_terms.tail": ".",
      "app.auth.register.have_account": "لديك حساب بالفعل؟",
      "app.auth.register.login_link": "تسجيل الدخول",
      "app.auth.email": "البريد الإلكتروني",
      "app.auth.email_placeholder": "you@example.com",
      "app.auth.password": "كلمة المرور",
      "app.auth.show_password": "إظهار كلمة المرور",
      "app.auth.terms_notice.lead": "بمواصلتك فإنك توافق على ",
      "app.auth.terms_notice.terms_link": "شروط الاستخدام",
      "app.auth.terms_notice.middle": " و",
      "app.auth.terms_notice.privacy_link": "سياسة الخصوصية",
      "app.auth.terms_notice.tail": ".",
      "app.setup.title": "خصّص ملفك الشخصي",
      "app.setup.subtitle": "بعض الخيارات السريعة لتكييف BotolaGO حسب تفضيلاتك.",
      "app.setup.avatar": "صورة الملف الشخصي",
      "app.setup.upload": "اختر صورة",
      "app.setup.fav_club_hint": "سنُبرز أخباره لك.",
      "app.setup.skip": "تخطّي",
      "app.setup.next": "التالي",
      "app.setup.previous": "السابق",
      "lab.sample.name": "علي",
      "lab.sample.team": "نجوم الدار",
      "lab.sample.username": "ali_fan",
      "lab.sample.club.1.name": "نادي المدينة",
      "lab.sample.club.1.city": "الدار البيضاء",
      "lab.sample.club.2.name": "نادي القصبة",
      "lab.sample.club.2.city": "مراكش",
      "lab.sample.club.3.name": "نادي المحيط",
      "lab.sample.club.3.city": "أكادير",
      "lab.sample.club.4.name": "نادي الزعفران",
      "lab.sample.club.4.city": "مكناس",
      "lab.sample.club.5.name": "نادي الكورنيش",
      "lab.sample.club.5.city": "طنجة",
    },
  });

  /* ---------- the sample the person types, and the sample clubs (fictional) ---------- */
  const CLUBS = [
    { n: 1, primary: "#a8232b", secondary: "#f1e6d2" },
    { n: 2, primary: "#1d7447", secondary: "#f1ead8" },
    { n: 3, primary: "#1c4a9e", secondary: "#e4edf9" },
    { n: 4, primary: "#c98a12", secondary: "#2b2418" },
    { n: 5, primary: "#6a3d9c", secondary: "#efe7f7" },
  ];
  /** The club row the person taps in step 2 (and, once the server resolves it, the card's club). */
  const TAPPED = 1;

  /* ---------- icons the kit does not carry (lucide paths, 24 grid) ---------- */
  const PATHS = {
    coins:
      '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
    book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    // the register form's own password-field glyph (the app draws it), not a card state
    pass: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    camera:
      '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    checkc: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    arrowr: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  };
  // The app mirrors lucide arrows under dir="rtl" (src/styles.css), the kit does the same by class.
  const MIRRORED = new Set(["arrowr"]);
  const ico = (name, size = 18, cls = "") =>
    PATHS[name]
      ? `<svg class="onb-ico${MIRRORED.has(name) ? " onb-ico--dir" : ""}${cls ? " " + cls : ""}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`
      : ONB.icon(name, { size, cls });
  /** A 44px-or-more button that may carry one of the icons above. */
  const btn = (
    label,
    { kind = "primary", full = false, icon = "", iconEnd = "", cls = "", attrs = "" } = {},
  ) =>
    `<button type="button" class="onb-btn onb-btn--${kind}${full ? " onb-btn--full" : ""}${cls ? " " + cls : ""}"${attrs ? " " + attrs : ""}>${icon ? ico(icon, 18) : ""}<span>${label}</span>${iconEnd ? ico(iconEnd, 16) : ""}</button>`;

  /* ---------- styles: the three app screens' own parts, scoped under .onb ---------- */
  ONB.style(
    "m1",
    `
    .onb .onb-btn:disabled { opacity: 0.45; box-shadow: none; cursor: not-allowed; }
    .onb .m1-caps { text-transform: uppercase; }
    .onb[dir="ltr"] .m1-caps { letter-spacing: 0.025em; }
    .onb .m1-balance { text-wrap: balance; }
    .onb .m1-focus { box-shadow: 0 0 0 2px var(--ui-page), 0 0 0 4px var(--ui-ink-fg), var(--ui-shadow-lifted); }

    /* S01 · FantasyGuestIntro, open state */
    .onb .m1-intro { padding: 16px; }
    .onb .m1-intro__head { display: flex; align-items: flex-start; gap: 12px; }
    .onb .m1-art { flex: none; display: grid; place-items: center; width: 88px; height: 64px; border-radius: var(--ui-radius-control); background: var(--ui-surface-sunken); color: var(--ui-on-surface-muted); }
    .onb .m1-when { display: inline-flex; align-items: center; gap: 6px; color: var(--ui-on-surface); font-weight: 800; vertical-align: bottom; }
    .onb .m1-when .onb-ico { color: var(--ui-ink-fg); }
    .onb .m1-prizes { display: flex; align-items: center; gap: 8px; color: var(--ui-on-surface); font-weight: 700; }
    .onb .m1-prizes .onb-ico { flex: none; color: var(--ui-ink-fg); }
    .onb .m1-points { display: grid; gap: 12px; }
    .onb .m1-points > li { display: flex; align-items: flex-start; gap: 12px; }
    .onb .m1-points__text { display: flex; flex-direction: column; min-width: 0; }
    /* The fifth point is a result, not a step: its disc is quiet so the object's own material reads. */
    .onb .m1-disc--card { background: var(--ui-surface-sunken); box-shadow: inset 0 0 0 1px var(--ui-rule); }

    /* S02, S04 · the builder's name step */
    .onb.onb-m1-flat .onb-body { padding-block: 0 24px; }
    .onb .m1-kick { display: block; overflow: hidden; text-overflow: ellipsis; color: var(--ui-on-surface-muted); font: 800 12px/var(--ui-leading-flat) var(--onb-body); }
    .onb .m1-title { display: block; overflow: hidden; text-overflow: ellipsis; }
    .onb .m1-stat { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto auto; row-gap: 2px; padding: 12px 16px; background: var(--ui-ink); color: var(--ui-on-ink-plain); box-shadow: inset 0 1px 0 var(--ui-ink-edge), inset 0 -1px 0 var(--ui-ink-edge); }
    .onb .m1-stat__col { display: grid; grid-template-rows: subgrid; grid-row: span 2; min-width: 0; padding-inline-end: 8px; }
    .onb .m1-stat__label { align-self: end; }
    .onb .m1-stat__val, .onb .m1-stat__fig { align-self: center; display: flex; }
    .onb .m1-stat__col + .m1-stat__col { padding-inline: 14px 0; border-inline-start: 1px solid color-mix(in oklab, var(--ui-on-ink-plain) 16%, transparent); }
    .onb .m1-stat__label { color: color-mix(in oklab, var(--ui-on-ink-plain) 78%, transparent); }
    .onb .m1-stat__val { font-weight: 800; }
    .onb .m1-stat__bar { width: 44px; height: 20px; border-radius: var(--ui-radius-control); background: color-mix(in oklab, var(--ui-on-ink-plain) 22%, transparent); }
    .onb .m1-form { padding: 16px 16px 0; }
    .onb .m1-namecard { padding: 20px; }
    .onb .m1-field { display: flex; flex-direction: column; gap: 4px; }
    .onb .m1-field__label { font-weight: 800; }
    .onb .m1-box { position: relative; display: flex; align-items: center; width: 100%; }
    .onb .m1-box__lead { position: absolute; inset-block: 0; inset-inline-start: 12px; display: flex; align-items: center; pointer-events: none; color: var(--ui-on-surface-muted); }
    .onb .m1-box__trail { position: absolute; inset-block: 0; inset-inline-end: 2px; display: flex; align-items: center; }
    .onb .m1-input { width: 100%; min-height: 48px; padding-inline: 12px; border: 1px solid var(--ui-rule-strong); border-radius: var(--ui-radius-card); background: var(--ui-surface); color: var(--ui-on-surface); font: 600 15px/var(--ui-leading-copy) var(--onb-body); text-align: start; outline: none; }
    .onb .m1-input::placeholder { color: var(--ui-on-surface-faint); opacity: 1; }
    .onb .m1-input--page { background: var(--ui-page); }
    .onb .m1-input--lead { padding-inline-start: 40px; }
    .onb .m1-input--trail { padding-inline-end: 48px; }
    .onb .m1-field__err { min-height: calc(13px * var(--ui-leading-flat)); font-size: 13px; }
    .onb .m1-kv { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; padding-inline: 4px; border-block-end: 1px solid var(--ui-rule); }
    .onb .m1-kv:last-child { border-block-end: 0; }
    .onb .m1-kv__val { font-weight: 800; }
    .onb .m1-cardrow { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 8px 12px; padding-inline-start: 8px; border-radius: var(--ui-radius-card); background: var(--ui-surface-sunken); }
    .onb .m1-cardrow > .onb-card { flex: none; }
    .onb .m1-created { display: flex; align-items: flex-start; gap: 8px; color: var(--ui-on-surface); font-weight: 700; }
    .onb .m1-created .onb-ico { flex: none; margin-block-start: 3px; color: var(--ui-positive); }

    /* S03 · AuthShell: a dark band over a white sheet. The band's photograph is an app asset
       the lab does not carry, so it is the scrim's own ink-deep with two floodlight glows. */
    .onb.onb-m1-auth.onb-m1-solid .onb-status { background: var(--ui-ink-deep); }
    .onb.onb-m1-auth .onb-status { position: absolute; inset-block-start: 0; inset-inline: 0; z-index: 3; background: transparent; color: #fff; }
    .onb.onb-m1-auth .onb-body { display: flex; flex-direction: column; min-height: 100%; padding-block: 0; }
    .onb .m1-band { position: relative; flex: none; padding: 24px 16px 44px; color: #fff; background:
        radial-gradient(60% 70% at 12% 0%, color-mix(in oklab, #7fb0ff 30%, transparent) 0%, transparent 70%),
        radial-gradient(50% 60% at 92% 10%, color-mix(in oklab, #7fb0ff 20%, transparent) 0%, transparent 70%),
        linear-gradient(to bottom, color-mix(in oklab, var(--ui-ink-deep) 88%, #000) 0%, var(--ui-ink-deep) 100%); }
    .onb .m1-band--compact { padding-block-end: 40px; }
    .onb .m1-band__row { display: flex; align-items: center; gap: 12px; min-height: 44px; }
    .onb .m1-band__row .onb-logo { color: #fff; }
    .onb .m1-glass { display: inline-grid; place-items: center; flex: none; width: 44px; height: 44px; border-radius: 999px; background: color-mix(in oklab, #fff 16%, transparent); color: #fff; font: 800 13px/1 var(--onb-body); }
    .onb .m1-band__end { margin-inline-start: auto; }
    .onb .m1-tagline { max-width: 15rem; margin-block-start: 40px; font: 800 22px/var(--ui-leading-display) var(--onb-display); }
    .onb .m1-strip { display: flex; gap: 4px; margin-block-start: 12px; }
    .onb .m1-band--compact .m1-strip { margin-block-start: 20px; }
    .onb .m1-strip i { width: 16px; height: 4px; border-radius: 999px; }
    .onb .m1-sheet { position: relative; z-index: 1; flex: 1 1 auto; margin-block-start: -24px; padding: 24px 16px 24px; border-start-start-radius: var(--ui-radius-sheet); border-start-end-radius: var(--ui-radius-sheet); background: var(--ui-surface); color: var(--ui-on-surface); }
    .onb .m1-sheet__sub { margin-block-start: 6px; }
    .onb .m1-sheet__body { margin-block-start: 24px; }
    .onb .m1-regform { display: grid; gap: 12px; }
    .onb .m1-check { display: flex; align-items: flex-start; gap: 0; }
    .onb .m1-check__hit { display: grid; place-items: center; flex: none; width: 44px; height: 44px; margin-inline-start: -14px; }
    .onb .m1-check__box { width: 16px; height: 16px; margin: 0; accent-color: var(--ui-ink-fg); }
    .onb .m1-check__text { padding-block-start: 10px; color: var(--ui-on-surface-muted); }
    .onb .m1-link { color: var(--ui-ink-fg); font-weight: 800; text-decoration: underline; text-underline-offset: 2px; }
    .onb .m1-foot { display: grid; gap: 8px; margin-block-start: 24px; }
    .onb .m1-foot p { text-align: center; }
    .onb .m1-foot__have { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; column-gap: 4px; }
    .onb .m1-foot__link { min-height: 44px; padding-inline: 4px; border-radius: 999px; color: var(--ui-ink-fg); font-weight: 800; text-decoration: underline; text-decoration-thickness: 1.5px; text-underline-offset: 4px; }

    /* S03 · profile setup */
    .onb .m1-stephead { display: flex; align-items: center; justify-content: space-between; }
    .onb .m1-stephead .onb-btn--text { margin-inline-end: -8px; }
    .onb .m1-bars { display: flex; gap: 4px; margin-block-start: 8px; }
    .onb .m1-bars span { flex: 1 1 0; height: 6px; border-radius: 999px; background: var(--ui-rule); }
    .onb .m1-bars span.is-done { background-image: var(--ui-grad-action); }
    .onb .m1-setupcard { display: flex; align-items: center; gap: 12px; min-height: 80px; margin-block-start: 20px; padding: 8px 12px; padding-inline-start: 8px; border-radius: var(--ui-radius-card); background: var(--ui-surface-sunken); }
    .onb .m1-setupcard > .onb-card { flex: none; }
    .onb .m1-setupcard__text { min-width: 0; display: flex; flex-direction: column; }
    .onb .m1-echo { color: var(--ui-on-surface); }
    .onb .m1-avatar { display: grid; place-items: center; flex: none; width: 80px; height: 80px; border-radius: 999px; background: var(--ui-surface-sunken); box-shadow: inset 0 0 0 1px var(--ui-rule); color: var(--ui-on-surface-muted); }
    .onb .m1-setup { display: grid; gap: 16px; margin-block-start: 20px; }
    .onb .m1-setup--club { gap: 12px; }
    .onb .m1-clubs { display: grid; gap: 8px; max-height: 288px; overflow-y: auto; overflow-x: hidden; padding-inline-end: 4px; scrollbar-width: none; }
    .onb .m1-club { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px; padding: 8px 12px; border: 1px solid var(--ui-rule); border-inline-start-width: 4px; border-inline-start-color: var(--c); border-radius: var(--ui-radius-card); background: var(--ui-surface); color: var(--ui-on-surface); text-align: start; }
    .onb .m1-club[aria-pressed="true"] { border-color: var(--c); background: color-mix(in oklab, var(--c) 12%, var(--ui-surface)); }
    .onb .m1-club__crest { display: grid; place-items: center; flex: none; width: 32px; height: 36px; }
    .onb .m1-club__text { min-width: 0; flex: 1 1 0; display: flex; flex-direction: column; }
    .onb .m1-club__text > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .onb .m1-club .onb-ico { flex: none; color: var(--ui-positive); }
    .onb .m1-nav { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-block-start: 24px; }
    .onb .m1-nav .m1-next { flex: 1 1 0; max-width: 200px; }
    .onb .m1-skip { margin-block-start: 8px; }
    .onb .m1-btn--outline { border: 1px solid var(--ui-rule-strong); background: var(--ui-surface); color: var(--ui-on-surface); }
    .onb .m1-btn--sm { min-height: 44px; padding-inline: 14px; font-size: 13px; }
    `,
  );

  /* ---------- shared pieces ---------- */
  const tok = (env, size, extra = {}) => env.card("token", { size, ...extra });
  const dash = ONB.dash;

  /** The builder header: the app's UiHeader with its kicker over the title. */
  const builderTitle = (env) =>
    `<span class="m1-kick m1-caps">${env.t("app.fantasy.kicker")}</span><span class="m1-title">${env.t("app.fpl.squad_selection")}</span>`;

  /** The navy summary strip: the squad, and the budget it leaves (a neutral bar for the figure). */
  const statBar = (env) =>
    `<div class="m1-stat">` +
    `<div class="m1-stat__col"><span class="onb-t-label m1-stat__label m1-caps">${env.t("app.fpl.squad")}</span><span class="onb-t-secondary m1-stat__val">${env.t("app.fpl.players_selected", { n: 15 })}</span></div>` +
    `<div class="m1-stat__col"><span class="onb-t-label m1-stat__label m1-caps">${env.t("app.fpl.left_in_bank")}</span><span class="m1-stat__fig"><span class="m1-stat__bar" aria-hidden="true"></span></span></div>` +
    `</div>`;

  /** A UiInput: label, the box, a reserved error line, an optional hint. */
  const field = (
    env,
    {
      id,
      label,
      value = "",
      placeholder = "",
      lead = "",
      trail = "",
      hint = "",
      hintFirst = false,
      reserve = false,
      page = false,
      type = "text",
      ltr = false,
    },
  ) => {
    const uid = MC.uid("m1-f");
    const hintHtml = hint ? `<p class="onb-t-meta onb-muted" id="${uid}-hint">${hint}</p>` : "";
    const err = reserve
      ? `<p class="m1-field__err onb-t-meta" role="alert" aria-live="polite"></p>`
      : "";
    return (
      `<div class="m1-field">` +
      `<label class="onb-t-meta m1-field__label" for="${uid}">${label}</label>` +
      `<span class="m1-box">${lead ? `<span class="m1-box__lead">${lead}</span>` : ""}` +
      `<input id="${uid}" class="m1-input${page ? " m1-input--page" : ""}${lead ? " m1-input--lead" : ""}${trail ? " m1-input--trail" : ""}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}"${ltr ? ' dir="ltr"' : ""}${hint ? ` aria-describedby="${uid}-hint"` : ""} autocomplete="off" />` +
      `${trail ? `<span class="m1-box__trail">${trail}</span>` : ""}</span>` +
      (hintFirst ? hintHtml + err : err + hintHtml) +
      `</div>`
    );
  };

  /** UiKeyValueRow with a neutral bar for the player's name. */
  const kv = (label) =>
    `<div class="m1-kv onb-t-body"><span>${label}</span><span class="m1-kv__val">${ONB.skeleton.bar(96, 14)}</span></div>`;

  /* ---------- S01 · the hub's guest intro with the fifth point (M1a) ---------- */
  const introCard = (env) => {
    const titleId = MC.uid("m1-h");
    const howId = MC.uid("m1-how");
    const disc = (icon) =>
      `<span class="onb-disc onb-disc--grad" aria-hidden="true">${ico(icon, 18)}</span>`;
    const four = [
      ["users", env.t("app.intro.squad_title", { size: 15 }), env.t("app.intro.squad_body")],
      [
        "coins",
        env.t("app.intro.budget_title", { budget: 100 }),
        env.t("app.intro.budget_body", { max: 3 }),
      ],
      ["star", env.t("app.intro.captain_title"), env.t("app.intro.captain_body")],
      ["timer", env.t("app.intro.deadline_title"), env.t("app.intro.deadline_body")],
    ];
    const point = (lead, title, body) =>
      `<li>${lead}<span class="m1-points__text"><span class="onb-t-strong">${title}</span><span class="onb-t-secondary onb-muted">${body}</span></span></li>`;
    const fifth = point(
      // The object's mini in its own base material, with a dash in the number carrier: not an icon.
      `<span class="onb-disc m1-disc--card" aria-hidden="true">${tok(env, 24)}</span>`,
      env.t(K + "m1.intro.title"),
      env.t(K + "m1.intro.body"),
    );
    return (
      `<section class="onb-surface m1-intro" aria-labelledby="${titleId}" data-testid="fantasy-guest-intro">` +
      `<div class="m1-intro__head"><div class="onb-grow"><h2 id="${titleId}" class="onb-t-section m1-balance">${env.t("app.intro.title")}</h2></div>` +
      `<span class="m1-art" aria-hidden="true">${ONB.icon("shirt", { size: 28 })}</span></div>` +
      `<p class="onb-t-secondary onb-muted" style="margin-block-start:8px">${env.t("app.intro.lede")}</p>` +
      btn(env.t("app.create_team"), {
        kind: "primary",
        full: true,
        icon: "plus",
        cls: "m1-cta",
        attrs: 'style="margin-block-start:16px"',
      }) +
      `<p class="onb-t-meta onb-muted m1-balance" style="margin-block-start:8px;text-align:center">${env.t("app.intro.sign_in_note")}</p>` +
      `<p class="onb-t-secondary onb-muted" style="margin-block-start:12px">${env.t("app.intro.join_by", { n: env.ctx.firstGw })} <span class="m1-when">${ico("timer", 16)}<bdi>${esc(env.pick(env.ctx.deadline))}</bdi></span></p>` +
      `<p class="onb-t-meta m1-prizes" style="margin-block-start:12px">${ico("trophy", 16)}${env.t("app.intro.prizes")}</p>` +
      `<h3 id="${howId}" class="onb-t-label onb-muted m1-caps m1-how" style="margin-block-start:20px">${env.t("app.intro.how_title")}</h3>` +
      `<ul class="m1-points" aria-labelledby="${howId}" style="margin-block-start:8px">${four.map(([i, t, b]) => point(disc(i), t, b)).join("")}${fifth}</ul>` +
      `<div style="display:flex;justify-content:center;margin-block-start:12px">${btn(env.t("app.rules"), { kind: "text", icon: "book" })}</div>` +
      `</section>`
    );
  };

  ONB.screen({
    id: "S01",
    moment: "M1a",
    title: "Hub guest intro with the fifth point",
    variants: [
      {
        key: "points",
        fixture: "guest",
        label:
          "Open intro scrolled to “how it works”: the card is the fifth point, after the deadline",
      },
      {
        key: "fold",
        fixture: "guest",
        label:
          "Unscrolled: the first screen is the app's own, the card adds nothing above the fold",
      },
    ],
    render(env) {
      const sk = ONB.skeleton;
      const fold = env.v.key === "fold";
      const content =
        `<div class="onb-flow" style="--gap:10px">${sk.deadlineCard(env, { gw: env.ctx.firstGw })}` +
        `<div style="margin-block-start:14px">${introCard(env)}</div></div>` +
        `<div style="margin-block-start:16px">${sk.shortcuts(env)}</div>`;
      return ONB.phone(content, env, {
        tab: "fantasy",
        signedIn: false,
        title: fold ? env.t("app.fantasy.title") : "",
        scrollTo: fold ? undefined : ".m1-prizes",
        scrollTop: fold ? 0 : undefined,
      });
    },
  });

  /* ---------- S02 and S04 · the builder's name step (M1b, M1c) ---------- */
  /** One 64px row: a 48px token at the start, the plan's line at the end. */
  const saveRow = (env) =>
    `<div class="m1-cardrow" style="margin-block-start:12px">${tok(env, 48)}<p class="onb-t-secondary onb-muted" style="min-width:0">${env.t(K + "m1.save.line")}</p></div>`;

  const nameStep = (env, { teamName, signedIn, created }) => {
    const id = MC.uid("m1-save");
    const created_ = created
      ? `<p class="m1-created onb-t-secondary" id="${id}-note" role="status" style="margin-block-start:12px">${ico("checkc", 18)}<span>${env.t(K + "m1.builder.line")}</span></p>`
      : "";
    const guestNote = signedIn
      ? ""
      : `<p class="onb-t-meta onb-muted" data-testid="guest-draft-note" style="margin-block-start:12px">${env.t("app.create.guest_note")}</p>`;
    const save = btn(env.t("app.enter_squad"), {
      kind: "primary",
      full: true,
      cls: created ? "m1-focus" : "",
      attrs: `style="margin-block-start:16px"${created ? ` aria-describedby="${id}-note" data-focus="save"` : ""}${teamName ? "" : " disabled"}`,
    });
    return (
      `<div class="m1-form"><section class="onb-surface m1-namecard">` +
      field(env, {
        label: env.t("app.fpl.team_name"),
        value: teamName,
        placeholder: env.text("app.fpl.team_name"),
        hint: env.t("app.fpl.team_name_help"),
        // The fix that ships with M1b: no autofocus, so the line and the button show before the keyboard.
      }) +
      `<div style="margin-block-start:16px">${kv(env.t("app.captain"))}${kv(env.t("app.vice_captain"))}</div>` +
      saveRow(env) +
      guestNote +
      created_ +
      save +
      `</section></div>`
    );
  };

  const nameScreen = (env, opts) => {
    const html = ONB.phone(statBar(env) + nameStep(env, opts), env, {
      back: true,
      title: builderTitle(env),
      tab: "fantasy",
      gutter: false,
      signedIn: opts.signedIn,
    });
    return html.replace('class="onb onb-phone ', 'class="onb onb-phone onb-m1-flat ');
  };

  ONB.screen({
    id: "S02",
    moment: "M1b",
    title: "Name step: the line and the unnamed token, keyboard closed",
    variants: [
      {
        key: "guest",
        fixture: "guest",
        label:
          "Guest: token drawn locally, no name, a dash. The field is empty and unfocused (no autofocus)",
      },
      {
        key: "signedNoTeam",
        fixture: "signedNoTeam",
        label:
          "Signed in, no team: the token carries the card name; the club stays unresolved (own material)",
      },
    ],
    render(env) {
      const signedIn = env.ctx.audience !== "guest";
      // The builder's own default for a signed-in manager: first name + " FC" (fantasy.create.tsx).
      const teamName = signedIn ? `${env.text("lab.sample.name")} FC` : "";
      return nameScreen(env, { teamName, signedIn, created: false });
    },
  });

  ONB.screen({
    id: "S04",
    moment: "M1c",
    title: "Back in the builder on the name step, focus on save",
    variants: [
      {
        key: "restored",
        fixture: "guest",
        // The account exists by now: the card carries the display name chosen in profile setup.
        profile: { name: { lat: "ALI", ar: "علي" } },
        ctx: { audience: "signedNoTeam" },
        label:
          "Draft restored, complete and valid: opens on the name step, focus on “Entrer l'effectif”",
      },
    ],
    render(env) {
      return nameScreen(env, {
        teamName: env.text("lab.sample.team"),
        signedIn: true,
        created: true,
      });
    },
  });

  /* ---------- S03 · register hint, profile setup steps 1 and 2 (M1c) ---------- */
  const strip = () =>
    `<div class="m1-strip" aria-hidden="true">${CLUBS.map((c) => `<i style="background:${c.primary}"></i>`).join("")}</div>`;
  const wordmark = (h = 20) =>
    `<span class="onb-logo">${MC.logo("wordmark", { h, w: Math.round(h * MC.LOGO_RATIO.wordmark), variant: "mono", color: "currentColor" })}</span>`;

  /** AuthShell: the band (back, wordmark, language) over the sheet that carries the title and the form. */
  const authShell = (env, { title, subtitle, body, footer = "", compact = false, back = true }) =>
    `<div class="m1-band${compact ? " m1-band--compact" : ""}"><div class="m1-band__row">` +
    (back
      ? `<button type="button" class="m1-glass" aria-label="${env.text("app.auth.back")}">${ONB.icon("back")}</button>`
      : "") +
    wordmark() +
    `<button type="button" class="m1-glass m1-band__end" aria-label="${env.text("app.language")}">${env.ar ? "ع" : "FR"}</button></div>` +
    (compact ? "" : `<p class="m1-tagline">${env.t("app.auth.brand_tagline")}</p>`) +
    strip() +
    `</div>` +
    `<main class="m1-sheet"><h1 class="onb-t-title m1-balance">${title}</h1>` +
    `<p class="onb-t-secondary onb-muted m1-sheet__sub" style="font-weight:600">${subtitle}</p>` +
    `<div class="m1-sheet__body">${body}</div>${footer}</main>`;

  const authPhone = (env, shellOpts, phoneOpts = {}) =>
    ONB.phone(authShell(env, shellOpts), env, {
      topbar: false,
      nav: false,
      gutter: false,
      ...phoneOpts,
    }).replace(
      'class="onb onb-phone ',
      // Scrolled past the band, the app keeps an ink strip under the clock (StatusBarStrip, BG-0154).
      `class="onb onb-phone onb-m1-auth${phoneOpts.scrollTo ? " onb-m1-solid" : ""} `,
    );

  const consent = (env, p) =>
    `${env.t(`app.auth.${p}.lead`)}<span class="m1-link">${env.t(`app.auth.${p}.terms_link`)}</span>${env.t(`app.auth.${p}.middle`)}<span class="m1-link">${env.t(`app.auth.${p}.privacy_link`)}</span>${env.t(`app.auth.${p}.tail`)}`;

  /* Register: the plan's one hint under "Nom complet" (M1c). */
  const registerScreen = (env) => {
    const eye = `<button type="button" class="onb-iconbtn onb-iconbtn--ghost" aria-label="${env.text("app.auth.show_password")}">${ico("eye", 20)}</button>`;
    const body =
      `<div class="m1-regform">` +
      field(env, {
        label: env.t("app.register.full_name"),
        placeholder: env.text("app.auth.register.full_name_placeholder"),
        lead: ico("user", 18),
        page: true,
        hint: env.t(K + "m1.register.hint"),
        hintFirst: true,
        reserve: true,
      }) +
      field(env, {
        label: env.t("app.auth.register.username"),
        placeholder: env.text("app.auth.register.username_placeholder"),
        lead: ico("at", 18),
        page: true,
        reserve: true,
      }) +
      field(env, {
        label: env.t("app.auth.email"),
        placeholder: env.text("app.auth.email_placeholder"),
        lead: ico("mail", 18),
        page: true,
        reserve: true,
        type: "email",
      }) +
      field(env, {
        label: env.t("app.auth.password"),
        lead: ico("pass", 18),
        trail: eye,
        page: true,
        reserve: true,
        type: "password",
      }) +
      field(env, {
        label: env.t("app.auth.register.confirm_password"),
        lead: ico("pass", 18),
        page: true,
        reserve: true,
        type: "password",
      }) +
      `<label class="m1-check"><span class="m1-check__hit"><input class="m1-check__box" type="checkbox" /></span><span class="m1-check__text onb-t-meta">${consent(env, "register.accept_terms")}</span></label>` +
      btn(env.t("app.auth.register.cta"), { kind: "primary", full: true }) +
      `</div>`;
    const footer =
      `<div class="m1-foot"><p class="onb-t-secondary onb-muted m1-foot__have" style="font-weight:600"><span>${env.t("app.auth.register.have_account")}</span><button type="button" class="m1-foot__link">${env.t("app.auth.register.login_link")}</button></p>` +
      `<p class="onb-t-micro onb-muted">${consent(env, "terms_notice")}</p></div>`;
    return authPhone(env, {
      title: env.t("app.auth.register.title"),
      subtitle: env.t("app.auth.register.subtitle"),
      body,
      footer,
    });
  };

  /* Profile setup: the "Étape n sur 3" bar, then the plan's 64px token, then the step. */
  const stepHead = (env, step) =>
    `<div class="m1-stephead"><span class="onb-t-label onb-muted m1-caps">${env.t("app.setup.step")} ${ONB.num(step, env)} ${env.t("app.setup.of")} ${ONB.num(3, env)}</span>${btn(env.t("app.setup.skip"), { kind: "text" })}</div>` +
    `<div class="m1-bars" aria-hidden="true">${[1, 2, 3].map((i) => `<span class="${i <= step ? "is-done" : ""}"></span>`).join("")}</div>`;

  /** The card, said back: the live token at 64px with the plan's label and, when it holds, its hint. */
  const setupCard = (env, hintKey) =>
    `<div class="m1-setupcard">${tok(env, 64)}<div class="m1-setupcard__text"><span class="onb-t-label onb-muted m1-caps">${env.t(K + "m1.setup.card_label")}</span>` +
    // The direction's token carries the name in its accessible name only (nothing is drawn at 64px),
    // so the name said back is set beside it, in Changa 800, as the card will print it.
    `<span class="onb-t-header m1-echo" aria-hidden="true">${esc(MC.nameOf(env.p, env.o))}</span>` +
    `${hintKey ? `<span class="onb-t-meta onb-muted">${env.t(K + hintKey)}</span>` : ""}</div></div>`;

  const stepNav = (env, step, nextDisabled = false) =>
    `<div class="m1-nav">${btn(env.t("app.setup.previous"), { kind: "text", icon: "back", attrs: step === 1 ? "disabled" : "" })}` +
    btn(env.t("app.setup.next"), {
      kind: "primary",
      cls: "m1-next",
      iconEnd: "arrowr",
      attrs: nextDisabled ? "disabled" : "",
    }) +
    `</div>`;

  const stepOne = (env) =>
    `<div class="m1-setup">` +
    `<div style="display:flex;align-items:center;gap:16px"><span class="m1-avatar" aria-hidden="true">${ico("camera", 28)}</span>` +
    `<div class="onb-grow"><div class="onb-t-label onb-muted m1-caps">${env.t("app.setup.avatar")}</div>${btn(env.t("app.setup.upload"), { kind: "text", cls: "m1-btn--outline m1-btn--sm", attrs: 'style="margin-block-start:8px"' })}</div></div>` +
    field(env, {
      label: env.t("app.setup.display_name"),
      value: env.text("lab.sample.name"),
      lead: ico("user", 18),
      page: true,
    }) +
    field(env, {
      label: env.t("app.auth.register.username"),
      value: env.text("lab.sample.username"),
      lead: ico("at", 18),
      page: true,
    }) +
    `</div>`;

  const stepTwo = (env, tapped) => {
    const row = (c, i) => {
      const on = tapped && i === TAPPED;
      return (
        `<button type="button" class="m1-club" aria-pressed="${on}" style="--c:${c.primary}">` +
        `<span class="m1-club__crest">${MC.crest({ fill: c.primary, sash: c.secondary, ring: c.secondary, w: 28, h: 34 })}</span>` +
        `<span class="m1-club__text"><span class="onb-t-strong">${env.t(`lab.sample.club.${c.n}.name`)}</span><span class="onb-t-micro onb-muted">${env.t(`lab.sample.club.${c.n}.city`)}</span></span>` +
        (on ? ico("checkc", 20) : "") +
        `</button>`
      );
    };
    return (
      `<div class="m1-setup m1-setup--club">` +
      `<div class="onb-t-strong" style="display:flex;align-items:center;gap:8px">${ico("trophy", 16)}${env.t("app.setup.fav_club")}</div>` +
      `<p class="onb-t-meta onb-muted" style="margin-block-start:-4px">${env.t("app.setup.fav_club_hint")}</p>` +
      `<div class="m1-clubs">${CLUBS.map(row).join("")}</div></div>`
    );
  };

  const setupScreen = (env, { step, tapped = false, hintKey = null }) => {
    const body =
      stepHead(env, step) +
      setupCard(env, hintKey) +
      (step === 1 ? stepOne(env) : stepTwo(env, tapped)) +
      stepNav(env, step) +
      (step === 2
        ? `<div class="m1-skip">${btn(env.t("app.setup.skip"), { kind: "text", full: true, cls: "m1-btn--outline" })}</div>`
        : "");
    return authPhone(
      env,
      {
        title: env.t("app.setup.title"),
        subtitle: env.t("app.setup.subtitle"),
        body,
        compact: true,
        back: false,
      },
      // Step 2 is taller than 844px once the card row is in: scroll to the step bar so the row,
      // the list and both buttons are on screen (the title is the part that leaves).
      { scroll: true, scrollTo: step === 2 ? ".m1-stephead" : undefined },
    );
  };

  ONB.screen({
    id: "S03",
    moment: "M1c",
    title: "Register hint; profile setup steps 1 and 2 with the live token",
    variants: [
      {
        key: "register",
        fixture: "guest",
        label: "Register: one hint under “Nom complet”",
      },
      {
        key: "name",
        fixture: "guest",
        profile: { name: { lat: "ALI", ar: "علي" } },
        label:
          "Setup step 1: the name typed, the token follows it (guest journey, account just created)",
      },
      {
        key: "club",
        fixture: "clubNull",
        label:
          "Setup step 2: a club row tapped. Decision 5: the card is not recoloured and nothing promises a colour",
      },
      {
        key: "skipped",
        fixture: "clubNull",
        label: "Setup step 2: club skipped (nothing chosen). The card stays in its own material",
      },
      {
        key: "clubResolved",
        fixture: "clubNull",
        profile: {
          club: {
            lat: "KASBAH",
            ar: "القصبة",
            initials: "CK",
            primary: CLUBS[TAPPED].primary,
            secondary: CLUBS[TAPPED].secondary,
          },
        },
        label:
          "CONDITIONAL, not shippable as is: only once the server resolves the club (decision 5): token recoloured, plan's club hint",
      },
    ],
    render(env) {
      const k = env.v.key;
      if (k === "register") return registerScreen(env);
      if (k === "name") return setupScreen(env, { step: 1, hintKey: "m1.setup.name_hint" });
      if (k === "club") return setupScreen(env, { step: 2, tapped: true });
      if (k === "skipped") return setupScreen(env, { step: 2 });
      return setupScreen(env, { step: 2, tapped: true, hintKey: "m1.setup.club_hint" });
    },
  });
})();
