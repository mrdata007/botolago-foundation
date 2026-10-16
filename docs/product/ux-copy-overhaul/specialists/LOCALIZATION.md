# BotolaGO French and Arabic localization audit

Read-only source audit. No repository or database writes. AGENTS.md and CLAUDE.md read. Root agent remains the sole writer.

## Scope and limits

Read the complete Arabic dictionary and corresponding French source families; inspected public copy consumers, language chooser fallback, Manager Card interpolation, legal content, SofaScore queue and mapping copy architecture. Reviewed every public feature family represented by the dictionaries. Admin operational copy and legal prose require preserving role, verification, audit and retention facts; do not cut those simply because they are longer. Current screenshot review is pending the screen inventory lane. No rendered-layout finding is claimed below.

## Decisions

- Keep approved Fantasy glossary: الانتقالات / المستوى الأخير / الجاهزية / الجوكرات and approved chip names. Extend it to Pépites and Plus; انتقال is a purchased transfer while تبديل is a lineup substitution.
- Keep BotolaGO brand spelling in Latin consistently. Current Arabic text alternates بوتولاجو / بوطولاجو / بوطولا جو. Reusing the wordmark spelling avoids an invented transliteration policy.
- Use تقييم for a player or Manager Card rating, نقاط for game points. Pépites currently alternates تنقيط and تقييم; this makes score/rating distinction harder.
- Use مدرّب for Fantasy manager. League administrator remains مسؤول and technical/admin records keep their proper role terms.
- Keep موعد نهائي for Fantasy deadline in this pass. Briefing uses آخر أجل, which is natural Moroccan usage but inconsistent; use one term across labels if root elects to unify.
- Arabic repetition can be removed at the same visual call site as French. A blank dictionary value is a removal recommendation only: root must remove the rendered paragraph, preserve any meaningful state label, then remove unused dictionary keys in both languages.

## Exact before/after candidates

Blank after means remove the redundant visible line at its consumer, not ship an empty translation. Minor label and terminology fixes are included only where they reduce actual ambiguity.

### src/i18n/dictionary-fr.ts

| Key | Before | After |
| --- | --- | --- |
| `plus.rule` | Votre note ne change jamais, seul le style change. | Le style de la carte ne change pas votre note. |
| `plus.brief.abs_no_feed` | Aucune liste d’absences n’est disponible pour le moment. Nous n’en inventons pas. | Aucune liste d’absences disponible pour le moment. |
| `plus.brief.abs_honest` | Seules les absences listées par notre fournisseur apparaissent ici ; aucune information ne veut pas dire disponible. | Seules les absences signalées par notre fournisseur apparaissent ici. Sans information, la disponibilité reste à confirmer. |
| `plus.brief.abs_honest_nofeed` | Notre fournisseur n’a listé aucune absence pour cette journée. Aucune information ne veut pas dire disponible : seuls les minutes jouées et les points publiés sont des faits. | Aucune absence signalée pour cette journée. La disponibilité des joueurs reste à confirmer. |
| `plus.brief.opens_transfers` | Ouvre votre écran Transferts ; rien n’est enregistré ici. | À confirmer dans Transferts. |
| `plus.brief.opens_team` | Ouvre votre écran Équipe ; rien n’est enregistré ici. | À confirmer dans Équipe. |
| `plus.terms.norenew` | Rien ne se reconduit tout seul : aucun prélèvement automatique, rien à annuler. | Sans renouvellement ni prélèvement automatique. |
| `plus.note.example` | Exemple · une illustration de ce que vous verrez | Exemple |
| `auth.callback.subtitle` | Nous finalisons votre authentification. | REMOVE visible paragraph |
| `auth.register.subtitle` | Rejoignez la communauté BotolaGO en moins d'une minute. | REMOVE visible paragraph |
| `notifications.empty_body` | C’est ici que s’affichent vos notifications. | REMOVE visible paragraph |
| `notifications.signin_body` | Elles sont rattachées à votre compte BotolaGO. | REMOVE visible paragraph |
| `news.saved.signin_body` | Vos articles enregistrés sont liés à votre compte. | REMOVE visible paragraph |
| `fantasy.rankings.subtitle` | Le classement de tous les managers de la saison. | REMOVE visible paragraph |
| `fantasy.top.subtitle` | Les meilleurs joueurs de la journée selon leurs performances et leurs points Fantasy. | REMOVE visible paragraph |
| `landing.faq_body` | Tout ce qu'il faut savoir avant de composer votre équipe. | REMOVE visible paragraph |
| `plus.pay.wa_hint` | Votre reçu et votre code partent ensemble : nous retrouvons votre compte. | Votre code est déjà dans le message. Ajoutez votre reçu avant de l’envoyer. |
| `plus.pay.title` | Payer ma Saison | Payer ma Saison |
| `plus.s3.cta` | Payer ma Saison | Payer ma Saison |
| `plus.recap.share_waiting` | {n} note en attente | Notes en attente : {n} |
| `plus.tr.prog_rating_none` | Note {need} requise, vous êtes sans note | Note requise : {need}. Pas encore de note. |

### src/i18n/dictionary-ar.ts

| Key | Before | After |
| --- | --- | --- |
| `plus.rule` | تقييمك لا يتغيّر أبدًا، الأسلوب وحده يتغيّر. | اختيار أسلوب البطاقة لا يغيّر تقييمك. |
| `plus.brief.abs_no_feed` | لا توجد قائمة غيابات متاحة حاليًا. نحن لا نخترع قائمة. | قائمة الغيابات غير متاحة حاليًا. |
| `plus.brief.abs_honest` | تظهر هنا فقط الغيابات التي يعلنها مزوّد بياناتنا؛ غياب المعلومة لا يعني أن اللاعب جاهز. | تظهر هنا الغيابات التي يعلنها مزوّد البيانات فقط. غياب المعلومات لا يؤكد جاهزية اللاعب. |
| `plus.brief.abs_honest_nofeed` | لم يعلن مزوّد بياناتنا أي غياب لهذه الجولة. غياب المعلومة لا يعني أن اللاعب جاهز: الحقائق الوحيدة هي الدقائق التي لُعبت والنقاط المنشورة. | لم تُعلن غيابات لهذه الجولة. جاهزية اللاعبين غير مؤكدة. |
| `plus.brief.opens_transfers` | يفتح شاشة الانتقالات؛ لا يُحفظ شيء هنا. | أكّد اختيارك في شاشة الانتقالات. |
| `plus.brief.opens_team` | يفتح شاشة فريقك؛ لا يُحفظ شيء هنا. | أكّد اختيارك في شاشة الفريق. |
| `plus.terms.norenew` | لا شيء يُعاد من تلقاء نفسه: لا خصم تلقائي ولا شيء يحتاج إلى إلغاء. | بلا تجديد أو اقتطاع تلقائي. |
| `plus.note.example` | مثال · توضيح لما ستراه | مثال |
| `notifications.empty_body` | هنا تظهر إشعارات حسابك. | REMOVE visible paragraph |
| `notifications.signin_body` | إشعاراتك مرتبطة بحسابك في BotolaGO. | REMOVE visible paragraph |
| `news.saved.signin_body` | المقالات المحفوظة مرتبطة بحسابك. | REMOVE visible paragraph |
| `fantasy.rankings.subtitle` | ترتيب جميع المدربين لهذا الموسم. | REMOVE visible paragraph |
| `fantasy.top.subtitle` | أفضل لاعبي الجولة حسب الأداء ونقاط الفانتازي. | REMOVE visible paragraph |
| `landing.faq_body` | كل ما تحتاج معرفته قبل تشكيل فريقك. | REMOVE visible paragraph |
| `fantasy.leagues.manager` | المدير | المدرّب |
| `fantasy.leagues.search_manager` | ابحث عن مدير | ابحث عن مدرّب |
| `plus.tr.prog_rank_none` | تُمنح في نهاية الموسم، في دوري خاص يضم 3 مدراء أو أكثر. | تُمنح في نهاية الموسم، في دوري خاص يضم 3 مدرّبين أو أكثر. |
| `plus.tr.vis_hint` | يرى مدراء دورياتك الخاصة الكؤوس التي ربحتها، وليس نقاطك أو تقييماتك أو مستوياتك. ولا أحد غيرهم. | يرى مدرّبو دورياتك الخاصة الكؤوس التي ربحتها فقط. نقاطك وتقييماتك ومستوياتك تبقى مخفية. |
| `plus.recap.transfer_badge` | تبديل | انتقال |
| `plus.recap.cause_transfer` | تبديل | الانتقال |
| `plus.recap.tile_best_transfer` | أفضل تبديل | أفضل انتقال |
| `plus.recap.tile_worst_transfer` | التبديل الأكثر كلفة | الانتقال الأكثر كلفة |
| `plus.recap.others_line` | محسوب كباقٍ: الفارق ناقص القائد والتبديل. لم يُقَس بعد لاعباً بلاعب. | الفارق المتبقي بعد احتساب القائد والانتقال، دون مقارنة كل لاعب على حدة. |
| `plus.recap.share_message` | جولتي {n} على بوطولاجو: {points} نقطة. | جولتي {n} على BotolaGO: {points} نقطة. |
| `plus.tr.share_message` | كأسي «{label}» على بوطولا جو، فانتازي البطولة الاحترافية. | كأسي «{label}» على BotolaGO، فانتازي البطولة الاحترافية. |
| `home.explore` | استكشف {accent}بوتولاجو{/accent} | استكشف {accent}BotolaGO{/accent} |
| `pepites.sort.form` | الجاهزية | المستوى الأخير |
| `pepites.reveal.form` | المستوى | المستوى الأخير |
| `pepites.compare.form` | المستوى | المستوى الأخير |
| `pepites.component.form` | المستوى | المستوى الأخير |
| `pepites.method.inputs_title` | التقييم والجاهزية | التقييم والمستوى الأخير |
| `pepites.method.inputs_body` | يُحتسب متوسط التقييم ابتداءً من {rated} مباريات مُقيَّمة. الجاهزية هي متوسط آخر {window} مباريات مُقيَّمة. إذا غاب عنصر، تزداد أهمية العناصر الأخرى، ويجب توفر نصف الأوزان على الأقل للتصنيف. | يُحتسب متوسط التقييم ابتداءً من {rated} مباريات مُقيَّمة. المستوى الأخير هو متوسط آخر {window} مباريات مُقيَّمة. إذا غاب عنصر، يزداد وزن العناصر الأخرى، ويجب توفر نصف الأوزان على الأقل للتصنيف. |
| `pepites.method.score_body` | خمسة عناصر، يُحوَّل كل منها إلى نسبة مئوية (100 = أفضل من كل اللاعبين الذين قورن بهم)، ثم تُرجَّح: متوسط التقييم {rating}، الجاهزية {form}، المساهمة {contribution}، التطور {progression}، دقائق اللعب {minutes}. | خمسة عناصر، يُحوَّل كل منها إلى ترتيب مئيني (100 = أفضل من كل اللاعبين الذين قورن بهم)، ثم تُرجَّح: متوسط التقييم {rating}، المستوى الأخير {form}، المساهمة {contribution}، التطور {progression}، دقائق اللعب {minutes}. |
| `pepites.player.percentiles` | النسب المئوية | الترتيب المئيني |
| `pepites.fact.starts` | رسمي | أساسي |
| `pepites.compare.starts` | أساسي | مشاركات أساسية |
| `pepites.fact.rating` | تنقيط | التقييم |
| `pepites.table.rating` | تنقيط | التقييم |
| `pepites.compare.rating` | التنقيط | التقييم |
| `pepites.component.rating` | متوسط التنقيط | متوسط التقييم |
| `pepites.matches.trend_title` | التنقيط · آخر 10 مباريات | التقييم · آخر 10 مباريات |
| `pepites.matches.no_ratings` | لا يوجد تنقيط بعد. | لا يوجد تقييم بعد. |
| `pepites.share.legend` | التنقيط · المستوى · المساهمة · التطور · وقت اللعب | التقييم · المستوى الأخير · المساهمة · التطور · وقت اللعب |
| `pepites.share.story_stats` | {minutes} د · تنقيط {rating} | {minutes} د · تقييم {rating} |
| `pepites.method.top_title` | أفضل 10 الأسبوع | أفضل 10 لهذا الأسبوع |
| `pepites.report.field_label` | ما هو الخاطئ | المعلومة الخاطئة |
| `pepites.report.message_label` | ما هو الصحيح | المعلومة الصحيحة |
| `pepites.email.title` | توب 10 عبر البريد الإلكتروني | أفضل 10 عبر البريد الإلكتروني |
| `pepites.email.body` | رسالة واحدة في الأسبوع مع توب 10 الجديد. معطّلة ما لم تفعّلها بنفسك. | أفضل 10 لهذا الأسبوع في رسالة واحدة. فعّل الاشتراك لتصلك. |
| `pepites.email.sign_in_reason` | سجّل الدخول لتتلقى توب 10 من المواهب عبر البريد الإلكتروني. | سجّل الدخول لتتلقى أفضل 10 من المواهب عبر البريد الإلكتروني. |
| `pepites.email.off_toast` | لن تتلقى توب 10 عبر البريد الإلكتروني بعد الآن. | تم إيقاف رسالة أفضل 10. |
| `pepites.email.blocker_unconfirmed` | أكّد عنوان بريدك الإلكتروني لتتلقى توب 10. | أكّد عنوان بريدك الإلكتروني لتتلقى أفضل 10. |
| `pepites.email.blocker_guest` | أنشئ حسابًا بعنوان بريد إلكتروني لتتلقى توب 10. | أنشئ حسابًا بعنوان بريد إلكتروني لتتلقى أفضل 10. |
| `pepites.email.blocker_off` | رسائل BotolaGO الإلكترونية معطّلة لديك: فعّلها في ملفك الشخصي لتتلقى توب 10. | فعّل رسائل BotolaGO في ملفك الشخصي لتتلقى أفضل 10. |
| `fantasy.points.finalize_confirm_desc` | سيتم حفظ النتيجة، واحتساب الجوكر المفعّل كمُستخدَم، واستعادة تشكيلة Free Hit عند الاقتضاء. | ستُحفظ النتيجة ويُحتسب الجوكر المفعّل كمُستخدَم، وتُستعاد التشكيلة السابقة للضربة الحرة عند الحاجة. |
| `fantasy.points.free_hit_restored` | تمت استعادة تشكيلة Free Hit. | تمت استعادة التشكيلة السابقة للضربة الحرة. |
| `fantasy.freehit.restored` | تمت استعادة الفريق الأصلي بعد الـ Free Hit. | تمت استعادة الفريق الأصلي بعد الضربة الحرة. |
| `plus.brief.tr_honest` | كل انتقال يتجاوز الانتقالات المجانية يخصم نقاطًا من مجموعك في {gw}. لا تخصم Wildcard ولا Free Hit أي نقطة. | كل انتقال يتجاوز الانتقالات المجانية يخصم نقاطًا من مجموعك في {gw}. لا تُخصم نقاط عند استخدام الورقة الحرة أو الضربة الحرة. |
| `fantasy.points.event.own_goal` | هدف في المرمى الخاطئ | هدف عكسي |
| `fantasy.events.own_goal` | هدف بالخطأ | هدف عكسي |
| `fantasy.events.penalty_save` | تصدي ركلة جزاء | تصدٍّ لركلة جزاء |
| `fantasy.points.captain_bonus` | بونص القائد | نقاط القائد الإضافية |
| `fantasy.points.raw_xi` | التشكيلة الأساسية (خام) | التشكيلة الأساسية قبل التعديلات |
| `player.status.doubtful` | مشكوك | مشاركته غير مؤكدة |
| `auth.callback.title` | جاري تسجيل الدخول | جارٍ تسجيل الدخول |
| `auth.callback.subtitle` | نُنهي عملية المصادقة الآن. | REMOVE visible paragraph |
| `auth.register.subtitle` | انضم إلى مجتمع BotolaGO في أقل من دقيقة. | REMOVE visible paragraph |
| `profile.legal.privacy_desc` | البيانات التي نجمعها وما نقوم به تجاهها. | البيانات التي نجمعها وكيف نستخدمها. |
| `profile.mfa_setup_desc` | أمّن حسابك برمز استخدام واحد. | احمِ حسابك برمز إضافي من تطبيق المصادقة. |
| `fantasy.empty.subtitle` | قم ببناء فريقك المكوّن من 15 لاعبًا للبدء. | اختر 15 لاعبًا لتكوين فريقك. |
| `fantasy.empty.builder_open` | فتح منشئ الفريق | تكوين فريقي |
| `fantasy.create.error.rejected` | فريقك لا يحترم إحدى قواعد اللعبة. راجع تشكيلتك ثم أعد المحاولة. | راجع تشكيلتك وتأكد من استيفاء قواعد اللعبة، ثم أعد المحاولة. |
| `fantasy.create.discard_desc` | سيتم إزالة جميع اللاعبين المختارين ومسح المسودة المحلية. | ستُزال اختياراتك وتُمسح المسودة المحفوظة على هذا الجهاز. |
| `plus.pay.title` | ادفع موسمي | ادفع ثمن موسمي |
| `plus.s3.cta` | ادفع موسمي | ادفع ثمن موسمي |
| `plus.pay.wa_hint` | يصلنا إيصالك ورمزك معًا: نجد حسابك بسهولة. | رمزك موجود في الرسالة. أرفق إيصال الدفع قبل إرسالها. |
| `plus.s3.f0.d` | لن ترى أي إعلان داخل التطبيق أبدًا. | تصفّح التطبيق بلا إعلانات طوال الموسم. |
| `plus.s3.f2.d` | كل إحصائية، جولة بعد جولة، وأفضل أسابيعك. | كل إحصائية، جولة بعد جولة، وأفضل جولاتك. |
| `plus.pick.standard_d` | معدن مستواك. | مظهر بطاقتك حسب مستواك. |
| `plus.recap.share_waiting` | {n} تقييم بانتظار النشر | تقييمات بانتظار النشر: {n} |
| `plus.recap.pending_many` | {n} لاعبين: تقييمات بانتظار النشر | لاعبون بانتظار التقييم: {n} |
| `plus.tr.prog_rating_none` | يلزم تقييم {need}، وأنت بلا تقييم | التقييم المطلوب: {need}. لا تقييم لك بعد. |

## Additional non-dictionary findings

- `src/content/legal/documents.ts:225,231,552`: Arabic legal documents still call chips الرقاقات and الرقاقات (chips). Terminology-only replacement is الجوكرات. Preserve all surrounding legal statements and version dates.
- `src/content/legal/prize-terms.ts:153`: Wildcard وFree Hit → الورقة الحرة والضربة الحرة. Preserve the tiebreak exclusion itself.
- `src/routes/pepites.index.tsx:15`: hardcoded OG title says `Prospects · المواهب — توب 10 | BotolaGO`; use `Prospects · المواهب — أفضل 10 | BotolaGO` if root retains the bilingual static OG strategy.
- `src/components/admin/sofascore-player-queue/copy.ts` AR `intro` literal «تُعاد محاولة المباراة» means retry the match rather than retry its processing. Suggest «تُعاد معالجة المباراة تلقائيًا» wherever this describes data refresh. Keep the approximately 15-minute timing at confirmation/success where it is operationally useful.
- Queue AR count/candidates/seenTimes functions use a generic plural for all values except 1; 2 and 11+ need different forms. This is not limited to subtext; if in scope use counted-noun families or neutral labels «بانتظار التأكيد: {n}»، «مرشحون: {n}»، «عدد مرات الظهور: {n}».

## High-priority semantic findings

1. Both languages say Plus styling means your rating never changes (`plus.rule`). The real promise is that choosing a style does not change the rating. Current absolute contradicts the Manager Card lifecycle.
2. `pepites.sort.form` and method prose call recent form availability. This contradicts Fantasy glossary and the underlying recent-match mean.
3. Arabic percentile was translated as ordinary percentage. Keep the displayed 100-point definition while naming the ranking concept correctly.
4. `plus.s3.f0.d` says no ads ever, despite a season-limited pass. Match the subscription duration without changing the ad-free entitlement.
5. `plus.s3.f2.d` says best weeks while all game lifecycle content uses rounds. Use أفضل جولاتك.
6. `plus.brief.abs_no_feed` has defensive self-praise (“we do not invent a list”). Delete that sentence in both languages, retain unavailable state. Preserve the separate meaningful distinction that no report is not proof a player is available.

## RTL and wrapping checks needed on rendered screens

- `src/components/manager-card/interpolate.tsx` already isolates numeric values and complete fractions. Preserve it. Do not manually add isolation marks to all dictionary strings or duplicate isolation.
- This helper does not isolate arbitrary Latin names, links, formation strings, codes or brand names. Consumers should use existing `auto()` / `ltr()` / `isolateText()` where needed. Inspect share messages (`plus.recap.share_message`, `plus.tr.share_message`, card m6) at Arabic mobile widths.
- `plus.recap.transfer_line`, `transfer_free`, `transfer_wait` encode an arrow between outgoing and incoming names; inspect with one Arabic and one Latin player name before deciding arrow direction or sentence reordering. Wording replacement alone cannot certify the data movement reads correctly.
- `plus.pay` RIB, reference code and copied text must remain LTR as entire tokens. Never introduce spaces into actual copied bank or code values while shortening helper text.
- Home/deadline strings using `ج{gw}` are compact but less natural than `الجولة {gw}` in explanatory prose. Expand in prose where space allows, retain established compact axis labels when necessary.
- `fpl.team_name_help` and `fantasy.create.error.team_name` contain a punctuation allowlist in an RTL sentence. Preserve the validation facts and isolate the complete punctuation token run in the consumer.
- Score/time/range sequences must be checked with actual glyph positions at 390px, not only `scrollWidth`, because repository clips overflow. Long Arabic action labels such as player.status.doubtful should be checked in their pill at mobile width.

## Keep rather than remove

- Unsaved-draft persistence warnings, deadline boundaries, device-local save distinctions, public-share privacy, delete-account irreversibility/timing and retention, payment receipt/reference instructions, season term and activation condition.
- `fantasy.scoring.*`, rules formulas and ratings timing are business facts. Suggest shortening only after confirming their exact consumer; no automatic rewrite of their meaning.
- `pepites.coverage.no_dob` Arabic غير مقيَّمين matches French Non évalués. An earlier exploratory message proposed غير مؤهلين; do not treat that as a proven translation defect.
- Arabic {n} لاعبين in the 3–10 family is a valid counted plural; do not replace with لاعبون simply for agreement.

## Supporting-copy KEEP ledger

Full original supporting-string audit: `/tmp/botolago-localization-ledger.md` and machine-readable `/tmp/botolago-localization-ledger.json`. Every retained row states its preservation reason; the root screen audit can supersede localization KEEP when it proves visible duplication.

## Rendered evidence reviewed

Reviewed `/tmp/botolago-screens/verified/ar-mobile-home.png` using the image viewer. It visibly renders Arabic RTL, with الجولة 14, readable 1–1 score and Arabic club names, compact Fantasy deadline strip, navigation labels, Fantasy team chips and Arabic news cards. No visible text clipping or overlap attributable to these strings in this capture. The long full-page image demonstrates a populated development mock state, not production.

The earlier `/tmp/botolago-screens/baseline/ar-mobile-home.png` visibly rendered French despite its filename. It was rejected as Arabic evidence and the capture lane recaptured into `verified/`. Use only verified files for language claims.

## Review of UX lane Arabic proposals

`/tmp/botolago-ux-ar-normalized.json` contains singular-address corrections preserving the established app voice, plus terminology and literal-translation corrections. Do not normalize third-person plurals about other managers (such as إذا اختاروا مشاركتها) into imperatives.

Additional semantic checks sent to root:

- `fantasy.cloud.mapping_unavailable`: identity/player synchronization unavailable is not the same fact as an unavailable player-list refresh. Use “Impossible de synchroniser les joueurs. Réessayez.” / “تعذّرت مزامنة اللاعبين. أعد المحاولة.”
- `auth.mfa.aal_label`: current sign-in is تسجيل الدخول الحالي; الاتصال الحالي suggests network connectivity.
- `fpl.team_name_help`: retain ASCII apostrophe in the literal punctuation allowlist; typographic apostrophe is a different character.
- `prizes.intro`: preserve “consecutive” / متتالية for the four-round period.
- `pepites.ranking.desktop_lede`: مؤشر الصعود names the score; المستوى الأخير names recent form.
- `predictions.personal.failed`: use توقعاتك المحفوظة rather than النتائج المحفوظة, because saved predictions are not official match results.
- `matches.detail.no_events` / `no_stats`: avoid replacing a true not-started state with an unconditional promise of feed coverage after kickoff.
- `plus.pay.wa_hint`: validated natural singular Arabic “رمزك موجود في الرسالة. أرفق إيصال الدفع قبل إرسالها.” It correctly distinguishes the prefilled reference from the receipt the person must attach.

Reviewed `/tmp/botolago-screens/verified/ar-mobile-matches.png`, `ar-mobile-briefing.png`, `ar-mobile-plus-offer.png`, `ar-mobile-plus-payment.png` and `ar-mobile-pepites.png`. Arabic and RTL are visible in every image.

Observed briefing copy-direction defect: first-card label `plus.brief.card_of` is rendered as البطاقة 4/1 rather than 1/4. The template contains one isolated placeholder followed by the literal /4, which is outside the interpolation helper's two-placeholder fraction merge. Recommended copy-only replacement: البطاقة {n} من 4. Same unsafe pattern occurs in `plus.brief.cap_diff` (الصعوبة {d}/5) and `fpl.players_selected` ({n}/15 لاعبًا, direct string replacement in fantasy.create.tsx:456,584). Exact direction-safe proposals added to the proposals JSON and Arabic normalization map; total proposals now 85.

Observed Plus payment reference code is correctly ordered LTR. Long RIB wraps its final two digits onto another line in the mobile mock screenshot; this is a baseline layout concern, not justification to edit the copied bank data. Plus offer shows the overbroad “never any ad” promise and awkward “pay my season” Arabic CTA, confirming those recommendations affect visible screens. Pépites shows mixed rating terminology and mixed توب 10/أفضل 10, confirming glossary normalization targets.
