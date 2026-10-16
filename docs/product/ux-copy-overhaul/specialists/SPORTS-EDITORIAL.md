# Sports editorial review — BotolaGO

Read-only source review, 2026-10-16. No repository, database, account, scheduling or content writes. Only this temporary report was created. Reviewed repository AGENTS.md, CLAUDE.md, PRODUCT.md, public route inventory, both full-app dictionaries by section and targeted searches, and mounted references for the most consequential findings. This is source evidence, not a live browser or production-state audit. Root is the sole implementation writer.

## Editorial direction

Native Moroccan football French uses « matchs », « journée », « onze de départ », « brassard », « vice-capitaine », « buts encaissés », « passes décisives », « classement », « remplaçants »; retain the existing vous. Arabic should use clear MSA: الجولة، التشكيلة الأساسية، شارة القيادة، نائب القائد، التمريرات الحاسمة، الشباك النظيفة. Avoid literal « apparition », supplier vocabulary, database states, and unqualified « officiel » for BotolaGO's own calculations. BotolaGO remains independent. Keep score, deadline or answer first.

Do not alter 15-player limits, 100.0 budget, positions, 3 per club, captain multipliers, 90-minute Fantasy deadlines, kickoff Pronostics lock, free transfer count, four-point deductions, chip availability, scoring version boundaries, 12-hour selection of scale, 72-hour correction procedure, point publication or subscription entitlements. Replace presentation only. Do not copy stale PRODUCT feature switches into a current claim: verify production separately if claiming delivery now.

## Priority recommendations (exact keys, exact replacements)

All key paths below are in `src/i18n/dictionary-fr.ts` and `src/i18n/dictionary-ar.ts` unless specified. Priority P1 means misleading behavior/rules; P2 means materially opaque or awkward; P3 means refinement. Classes: factual promise, technical leakage, semantic error, terminology, inflated marketing.

### P1 — Fantasy points promise availability too early

Mounted in `src/components/fantasy/FantasyHubRound.tsx:123`.

- `fantasy.hub.points_before` FR before: « Vos points s'affichent en direct dès le coup d'envoi de {match}, {when} ». After: « Premier match : {match}, {when}. Vos points s’afficheront dès leur publication. »
- Same AR after: « أول مباراة: {match}، {when}. تظهر نقاطك عند نشرها. »
- `fantasy.hub.points_unknown` FR before: « Vos points s'affichent dès le début de la journée. ». After: « Vos points s’afficheront dès leur publication. »
- Same AR after: « تظهر نقاطك عند نشرها. »

Class: factual promise. `docs/backend/FANTASY_RATING_POINTS.md` explicitly records ratings arriving 5–16 days after many Botola matches; existing Plus copy also discloses publication delays. Live match scores and Fantasy point publication are different facts. Preserve {match}/{when} and avoid adding an exact publication SLA.

### P1 — Styling is presented as if the manager rating never changes

Mounted in Plus offer styling screen.

- `plus.rule` FR before: « Votre note ne change jamais, seul le style change. ». After: « Le style de la carte n’a aucun effet sur votre note. »
- AR before: « تقييمك لا يتغيّر أبدًا، الأسلوب وحده يتغيّر. ». After: « أسلوب البطاقة لا يؤثر في تقييمك. »

Class: semantic error. A manager rating does change after eligible completed journées; only a cosmetic choice has no effect on it. This also accurately distinguishes paid appearance from sporting merit.

### P1 — WhatsApp receipt is not automatically attached

`src/components/plus/PlusPayScreen.tsx:41` and `plus-pay.ts` construct a wa.me link containing text only.

- `plus.pay.wa_hint` FR before: « Votre reçu et votre code partent ensemble : nous retrouvons votre compte. ». After: « Votre code est déjà dans le message. Ajoutez votre reçu avant de l’envoyer. »
- AR before: « يصلنا إيصالك ورمزك معًا: نجد حسابك بسهولة. ». After: « رمزك موجود في الرسالة. أرفق إيصال الدفع قبل إرسالها. »

Class: factual promise. Gives the missing user action without changing payment amount, channel, manual review, activation or entitlements.

### P1 — “Probable XI” conflicts with documented football data policy

- `matches.detail.lineups_title` FR before: « Compositions probables ». After: « Compositions ».
- AR before: « التشكيلات المتوقعة ». After: « التشكيلتان ».
- `matches.detail.lineup_provisional` FR before: « Probable ». After: « À confirmer ».
- AR before: « محتملة ». After: « غير مؤكدة ».

Class: factual promise / terminology. `src/components/matches/LineupsView.tsx:189,230` applies the label to provider records with confirmed=false. “Unconfirmed” does not establish an editorial prediction. PRODUCT forbids probable XI. If these records actually are forecast XIs, copy alone cannot satisfy the policy: suppressing forecast records is a separate implementation decision, not something to disguise with wording. `lineups_title` is dictionary-only in current reference scan; label is mounted.

### P1 — Correct outcome in Arabic excludes a correctly predicted draw

- `predictions.rules.chip_outcome` AR before: « إصابة الفائز · نقطة ». After: « الفائز أو التعادل · نقطة ».
- FR can retain « Bon résultat · 1 pt »; an optional clearer replacement is « Bonne issue · 1 pt ».

Class: semantic error. The scoring rule grants 1 point for the right outcome, including draws. No points change. Keep exact score at 3 and otherwise 0.

### P1/P2 — Prospects follow sheet promises Monday emails

- `pepites.follow.sheet_body` FR before: « Créez un compte gratuit pour suivre ses matchs, recevoir le Top 10 du lundi et l'ajouter à votre équipe Fantasy. ». After: « Créez un compte gratuit pour suivre ce joueur et le retrouver dans Prospects. »
- AR after: « أنشئ حسابًا مجانيًا لمتابعة هذا اللاعب والعثور عليه في قسم المواهب. »

Class: factual promise. No current evidence in this review verifies Monday delivery, production email activation or this player's Fantasy eligibility; following a player must not itself imply weekly email consent or Fantasy availability. If preserving the Fantasy benefit after verifying eligibility, add « Consultez aussi sa fiche Fantasy. » only in the branch that actually exposes it.

### P2 — An injury feed is presented as independently confirmed absence

Mounted in `src/components/plus/PlusBriefing.tsx:392,683` and backed by `plus-briefing-data.ts` filtering any provider absence record.

- `plus.brief.cell_absent` FR before « Absences confirmées » → « Absences signalées »; AR « غيابات مؤكدة » → « غيابات معلنة ».
- `plus.brief.abs_title` FR before « Vos {n} joueurs · absences confirmées : {a} » → « Vos {n} joueurs · absences signalées : {a} »; AR « لاعبوك الـ{n} · غيابات مؤكدة: {a} » → « لاعبوك: {n} · غيابات معلنة: {a} ».
- `plus.brief.abs_source` FR before « liste du fournisseur, {date} » → « Signalé le {date} »; AR « قائمة مزوّد البيانات، {date} » → « أُعلن يوم {date} ».

Class: factual precision / technical leakage. Last replacement assumes `absence.asOf` is indeed a record's signal date; if it is merely fetch time, use « Données du {date} » / « بيانات {date} » instead. Do not turn a fetch timestamp into a report date. Provider data provenance can remain in the secondary method explanation. Avoid asserting medical confirmation beyond evidence.

### P2 — Empty absence state speaks about the maker instead of helping the manager

- `plus.brief.abs_no_feed` FR before: « Aucune liste d’absences n’est disponible pour le moment. Nous n’en inventons pas. ». After: « Aucune information sur les absences n’est disponible pour cette journée. »
- AR before: « لا توجد قائمة غيابات متاحة حاليًا. نحن لا نخترع قائمة. ». After: « لا تتوفر معلومات عن الغيابات لهذه الجولة. »
- `plus.brief.abs_none_listed` FR before: « Le fournisseur ne liste aucune absence dans votre équipe. ». After: « Aucune absence signalée dans votre équipe. »
- AR before: « لا يعلن مزوّد البيانات أي غياب في فريقك. ». After: « لا توجد غيابات معلنة في فريقك. »
- `plus.brief.abs_honest` FR before: « Seules les absences listées par notre fournisseur apparaissent ici ; aucune information ne veut pas dire disponible. ». After: « Seules les absences signalées apparaissent ici. Sans information, la disponibilité d’un joueur reste à confirmer. »
- AR after: « تظهر هنا الغيابات المعلنة فقط. إذا لم تتوفر معلومات، تظل جاهزية اللاعب غير مؤكدة. »
- `plus.brief.abs_honest_nofeed` FR before: « Notre fournisseur n’a listé aucune absence pour cette journée. Aucune information ne veut pas dire disponible : seuls les minutes jouées et les points publiés sont des faits. ». After: « Aucune absence n’est signalée pour cette journée. La disponibilité des joueurs reste à confirmer. »
- AR after: « لا توجد غيابات معلنة لهذه الجولة. تظل جاهزية اللاعبين غير مؤكدة. »

Class: technical leakage / defensive copy / awkward grammar. This preserves uncertainty without the assertion “we don't invent” or source pipeline details. If absence feed is wholly unavailable, do not display « aucune absence signalée » in a way that reads as a clean bill of health; use unavailable text in that branch.

### P2 — Transfer point deductions sound like paid transactions

Actual payment exists in BotolaGO+; Fantasy “paid transfers” must remain distinct.

- `fantasy.transfers.paid` FR before « Transferts payants » → « Transferts avec pénalité ».
- `plus.s2.m_paid` FR before « {n} payants » → « {n} avec pénalité »; AR « {n} مدفوعة » → « {n} بخصم نقاط ».
- `plus.s2.a_trf` FR before « Gain net des transferts, après pénalités, pour les journées {weeks} ({penalty} points par transfert payant) » → « Gain net des transferts, après pénalités, pour les journées {weeks} ({penalty} points par transfert supplémentaire) ».
- `plus.recap.tile_hits` AR « الغرامات » → « النقاط المخصومة ».
- `plus.recap.part_hit` AR « الغرامة {n} » → « خصم {n} ».
- `plus.recap.transfer_free` AR « {out} ← {in}: {gain} نقطة، بلا غرامة » → « {out} ← {in}: {gain} نقطة، دون خصم ».
- `plus.recap.transfer_line` AR « {out} ← {in}: {gain} نقطة، غرامة {hit} = {net} » → « {out} ← {in}: {gain} نقطة، خصم {hit} = {net} ».

Class: semantic clarity / terminology. Preserve all placeholders and existing arithmetic. `fantasy.transfers.paid` appears dictionary-only in current mounted reference scan; the Plus values are current UI copy.

### P2 — Briefing uses wrong/localization-inconsistent chip names

- `plus.brief.tr_honest` FR before: « Chaque transfert au-delà des transferts gratuits retire des points à votre score de {gw}. Wildcard et Free Hit n’en retirent aucun. ». After: « Chaque transfert au-delà de vos transferts gratuits retire des points à votre score de {gw}. Le Joker et le Free Hit évitent ces pénalités. »
- AR before: « كل انتقال يتجاوز الانتقالات المجانية يخصم نقاطًا من مجموعك في {gw}. لا تخصم Wildcard ولا Free Hit أي نقطة. ». After: « كل انتقال يتجاوز انتقالاتك المجانية يخصم نقاطًا من مجموعك في {gw}. الورقة الحرة والضربة الحرة تمنعان هذا الخصم. »

Class: terminology. PRODUCT sanctions Joker in French, and الورقة الحرة / الضربة الحرة in Arabic. Only transfer deductions are avoided; do not imply other negative scoring disappears.

### P2 — Prospects starts statistic says “official”

- `pepites.fact.starts` AR before « رسمي » → « أساسي » (compact statistic); use « مشاركات أساسية » if space permits.

Class: semantic error. FR corresponding field is « TITUL. ». An appearance in the starting lineup is not official status. Preserve count.

### P2 — Computation policy uses backend language where football language is available

- `fantasy.scoring.incrementalPolicy` FR before: « Les points et le classement sont actualisés après chaque match admissible. Ils peuvent encore changer pendant la journée. Les remplacements automatiques et le relais du capitaine attendent que la participation soit établie. ». After: « Les points et le classement sont actualisés après chaque match lorsque les données nécessaires sont disponibles. Ils peuvent encore changer pendant la journée. Les remplacements automatiques et le passage du brassard au vice-capitaine sont appliqués une fois la participation des joueurs confirmée. »
- AR existing text is substantially better and can remain: « تُحدَّث النقاط والترتيب بعد كل مباراة تتوفر بياناتها اللازمة، وقد تتغير النقاط خلال الجولة. تُطبَّق التبديلات التلقائية وانتقال شارة القيادة بعد التأكد من المشاركة. »
- `fantasy.scoring.ratingSafeguards` FR before: « Quand les points suivent la note, des données de participation essentielles manquantes retardent la validation, et une note publiée ou corrigée plus tard met à jour les points tant que la journée n’est pas validée. ». After: « Avec le barème par note, les points restent en attente si les données nécessaires sur la participation manquent. Une note publiée ou corrigée met à jour les points jusqu’à la validation de la journée. »
- AR after: « في الاحتساب حسب التقييم، تبقى النقاط قيد الانتظار إذا نقصت بيانات المشاركة اللازمة. ويُحدّث التقييم المنشور أو المصحّح النقاط ما دامت الجولة لم تُعتمد بعد. »

Class: technical leakage / readability. Retain pending participation, provisional points, auto substitutions, vice-captain takeover and validation boundary exactly.

### P2 — Generic “active chip” called Wildcard in Arabic

- `fantasy.points.active_chip` AR before « الجوكر المفعّل » → « الخاصية المفعّلة ».
- `fantasy.points.no_active_chip` corresponding Arabic should become « لا توجد خاصية مفعّلة ».
- `fantasy.transfers.chip_active` AR before « الجوكر المفعّل » → « الخاصية المفعّلة »; FR « Chip actif » → « Jeton actif ».
- `fantasy.transfers.no_hit_chip` FR « Aucune pénalité — chip actif » → « Aucune pénalité — jeton actif ».

Class: terminology. Reserve the specific four names for individual chips. The points label is mounted in `src/routes/fantasy.points.tsx:617`; generic transfer keys may be dormant.

### P2 — Broad “never any advertising” promise exceeds current-season access

- `plus.s3.f0.d` FR before « Vous ne verrez jamais de publicité dans l'application. » → « Profitez de l’application sans publicité pendant votre Saison. »
- AR before « لن ترى أي إعلان داخل التطبيق أبدًا. » → « استخدم التطبيق دون إعلانات طوال مدة موسمك. »

Class: inflated marketing / entitlement precision. This scopes the promise to paid access without changing it. Confirm ad-free is actually an entitlement; do not claim differentiation if whole app already has no ads.

### P2 — Prospects percentile language overclaims the meaning of 100

- `pepites.player.components_hint` FR before « 100 = meilleur que tous les joueurs comparés. Détails dans la méthode. » → « Un score élevé indique une meilleure position parmi les joueurs comparés. Détails dans la méthode. »
- AR after « كلما ارتفع المؤشر، تحسّن موقع اللاعب بين اللاعبين المقارَنين. التفاصيل في المنهجية. »
- `pepites.method.score_body`: replace only parenthetical « (100 = meilleur que tous les joueurs comparés) » with « (pour situer le joueur parmi les joueurs comparés) »; keep weights and five elements intact. Arabic equivalent « لتحديد موقع اللاعب بين اللاعبين المقارَنين ».

Class: factual precision. A percentile score can tie at the maximum and does not prove superiority to every comparator. Do not change percentile calculations or explanation of contribution's positional comparison.

### P2 — Timeline “moments forts” suggests footage

- `matches.timeline.highlights` FR before « Moments forts » → « Faits de match ».
- `matches.detail.section_failed.timeline` FR before « Impossible de charger les moments forts. » → « Impossible de charger les faits de match. »

Class: sports terminology. Timeline contains goals, cards and substitutions, not highlight videos. Arabic « أحداث المباراة » is appropriate. “Résumé” as a tab remains fine.

## P3 / lower-impact polish

- `matches.section.live`: « En direct maintenant » → « En direct »; duplicate immediacy.
- `club.stats.clean_sheets`: « Matchs sans encaisser » → « Matchs sans but encaissé »; idiomatic complete football phrase. Other short labels can retain clean sheets if incumbent context demands, but choose one family consistently.
- `fantasy.events.appearance`: « Apparition » → « Participation »; use `fantasy.points.event.appearance` if the displayed event uses the other family. Arabic المشاركة already correct.
- `fantasy.points.effective_captain`: « Capitaine effectif » → « Capitaine retenu »; clarify who counted in results, preserving fallback rules.
- `fantasy.points.raw_xi`: « XI brut » → « Points des titulaires » only if underlying number is pre-captain/pre-hit XI sum. Do not rename blindly if it includes substitutions differently. Current reference scan found dictionary key without mounted usage.
- `fantasy.free_transfers`: « Transferts libres » → « Transferts gratuits »; libre means out-of-contract in football. Current mounted scan did not find direct usage; `fpl.free_transfers` already correct.
- `plus.s2.tile_net`: « Net des transferts » → « Gain net des transferts »; specify the metric.
- `plus.s2.k_left` / `plus.s2.d_left`: « Laissés » / « Points laissés » → « Sur le banc » / « Points sur le banc » only if metric really is bench points. Verify data semantics first; a hindsight best-XI difference is different.
- `pepites.compare.choose_second`: « Choisir un adversaire » → « Choisir le second joueur »; statistical comparison does not imply these players played against each other.
- `pepites.compare.score`: « Rising » → « Indice Prospects » if owner wants user-facing English retired; this requires alignment with `pepites.score_name`, share exports and method. Arabic المؤشر is clearer already. Treat as a naming decision, not automatic rename.
- `pepites.fact.rating`: Arabic « تنقيط » → « تقييم » to match SofaScore scoring, method and player ratings. « تنقيط » is familiar Moroccan French-influenced usage, but consistency and MSA favor تقييم.
- `home.explore`: Arabic « استكشف {accent}بوتولاجو{/accent} » → « استكشف {accent}BotolaGO{/accent} »; only Latin brand form is sanctioned in PRODUCT.
- `plus.pay.soon_d`: « Revenez dans quelques jours : le paiement n'est pas encore ouvert. » → « Le paiement n’est pas encore ouvert. »; no confirmed availability date in code. Arabic « الدفع غير متاح بعد. ».
- `predictions.home.guest_line`: « Devinez les scores de la journée en 1 minute » → « Pronostiquez les scores de la journée »; remove unsupported speed claim. Arabic « توقّع نتائج مباريات الجولة ».
- `landing.why_title`: « Pourquoi vous allez revenir » → « À chaque journée »; makes the next content about actions instead of predicting retention.

## Delivery and policy copy requiring current-state verification

PRODUCT last records email and push delivery off. Code supports email availability checks, so do not replace an availability-aware active branch with blanket “unavailable” based on the dated product snapshot. Inspect current capability checks before final wording.

- `pepites.email.body` currently « Un e-mail par semaine avec le nouveau Top 10. Désactivé tant que vous ne l'activez pas. ». Proposed preference wording: « Choisissez de recevoir les nouveaux Top 10 par e-mail. » / « اختر تلقي الإصدارات الجديدة لأفضل 10 عبر البريد الإلكتروني. ». This removes fixed weekly SLA and defensive default-state detail; availability should be conveyed by actual control state.
- `fpl.notifications_body` promises reminders before every deadline and every recap. Preserve only in verified availability branch, and prefer « Vos préférences d’e-mails Fantasy sont activées. Retrouvez toujours la date limite dans l’application. » / « تفضيلات رسائل الفانتازي مفعّلة في حسابك. يمكنك دائمًا الاطلاع على الموعد النهائي في التطبيق. » if account preference is the only known state. `fpl.notifications_body_neutral` can be « Gérez vos rappels et vos e-mails Fantasy. La date limite reste affichée dans l’application. » / « تحكّم في تذكيراتك ورسائل الفانتازي. يبقى الموعد النهائي ظاهرًا في التطبيق. ».
- `auth.setup.notif_match_desc` « Coups de sifflet, buts et fins de match. » → « Coups d’envoi, buts et résultats. » / « انطلاق المباريات والأهداف والنتائج. » if all these categories really deliver. “Coups de sifflet” is vague.
- `auth.setup.notif_push_desc` promises app-closed delivery; valid only for native registered/permission-enabled push with verified sender capability. Do not assert active push merely because a device granted permission.
- `fantasy.meta.leagues_description` advertises cups; PRODUCT states cup backend absent. Use « Vos ligues BotolaGO Fantasy : classements et invitations pour vos amis. » / « دورياتك في BotolaGO Fantasy: الترتيب ودعوة أصدقائك. ». Read actual current route gating before editing other cup text.

## Technical/error families to simplify if currently reachable

Source searches found these dictionary keys; many appear inherited and may be unmounted. Do not spend functional-change scope reviving them.

- `fantasy.points.engine_source`: « Calculé par le moteur » / « محسوب بواسطة المحرك » → « Points BotolaGO » / « نقاط BotolaGO ».
- `fantasy.result.stable_restored`: « Résultat officiel affiché. » / « النتيجة الرسمية المعتمدة. » → « Résultat enregistré affiché. » / « النتيجة المحفوظة معروضة. ».
- `fantasy.result.cloud_stable`: « Résultat officiel enregistré. » / « نتيجة رسمية محفوظة. » → « Résultat enregistré. » / « تم حفظ النتيجة. ».
- `fantasy.cloud.offline`: « Hors ligne. Vos modifications restent locales et ne sont pas enregistrées — réessayez pour synchroniser. » → « Hors connexion. Vos modifications restent sur cet appareil. Réessayez pour les enregistrer sur votre compte. » / « لا يوجد اتصال. تبقى تعديلاتك على هذا الجهاز. أعد المحاولة لحفظها في حسابك. ».
- `fantasy.status.draft_restored`: « Brouillon restauré. Enregistrez pour synchroniser. » → « Brouillon retrouvé. Enregistrez-le sur votre compte. » / « استُعيدت المسودة. احفظها في حسابك. ».
- `fantasy.error.gameweek_unresolved`: « La journée en cours n'a pas pu être identifiée dans le cloud. » / « تعذّر تحديد الجولة الحالية في الخدمة السحابية. » → « Impossible de charger la journée en cours. Réessayez. » / « تعذّر تحميل الجولة الحالية. أعد المحاولة. ».
- `fantasy.import.mapping_gaps`: « Certains joueurs ne sont pas encore synchronisables : {ids} » → « Certains joueurs ne sont pas disponibles pour enregistrer cette équipe : {ids} ». Ideally do not expose opaque IDs; replacing IDs with names requires a separate behavior/data change and must not be disguised as pure text. Arabic « بعض اللاعبين غير متاحين لحفظ هذا الفريق: {ids} ».
- `fantasy.error.import_validation`: replace « formation légale » with « formation autorisée »; Arabic should state valid squad rather than legal judgment.

## Surface coverage and things to preserve

Reviewed public copy families: shell/search/language, home, news/article/save, fixtures/live/match tabs, table/club directory/club page, Fantasy intro/create/team/transfers/points/rankings/players/fixtures/rules/help/leagues, Pronostics match and rounds/private leagues/invites/votes/sharing, Prospects top 10/ranking/player/comparison/method/reveal/share/follow, Curva/card/onboarding/seasons/league cards/ratings, Plus offer/payment/member style/season/rivals/recap/briefing/trophies, prizes, authentication/account/profile/MFA/notifications/unsubscribe/deletion, landing, and legal content references. Admin, internal operations and demo-only fiction are not public product evidence.

Most existing compact score, matchup, deadline, empty-result, closed-vote, privacy, prize-block and league-invite copy is already restrained. Preserve Provisoire/مؤقت, unavailable-dash semantics, ElBotola source attribution, the free no-stake distinction, Moroccan time, actual total/history privacy, trophy permanence, published-versus-pending results and entitlement boundaries. Avoid replacing useful rules and uncertainty text with slogans merely to shorten screens.

Specific consistency decisions: keep « Prospects » / « المواهب » with /pepites identifiers; choose « Matchs » in French, which dictionaries already use; keep « Botola Pro Inwi » / « البطولة الاحترافية إنوي » only as competition header labels; do not introduce official-league affiliation. Preserve current « Lots du mois » wording only with its explicit four-journée block explanation. No evidence-based reason to alter captain ×2, rating fallback 5/0, Bench Boost, Joker/Free Hit restoration, prizes or manual payment instructions beyond clarity above.
