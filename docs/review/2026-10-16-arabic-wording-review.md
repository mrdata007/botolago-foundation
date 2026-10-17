# Arabic wording review sheet

Date: 2026-10-16. Prepared for a native Arabic reader. Nothing in this sheet changes the app: it lists wording that is already in the code on `main` so that someone who reads Arabic natively can approve it or propose a correction. No database was touched and no code or dictionary was edited to make this sheet.

Explanations are in plain English; the French original is next to every Arabic line so that a reader who knows French can check the meaning.

## At a glance

- **574 dictionary strings** are new or changed in Arabic: **192** from the audit work (Phases A, B, C, D and follow-ups) and **382** from BotolaGO+ screens that were merged into `main` during the same period (Part 2). Part 3 adds **36** more lines that live outside the dictionary (e-mails, notification templates, trophy names in the database). Part 4 lists **87** lines on a staff-only admin screen.
- Total to review: **697** lines. If time is short, do Part 1 and the “Points needing special attention” first: that is where the audit asked for a native reader.
- Compared: `main` just before the first Phase A change (`aa7c59dd`, parent of PR 489) against `main` now (`8779e75f`, PR 504).

| Source                               | Pull request  | Merge commit           | Arabic dictionary strings added or changed   |
| ------------------------------------ | ------------- | ---------------------- | -------------------------------------------- |
| Phase A                              | #489          | `9401ced7`             | 36                                           |
| Phase B                              | #490          | `89cb5492`             | 54                                           |
| Phase C                              | #495          | `55e075e1`             | 69                                           |
| Same-minute goal order               | #496          | `8fd23155`             | 0 (no Arabic text)                           |
| Phase D                              | #497          | `4b283a4a`             | 33                                           |
| Morocco-time fix (database)          | #500          | `43b31818`             | 0 (no Arabic wording; see “Dates and times”) |
| Weekly Top 10 bell notification      | #504          | `8779e75f`             | 0 in the dictionary; 1 database title (D-01) |
| BotolaGO+ round recap                | #491          | `21fee466`             | 77                                           |
| BotolaGO+ rivals, briefing, trophies | #492 and #494 | `5656ac10`, `5f2f86d6` | 247                                          |
| BotolaGO+ Saison                     | #501 and #502 | `83e4a081`, `01537232` | 58                                           |

Counts follow the last pull request that touched each string (a string changed twice is counted once). Rivals, briefing and trophies were developed on three branches that were merged into one, so they arrive together under #494.

How these were found: the Arabic dictionary (`src/i18n/dictionary-ar.ts`) was loaded at each merge commit above and compared key by key with the version before Phase A; the other Arabic sources were found with `git diff` over `src/`, `supabase/` and `scripts/`. The French dictionary was compared the same way, so the French shown is the current French. When a string only changed in French, it is not listed (9 such keys exist, for example `nav.matches`, because the French word “Matches” became “Matchs”).

## How to review

1. Read the row in the order: French, then Arabic. Ask: does the Arabic say the same thing, in natural Arabic, in a tone suitable for a football game app (Moroccan readers, formal enough, not stiff)?
2. Tick **Approve** if it is fine as written. If not, leave it unticked and write your wording in **Change to** (full replacement text, keep any `{placeholder}` exactly as it is).
3. Words in `{braces}`, such as `{n}` or `{name}`, are filled in by the app (a number, a name, a date). Do not translate them or move them out of the sentence. If the sentence reads better with the placeholder somewhere else, write it that way.
4. The **Where it appears** column says which screen shows the text and lists what to check. “Was:” gives the previous Arabic when the line was changed, so you can see what is being replaced.
5. Rows marked “Plural form” are one sentence written once per Arabic number rule. See “Counts” below: you only need to check that each form is right for the numbers it covers.
6. Where you are unsure between two options, write both in **Change to** and say which you prefer; the owner will decide.

Please note, before you start:

- The app addresses the reader in the masculine singular (“سجّل الدخول”, “اختر”). This is a convention across the whole app, not a mistake in these lines.
- Digits are always Latin (0-9), also in Arabic text. Dates are written by the browser with Moroccan month names (see “Dates and times”).
- Two tanwin spellings appear in different files: 10 of these strings use “اً” (fathatan before alif, older style) and 59 use “ًا” (fathatan on the alif, newer style). Pick one convention if you have a preference.
- An Arabic cell may contain invisible direction marks (U+2066 to U+2069) that keep Latin letters and numbers in order. They are not visible; keep them if you retype a line that has them (`auth.error.username_invalid`, `plus.recap` names).

## Points needing special attention

These are the lines and families where the earlier audits already asked for a native reader, or where this review found something. Each item points to row numbers in the tables.

### 1. Brand word: المواهب (Prospects)

The under-23 section was “Pépites” in French and “جواهر” (“jewels”) in Arabic. By owner decision of 2026-10-15 (audit finding LOC-09) it is now **Prospects** in French and **المواهب** in Arabic (“the talents”). The Arabic is not a translation of the English word “Prospects”: it means talents. See group X below, the e-mail rows E-01 to E-08 and the bell title D-01. Please decide:

- Does “المواهب” read as a section name when used alone, for example “المواهب قريبًا” (soon), “في المواهب” (in Prospects), “ترتيب المواهب” (the Prospects ranking), “رسالة المواهب” (the Prospects e-mail)?
- The Top 10 is written “أفضل 10” in page titles (for example X-10) but “توب 10” in e-mail, e-mail sign-up and bell texts (E-02, E-03, D-01, X-15). Should the two match?
- Open point from the Phase C report, not changed here: the Prospects method pages (unchanged lines such as `pepites.sort.form`, `pepites.method.inputs_title`) still call a player’s form “الجاهزية”, while the Fantasy screens now call form “المستوى الأخير” and keep “الجاهزية” for availability (`fantasy.picker.filter_status`). Which word should the Prospects pages use for form?

### 2. Counts and plural forms

Arabic needs a different phrase for 0, 1, 2, 3 to 10, 11 to 99, and 100 and over. The app picks the form from the number (it uses the standard Arabic rule, `Intl.PluralRules("ar")`, with these categories):

| Form  | Numbers                  | Example from the app |
| ----- | ------------------------ | -------------------- |
| zero  | 0                        | “لا يوجد لاعب مطابق” |
| one   | 1                        | “عرض لاعب واحد”      |
| two   | 2                        | “عرض لاعبين”         |
| few   | 3 to 10 (also 103, 1003) | “عرض 5 لاعبين”       |
| many  | 11 to 99 (also 111)      | “عرض 12 لاعبًا”      |
| other | 100 and over             | “عرض 100 لاعب”       |

Which families have which forms (only forms that exist are listed; a form that is not written is replaced by “other”):

| Family                                 | Forms written                                                                              | Rows                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------- |
| Player picker button                   | zero, one, two, few, many, other                                                           | T-30 to T-35                  |
| Transfer confirmation headline         | one, two, few, many, other (no zero: cannot happen)                                        | T-19 to T-23                  |
| Header search result count             | one, two, few, other (11 and over share “other”)                                           | H-04 to H-07                  |
| Guest picks not yet saved              | one, two, few, other                                                                       | R-02 to R-05                  |
| Free transfers (deadline card, picker) | one, two, few, other (free transfers never exceed 2 today, so few and other cannot appear) | T-02 to T-05 and T-24 to T-28 |
| Rivals record                          | wins, losses, ties: one, two, few, other                                                   | RV-21 to RV-32                |
| Briefing transfers                     | one, two, and one phrase for 3 or more                                                     | BR-90 to BR-92                |

What to check, in order of risk:

- **T-22**, **T-34**: the dual forms (“انتقالين”, “لاعبين”). Written without vowel marks, “عرض لاعبين” reads both as “two players” and as “players”. Decide whether to write the dual differently.
- **T-20** and **T-31**: used from 100 up, singular after the number (“100 انتقال”, “100 لاعب”). The 11 to 99 forms are separate rows (“انتقالًا”, “لاعبًا”).
- **Fixed counted words.** Some lines put a number before a noun and use one form for every number, because the number is usually in a known range or the sentence was not split into forms. The auto-check marks these rows “Counted word is in a fixed form”. The main ones are: “نقطة” after any score (for example “5 نقطة”; correct Arabic for 3 to 10 is “نقاط”); “{n} لاعبين” in the recap when n could be 11 or more; “{n} مدربين” (league size) in the recap; “{n} جولات” (rounds) in the recap season line; “{n} أُطر” (frames); “{k} جولات من {n}”; and “عضو” after a member count (G-03). Tell us, per case, whether to (a) keep as is, (b) add forms, or (c) reword to avoid a number before the noun (as done for the trophy count: “{n} من الكؤوس”).

### 3. Fantasy glossary (Phase C): الانتقالات, الجوكر, المستوى الأخير

Audit finding LOC-04: the same idea had several Arabic names. One glossary was applied across about 40 keys, and a test blocks the old words from returning:

| Idea        | French       | Arabic now               | Arabic before                             |
| ----------- | ------------ | ------------------------ | ----------------------------------------- |
| Transfers   | Transferts   | الانتقالات               | التحويلات (also “تحويل” = money transfer) |
| Chip        | Jeton / Chip | الجوكر (plural الجوكرات) | الرقاقة / الرقائق (“electronic chip”)     |
| Active chip | Jeton actif  | الجوكر المفعّل           | الرقاقة النشطة / المفعّلة                 |
| Form        | Forme        | المستوى الأخير           | الحالة, الفورمة, المستوى                  |

The four chip names stay as already approved: الورقة الحرة (Wildcard), الضربة الحرة (Free Hit), تعزيز الاحتياط (Bench Boost), القائد الثلاثي (Triple Captain). Please confirm the glossary as a whole. Two known gaps for you to rule on: (1) the Terms and Privacy pages still say “الرقاقات” (generated legal text, not edited); (2) the briefing page (BR-94) shows the Latin names Wildcard and Free Hit instead of the approved Arabic names.

### 4. Words used differently on different screens

The BotolaGO+ screens were written by separate lanes; the review found these differences between them and the glossary above:

| Idea                      | Used in the audit screens                                     | Used in BotolaGO+                                   | Rows                                    |
| ------------------------- | ------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------- |
| Transfer                  | انتقال (glossary)                                             | تبديل (“swap/substitution”) in the recap            | RC-23, RC-33, RC-70, RC-71              |
| Manager                   | مدرب / مدربين (coach)                                         | مدراء (“directors”) in trophies                     | TR-75, TR-78 (trophies) vs RV-59, RC-49 |
| Deadline                  | الموعد النهائي (Fantasy e-mails and notifications, unchanged) | آخر أجل in the briefing                             | BR-02, BR-07, BR-09                     |
| Replace a player          | (not used)                                                    | تعويض in the briefing (“compensation”)              | BR-35, BR-53                            |
| Brand BotolaGO            | BotolaGO in Latin letters                                     | بوطولاجو (recap share) and بوطولا جو (trophy share) | RC-58, TR-57                            |
| The offer called “Saison” | (n/a)                                                         | الموسم, which is also the football season           | group SE, starting at SE-03             |
| Status of a stopped match | (n/a)                                                         | متوقفة مؤقتًا (adjective) next to أُوقفت (verb)     | M-01, M-02                              |

### 5. Dates and times

- **Morocco time.** Morocco is UTC+0 from 2026-09-20 (the app’s rule), and every date shown in these lines uses it. Where a line has `{date}` or `{time}`, the app inserts it (the Arabic never contains a hard-coded date).
- **Arabic dates** are written by the browser in the Moroccan style with Latin digits, for example “14 أكتوبر 2026”, “3 شتنبر 2026”, “3 دجنبر 2026” (Moroccan month names: يناير, فبراير, مارس, أبريل, ماي, يونيو, يوليوز, غشت, شتنبر, أكتوبر, نونبر, دجنبر). These month names are not in the dictionary; please say if you want other names.
- **Fantasy deadline in notifications.** PR 500 (migration 20261016090100) fixed the deadline time printed in push, in-app and e-mail Fantasy reminders, which was one hour late. That migration contains **no Arabic wording**. The Arabic templates that receive the time were not changed: “الموعد النهائي للفانتازي بعد 24 ساعة / بعد ساعة” with “ثبّت فريقك قبل {{deadline}}”. The time comes in the form `DD/MM HH:MM` (for example `12/10 18:30`) or `HH:MM`. Please check that “قبل 12/10 18:30” reads acceptably, and whether “على” or “في الساعة” should be used in BR-07.
- Relative and short forms: TR-13 (“ج12” for round 12) and RV-33 are abbreviations of “الجولة”.

### 6. Numerals and mixed-direction text

Lines that mix Arabic with Latin letters, numbers or arrows can display in the wrong order. The tables mark them “Latin text inside” or give a note. The main cases: SofaScore, BotolaGO, Google, UUID, BG-XXXXXX payment codes, the version mark `v{n}`, scores `{a}–{b}`, arrows `←` in RC-34 (the French uses `→`; the Arabic arrow is reversed on purpose), and the username rule A-01 (invisible direction marks keep a–z, “-” and “\_” in order).

### 7. Lines where the Arabic does not say exactly what the French says

Differences found while comparing (each is also marked in its row). Most are deliberate, but please confirm:

| Row            | Difference                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| M-03           | Arabic is more specific: “the start was delayed” (تأخر الانطلاق); French: “delayed”.                                                       |
| L-08           | The Arabic verb changed from “watch” (شاهد) to “follow” (تابع); French did not change.                                                     |
| N-01           | Arabic adds “account” (إشعارات حسابك).                                                                                                     |
| X-11           | French: “Soon on BotolaGO: Prospects”; Arabic: “المواهب قريبًا” (no “on BotolaGO”).                                                        |
| M-13           | Arabic adds “before its end” (قبل نهايتها).                                                                                                |
| RC-10          | French is the capital abbreviation PTS; Arabic spells out نقطة.                                                                            |
| BR-05          | French “J12”; Arabic “الجولة 12”.                                                                                                          |
| RC-23          | French “Transfert”; Arabic “تبديل” (substitution).                                                                                         |
| AD-85 (Part 4) | The administrator’s French confirmation includes the end date; the Arabic one does not.                                                    |
| AD-80 (Part 4) | The French error also states the bank-account (RIB) length rule (10 to 40 characters); the Arabic one only gives the WhatsApp number rule. |

---

## Part 1. Audit phases A, B, C, D and follow-ups

192 strings. Group by screen. The phase is named at the end of each “Where” cell (Phase A is PR 489, B is 490, C is 495, D is 497). PR 496 (same-minute goal order), PR 500 (Morocco time) and PR 504 (bell title) add no dictionary text; PR 504's wording is in Part 3.

### L. Landing page and Fantasy scoring explanation

9 strings. Screen: Landing page, Fantasy introduction, rules page.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| L-01 | Jusqu’à la journée {n} : barème par actions. | <span dir="rtl">حتى الجولة {n}: احتساب النقاط حسب أحداث المباراة.</span> | Rules page and match-points notice: first rounds, scored by match events.<br>Placeholders: `{n}`.<br>Phase A · `fantasy.scoring.eventUntil` | ☐ | |
| L-02 | À partir de la journée {n} : points selon la note SofaScore. | <span dir="rtl">ابتداءً من الجولة {n}: النقاط حسب تقييم SofaScore.</span> | Rules page and match-points notice: later rounds, scored by SofaScore rating.<br>Placeholders: `{n}`.<br>Latin text inside: SofaScore.<br>SofaScore stays in Latin letters inside the Arabic line.<br>Phase A · `fantasy.scoring.ratingFrom` | ☐ | |
| L-03 | Quand les points suivent la note, des données de participation essentielles manquantes retardent la validation, et une note publiée ou corrigée plus tard met à jour les points tant que la journée n’est pas validée. | <span dir="rtl">عندما تُحتسب النقاط حسب التقييم، يؤخر نقص بيانات المشاركة الأساسية اعتماد النقاط، وأي تقييم يُنشر أو يُصحَّح لاحقاً يحدّث النقاط ما دامت الجولة لم تُعتمد بعد.</span> | Rules page: delays and corrections under rating scoring.<br>Long sentence; check that “اعتماد النقاط” (points becoming official) matches the French “validation”.<br>Phase A · `fantasy.scoring.ratingSafeguards` | ☐ | |
| L-04 | Chaque joueur marque des points selon sa performance en match. Le barème en vigueur est détaillé dans le règlement. | <span dir="rtl">يحصد كل لاعب نقاطاً بحسب أدائه في المباراة، ونظام النقاط المعتمد موضّح في صفحة القواعد.</span> | Fantasy first-time introduction, step 2.<br>Was: <span dir="rtl">كل لاعب يحصل على تقييمه على SofaScore في المباراة، مقرّباً إلى أقرب عدد صحيح.</span><br>French and Arabic both changed: the old text promised the SofaScore rating rounded; the new one points to the rules page.<br>Phase A · `fantasy.onboarding.step2_body` | ☐ | |
| L-05 | Voir les matchs et résultats | <span dir="rtl">تابع المباريات والنتائج</span> | Landing page hero, link to today’s matches.<br>New link in the landing hero.<br>Phase D · `landing.cta_matches` | ☐ | |
| L-06 | Vos joueurs marquent des points selon leurs performances en match. Le barème en vigueur est publié dans le règlement. | <span dir="rtl">يحصد لاعبوك نقاطاً بحسب أدائهم في المباريات. نظام النقاط المعتمد منشور في صفحة القواعد.</span> | Landing page, “How it works” step 3.<br>Was: <span dir="rtl">يحصل لاعبوك على تقييمهم على SofaScore في كل مباراة، مقرّباً إلى أقرب عدد صحيح.</span><br>French and Arabic both changed (same change as the Fantasy first-time introduction, step 2).<br>Phase A · `landing.step3_body` | ☐ | |
| L-07 | Voir le barème en vigueur | <span dir="rtl">اطّلع على نظام النقاط المعتمد</span> | Landing page, link under step 3 to the rules.<br>Link text.<br>Phase A · `landing.scoring_link` | ☐ | |
| L-08 | Voir les matchs | <span dir="rtl">تابع المباريات</span> | Landing page, button to the matches list.<br>Was: <span dir="rtl">شاهد المباريات</span><br>Meaning: Arabic changed from “شاهد” (watch) to “تابع” (follow); French is unchanged (Voir).<br>Phase D · `landing.browse_cta` | ☐ | |
| L-09 | Chaque joueur marque des points selon ses performances en match, et votre capitaine compte double. Le barème en vigueur et la façon dont les points sont validés sont détaillés dans le règlement. | <span dir="rtl">يحصد كل لاعب نقاطاً بحسب أدائه في المباراة، ونقاط قائدك تُحتسب مضاعفة. تجد نظام النقاط المعتمد وطريقة اعتماد النقاط في صفحة القواعد.</span> | Landing page FAQ, answer to “how are points scored?”.<br>Was: <span dir="rtl">كل لاعب يحصل على تقييمه على SofaScore في المباراة، مقرّباً إلى أقرب عدد صحيح (7.5 تصبح 8). اللاعب الذي شارك دون تقييم يحصل على 5 نقاط، ومن لم يشارك يحصل على 0، ونقاط قائدك تُحتسب مضاعفة.</span><br>French and Arabic both changed: the rounding example (7.5 gives 8) and the “5 points / 0 points” lines were removed on purpose.<br>Phase A · `landing.faq_points_a` | ☐ | |

### M. Match page and match cards

20 strings. Screen: Matches.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| M-01 | Interrompu | <span dir="rtl">متوقفة مؤقتًا</span> | Match status badge on cards and on the match page.<br>Compare with the next line: this one is an adjective (“temporarily stopped”), the next is a verb (“were stopped”). Same screen, two grammatical styles.<br>Phase B · `matches.status.suspended` | ☐ | |
| M-02 | Arrêté | <span dir="rtl">أُوقفت</span> | Match status badge on cards and on the match page.<br>Verb form (“was stopped”) while its neighbour “متوقفة مؤقتًا” is an adjective. French: Arrêté.<br>Phase B · `matches.status.abandoned` | ☐ | |
| M-03 | Retardé | <span dir="rtl">تأخر الانطلاق</span> | Match status badge on cards and on the match page.<br>Was: <span dir="rtl">متأخر</span><br>Meaning: Arabic now says “kick-off delayed”; French says only “delayed”.<br>Phase C · `matches.status.delayed` | ☐ | |
| M-04 | Impossible de charger les moments forts. | <span dir="rtl">تعذّر تحميل أبرز اللحظات.</span> | Match page: one section failed to load.<br>Phase A · `matches.detail.section_failed.timeline` | ☐ | |
| M-05 | Impossible de charger les statistiques du match. | <span dir="rtl">تعذّر تحميل إحصائيات المباراة.</span> | Match page: one section failed to load.<br>Phase A · `matches.detail.section_failed.stats` | ☐ | |
| M-06 | Impossible de charger le graphique de pression. | <span dir="rtl">تعذّر تحميل مخطط الضغط.</span> | Match page: one section failed to load.<br>Phase A · `matches.detail.section_failed.pressure` | ☐ | |
| M-07 | Impossible de charger les compositions. | <span dir="rtl">تعذّر تحميل التشكيلات.</span> | Match page: one section failed to load.<br>Phase A · `matches.detail.section_failed.lineups` | ☐ | |
| M-08 | Impossible de charger la liste des absents. | <span dir="rtl">تعذّر تحميل قائمة الغيابات.</span> | Match page: one section failed to load.<br>Phase A · `matches.detail.section_failed.absences` | ☐ | |
| M-09 | Impossible de charger les confrontations directes. | <span dir="rtl">تعذّر تحميل المواجهات المباشرة.</span> | Match page: one section failed to load.<br>Phase A · `matches.detail.section_failed.h2h` | ☐ | |
| M-10 | Pas encore de statistiques. Elles s'affichent ici dès qu'elles sont disponibles, le plus souvent après le match. | <span dir="rtl">لا توجد إحصائيات بعد. ستظهر هنا فور توفرها، وغالبًا بعد نهاية المباراة.</span> | Match page, statistics section while data has not arrived.<br>Was: <span dir="rtl">لم تصل أي إحصائيات حتى الآن. يتم تحديث هذه الصفحة تلقائيًا.</span><br>Phase B · `matches.detail.no_stats_updating` | ☐ | |
| M-11 | Match interrompu : pas de données à afficher. | <span dir="rtl">المباراة متوقفة مؤقتًا: لا توجد بيانات لعرضها.</span> | Match page, empty sections of a suspended, cancelled or abandoned match.<br>Phase B · `matches.detail.no_data_suspended` | ☐ | |
| M-12 | Match annulé : pas de données à afficher. | <span dir="rtl">المباراة ملغاة: لا توجد بيانات لعرضها.</span> | Match page, empty sections of a suspended, cancelled or abandoned match.<br>Phase B · `matches.detail.no_data_cancelled` | ☐ | |
| M-13 | Match arrêté : pas de données à afficher. | <span dir="rtl">المباراة أُوقفت قبل نهايتها: لا توجد بيانات لعرضها.</span> | Match page, empty sections of a suspended, cancelled or abandoned match.<br>French says “arrêté” (stopped); Arabic adds “قبل نهايتها” (before its end).<br>Phase B · `matches.detail.no_data_abandoned` | ☐ | |
| M-14 | Ce match a été annulé. | <span dir="rtl">تم إلغاء هذه المباراة.</span> | Match page, banner above the score.<br>Phase B · `matches.detail.cancelled_notice` | ☐ | |
| M-15 | Ce match a été interrompu. | <span dir="rtl">توقفت هذه المباراة مؤقتًا.</span> | Match page, banner above the score.<br>Phase B · `matches.detail.suspended_notice` | ☐ | |
| M-16 | Ce match a été arrêté avant son terme. | <span dir="rtl">أُوقفت هذه المباراة قبل نهايتها.</span> | Match page, banner above the score.<br>Phase B · `matches.detail.abandoned_notice` | ☐ | |
| M-17 | Score indisponible : {home} contre {away} | <span dir="rtl">النتيجة غير متوفرة: {home} ضد {away}</span> | Match card, read aloud by screen readers when the score is unknown.<br>Placeholders: `{home}` `{away}`.<br>Team names are inserted and may be Latin or Arabic: mixed direction.<br>Phase A · `matches.a11y.score_unavailable` | ☐ | |
| M-18 | Match annulé | <span dir="rtl">مباراة ملغاة</span> | Match card, status read aloud by screen readers.<br>Phase B · `matches.a11y.status_cancelled` | ☐ | |
| M-19 | Match interrompu | <span dir="rtl">مباراة متوقفة مؤقتًا</span> | Match card, status read aloud by screen readers.<br>Phase B · `matches.a11y.status_suspended` | ☐ | |
| M-20 | Match arrêté avant son terme | <span dir="rtl">مباراة أُوقفت قبل نهايتها</span> | Match card, status read aloud by screen readers.<br>Phase B · `matches.a11y.status_abandoned` | ☐ | |

### H. Header search and skip link

7 strings. Screen: Top bar.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| H-01 | Aller au contenu | <span dir="rtl">انتقل إلى المحتوى</span> | First link reached with the Tab key (jumps to the page content).<br>Phase C · `nav.skip_to_content` | ☐ | |
| H-02 | La recherche est indisponible pour le moment. | <span dir="rtl">البحث غير متاح حاليًا.</span> | Header search panel, notice when search is down or incomplete.<br>Phase B · `nav.search.unavailable` | ☐ | |
| H-03 | Certains résultats sont indisponibles pour le moment. | <span dir="rtl">بعض النتائج غير متاحة حاليًا.</span> | Header search panel, notice when search is down or incomplete.<br>Phase B · `nav.search.partial` | ☐ | |
| H-04 | 1 résultat | <span dir="rtl">نتيجة واحدة</span> | Header search, result count read aloud by screen readers.<br>Plural form “one”: exactly 1.<br>Phase C · `nav.search.results_one` | ☐ | |
| H-05 | 2 résultats | <span dir="rtl">نتيجتان</span> | Header search, result count read aloud by screen readers.<br>Plural form “two”: exactly 2.<br>Phase C · `nav.search.results_two` | ☐ | |
| H-06 | {n} résultats | <span dir="rtl">{n} نتائج</span> | Header search, result count read aloud by screen readers.<br>Plural form “few”: 3 to 10 (also 103, 1003…).<br>Placeholders: `{n}`.<br>Phase C · `nav.search.results_few` | ☐ | |
| H-07 | {n} résultats | <span dir="rtl">{n} نتيجة</span> | Header search, result count read aloud by screen readers.<br>Plural form “other”: 100 and over (and any case not listed).<br>Placeholders: `{n}`.<br>Phase C · `nav.search.results_other` | ☐ | |

### N. Notifications bell, match reminders, Fantasy e-mail settings

10 strings. Screen: Notifications.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| N-01 | C’est ici que s’affichent vos notifications. | <span dir="rtl">هنا تظهر إشعارات حسابك.</span> | Notifications page, empty state.<br>Was: <span dir="rtl">ستظهر هنا تذكيرات المباريات وتنبيهات فانتازي وأخبار أنديتك.</span><br>French and Arabic both changed. The Arabic adds “حسابك” (your account); French does not.<br>Phase B · `notifications.empty_body` | ☐ | |
| N-02 | La notification n'a pas pu être supprimée. Réessayez. | <span dir="rtl">تعذّر حذف الإشعار. حاول مجددًا.</span> | Notifications page, error after trying to delete one.<br>Phase B · `notifications.dismiss_failed` | ☐ | |
| N-03 | Les notifications n'ont pas pu être marquées comme lues. Réessayez. | <span dir="rtl">تعذّر تعليم الإشعارات كمقروءة. حاول مجددًا.</span> | Notifications page, error after “mark all as read”.<br>Phase B · `notifications.mark_all_failed` | ☐ | |
| N-04 | Elles sont rattachées à votre compte BotolaGO. | <span dir="rtl">إشعاراتك مرتبطة بحسابك في BotolaGO.</span> | Notifications page, invitation shown to signed-out readers.<br>Latin text inside: BotolaGO.<br>Was: <span dir="rtl">تصلك هنا تذكيرات المباريات وتنبيهات فانتازي.</span><br>Phase B · `notifications.signin_body` | ☐ | |
| N-05 | Connectez-vous pour ajouter ce match à vos rappels. | <span dir="rtl">سجّل الدخول لإضافة هذه المباراة إلى تذكيراتك.</span> | Sign-in prompt shown when tapping a match reminder bell.<br>Was: <span dir="rtl">سجّل الدخول ليتم تذكيرك قبل المباراة.</span><br>Phase B · `reminders.sign_in_reason` | ☐ | |
| N-06 | Rappel enregistré pour ce match. | <span dir="rtl">تم حفظ التذكير لهذه المباراة.</span> | Small confirmation after tapping the match reminder bell.<br>Phase B · `reminders.toast.saved` | ☐ | |
| N-07 | Rappel activé pour ce match. Les rappels par e-mail sont activés sur votre compte. | <span dir="rtl">تم تفعيل التذكير لهذه المباراة. التذكيرات عبر البريد الإلكتروني مفعّلة في حسابك.</span> | Small confirmation after tapping the match reminder bell.<br>Was: <span dir="rtl">تم تفعيل التذكير. سنُنبّهك قبل ساعة تقريبًا من صافرة البداية.</span><br>French and Arabic both changed: no longer promises “one hour before”.<br>Phase B · `reminders.toast.on` | ☐ | |
| N-08 | Rappel enregistré. Les notifications par e-mail sont désactivées sur votre compte. | <span dir="rtl">تم حفظ التذكير. إشعارات البريد الإلكتروني معطّلة في حسابك.</span> | Small confirmation after tapping the match reminder bell.<br>Was: <span dir="rtl">تم حفظ التذكير. لاستلامه، فعّل الإشعارات عبر البريد الإلكتروني.</span><br>French and Arabic both changed.<br>Phase B · `reminders.toast.needs_email` | ☐ | |
| N-09 | Vos e-mails Fantasy sont activés sur votre compte : rappel avant chaque date limite et bilan de chaque journée. La date limite officielle reste toujours affichée dans l’application. | <span dir="rtl">رسائل فانتازي عبر البريد الإلكتروني مفعّلة في حسابك: تذكير قبل كل موعد نهائي وحصيلة كل جولة. يبقى الموعد النهائي الرسمي معروضًا دائمًا في التطبيق.</span> | Fantasy notification settings, text when e-mails are switched on.<br>Was: <span dir="rtl">استلم عبر البريد الإلكتروني تذكيرًا قبل كل موعد نهائي وحصيلة كل جولة لفريقك في BotolaGO Fantasy.</span><br>French and Arabic both changed.<br>Phase B · `fpl.notifications_body` | ☐ | |
| N-10 | Choisissez les rappels et les e-mails Fantasy que vous souhaitez. La date limite officielle reste toujours affichée dans l’application. | <span dir="rtl">اختر التذكيرات ورسائل البريد الإلكتروني التي تريدها لفريقك في فانتازي. يبقى الموعد النهائي الرسمي معروضًا دائمًا في التطبيق.</span> | Fantasy notification settings, text before any choice is made.<br>Phase B · `fpl.notifications_body_neutral` | ☐ | |

### U. Notification language, profile language row, unsubscribe page

8 strings. Screen: Profile and e-mail unsubscribe.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| U-01 | Langue des notifications | <span dir="rtl">لغة الإشعارات</span> | Profile set-up, label of the notification-language step.<br>Was: <span dir="rtl">اللغة الافتراضية</span><br>French also changed (“Langue par défaut” became “Langue des notifications”).<br>Phase D (also #495) · `auth.setup.language_confirm` | ☐ | |
| U-02 | Langue de vos e-mails, alertes et notifications. Le français est la langue par défaut. La langue de l’application sur cet appareil se règle depuis Profil. | <span dir="rtl">لغة رسائل البريد الإلكتروني والتنبيهات والإشعارات. الفرنسية هي اللغة الافتراضية. تُضبط لغة التطبيق على هذا الجهاز من الملف الشخصي.</span> | Profile set-up, explanation under that step.<br>Says exactly what the choice changes: e-mails, alerts and notifications, not the app.<br>Phase D (also #495) · `auth.setup.language_hint` | ☐ | |
| U-03 | Langue sur cet appareil | <span dir="rtl">اللغة على هذا الجهاز</span> | Profile page, label of the app-language row.<br>Phase C · `profile.language.device` | ☐ | |
| U-04 | Ce choix change l’application sur cet appareil. Les notifications utilisent la langue de votre compte. Modifiable dans Notifications. | <span dir="rtl">يغيّر هذا الاختيار لغة التطبيق على هذا الجهاز. تستخدم الإشعارات اللغة المحفوظة في حسابك. يمكن تغييرها من الإشعارات.</span> | Profile page, help text under the language row (signed in).<br>Says what the language row changes (this device) and what it does not (notifications use the account language).<br>Phase D (also #495) · `profile.language.help` | ☐ | |
| U-05 | Ce choix change l’application sur cet appareil. | <span dir="rtl">يغيّر هذا الاختيار لغة التطبيق على هذا الجهاز.</span> | Profile page, help text under the language row (guest).<br>Guest version of the line above.<br>Phase C · `profile.language.help_guest` | ☐ | |
| U-06 | Vos e-mails de notification BotolaGO sont désactivés. | <span dir="rtl">تم إيقاف رسائل إشعارات BotolaGO عبر البريد الإلكتروني.</span> | E-mail unsubscribe page, result message.<br>Latin text inside: BotolaGO.<br>Was: <span dir="rtl">لن تصلك بعد الآن رسائل بريد إلكتروني من BotolaGO.</span><br>Promise about scope: only notification e-mails are stopped.<br>Phase C · `unsubscribe.done_title` | ☐ | |
| U-07 | Vos e-mails de notification BotolaGO étaient déjà désactivés. | <span dir="rtl">كانت رسائل إشعارات BotolaGO عبر البريد الإلكتروني متوقفة من قبل.</span> | E-mail unsubscribe page, result message.<br>Latin text inside: BotolaGO.<br>Was: <span dir="rtl">رسائل BotolaGO الإلكترونية كانت معطّلة من قبل.</span><br>Same scope wording as the line above.<br>Phase C · `unsubscribe.already_title` | ☐ | |
| U-08 | Vous pouvez les réactiver à tout moment dans les notifications de votre profil. Les messages nécessaires à la sécurité de votre compte restent disponibles. | <span dir="rtl">يمكنك إعادة تفعيلها في أي وقت من إعدادات الإشعارات في ملفك الشخصي. تبقى رسائل أمان الحساب الضرورية متاحة.</span> | E-mail unsubscribe page, result message.<br>Was: <span dir="rtl">يمكنك إعادة تفعيلها في أي وقت من إعدادات الإشعارات في ملفك الشخصي.</span><br>Says account-security messages stay: “تبقى رسائل أمان الحساب الضرورية متاحة”.<br>Phase C · `unsubscribe.reenable_hint` | ☐ | |

### V. Saved articles (reading list)

15 strings. Screen: Profile, Saved articles.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| V-01 | Aucun article enregistré | <span dir="rtl">لا توجد مقالات محفوظة</span> | Saved articles page, empty state.<br>Phase B · `news.saved.empty_title` | ☐ | |
| V-02 | Parcourir les actualités | <span dir="rtl">تصفّح الأخبار</span> | Saved articles page, empty state.<br>Phase B · `news.saved.browse` | ☐ | |
| V-03 | Connectez-vous pour retrouver vos articles | <span dir="rtl">سجّل الدخول لتجد مقالاتك المحفوظة</span> | Saved articles page, signed-out state.<br>Phase B · `news.saved.signin_title` | ☐ | |
| V-04 | Vos articles enregistrés sont liés à votre compte. | <span dir="rtl">المقالات المحفوظة مرتبطة بحسابك.</span> | Saved articles page, signed-out state.<br>Phase B · `news.saved.signin_body` | ☐ | |
| V-05 | Vos articles enregistrés n'ont pas pu être chargés. Vérifiez votre connexion et réessayez. | <span dir="rtl">تعذّر تحميل مقالاتك المحفوظة. تحقّق من اتصالك ثم حاول مجددًا.</span> | Saved articles page, loading error.<br>Phase B · `news.saved.error` | ☐ | |
| V-06 | Cet article n'est plus disponible. | <span dir="rtl">لم يعد هذا المقال متاحًا.</span> | Saved articles list, a saved article that is no longer online.<br>Phase B · `news.saved.unavailable` | ☐ | |
| V-07 | Retirer de la liste | <span dir="rtl">إزالة من القائمة</span> | Saved articles list, button.<br>Phase B · `news.saved.remove` | ☐ | |
| V-08 | Voir plus d'articles | <span dir="rtl">عرض المزيد من المقالات</span> | Saved articles list, button.<br>Phase B · `news.saved.more` | ☐ | |
| V-09 | La suite n'a pas pu être chargée. | <span dir="rtl">تعذّر تحميل المزيد.</span> | Saved articles page, loading error.<br>Phase B · `news.saved.more_error` | ☐ | |
| V-10 | Impossible de retirer cet article pour le moment. Réessayez. | <span dir="rtl">تعذّرت إزالة هذا المقال حاليًا. حاول مجددًا.</span> | Saved articles, error after tapping the bookmark.<br>Phase B · `news.saved.remove_error` | ☐ | |
| V-11 | Impossible d'enregistrer cet article pour le moment. Réessayez. | <span dir="rtl">تعذّر حفظ هذا المقال حاليًا. حاول مجددًا.</span> | Saved articles, error after tapping the bookmark.<br>Phase B · `news.saved.save_error` | ☐ | |
| V-12 | Article retiré de vos articles enregistrés. | <span dir="rtl">تمت إزالة المقال من مقالاتك المحفوظة.</span> | Saved articles, confirmation read aloud by screen readers.<br>Read aloud only.<br>Phase B · `news.saved.removed_announce` | ☐ | |
| V-13 | nombre inconnu | <span dir="rtl">العدد غير معروف</span> | Saved articles page, count of saved articles.<br>Read aloud when the count cannot be known.<br>Phase B · `news.saved.count_unknown` | ☐ | |
| V-14 | plus de {count} | <span dir="rtl">أكثر من {count}</span> | Saved articles page, count of saved articles.<br>Placeholders: `{count}`.<br>{count} is 2000: check how the number is written (2000 or 2,000).<br>Phase D · `news.saved.count_over` | ☐ | |
| V-15 | Vous avez plus de {count} articles enregistrés. Les plus récents s'affichent en premier. | <span dir="rtl">لديك أكثر من {count} مقال محفوظ. تظهر المقالات الأحدث أولًا.</span> | Saved articles page, notice when there are more than the limit.<br>Placeholders: `{count}`.<br>{count} is 2000. “مقال” (singular) after 100+ is the correct form.<br>Phase D · `news.saved.over_limit` | ☐ | |

### T. Fantasy transfers and player picker

37 strings. Screen: Fantasy, Transfers.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| T-01 | Transferts | <span dir="rtl">الانتقالات</span> | Name of the Transfers tab and page.<br>Was: <span dir="rtl">التحويلات</span><br>Glossary: transfers are “الانتقالات” (was “التحويلات”, which means money transfer).<br>Phase C · `fantasy.transfers` | ☐ | |
| T-02 | Transferts · 1 gratuit | <span dir="rtl">الانتقالات · انتقال واحد مجاني</span> | Fantasy deadline card, line with the free transfers left.<br>Plural form “one”: exactly 1.<br>Was: <span dir="rtl">التحويلات · تحويل واحد مجاني</span><br>Phase C · `fantasy.deadline_card.transfers_one` | ☐ | |
| T-03 | Transferts · 2 gratuits | <span dir="rtl">الانتقالات · انتقالان مجانيان</span> | Fantasy deadline card, line with the free transfers left.<br>Plural form “two”: exactly 2.<br>Was: <span dir="rtl">التحويلات · تحويلان مجانيان</span><br>Phase C · `fantasy.deadline_card.transfers_two` | ☐ | |
| T-04 | Transferts · {n} gratuits | <span dir="rtl">الانتقالات · {n} انتقالات مجانية</span> | Fantasy deadline card, line with the free transfers left.<br>Plural form “few”: 3 to 10 (also 103, 1003…).<br>Placeholders: `{n}`.<br>Was: <span dir="rtl">التحويلات · {n} تحويلات مجانية</span><br>Phase C · `fantasy.deadline_card.transfers_few` | ☐ | |
| T-05 | Transferts · {n} gratuits | <span dir="rtl">الانتقالات · {n} انتقالًا مجانيًا</span> | Fantasy deadline card, line with the free transfers left.<br>Plural form “other”: 100 and over (and any case not listed).<br>Placeholders: `{n}`.<br>Was: <span dir="rtl">التحويلات · {n} تحويلًا مجانيًا</span><br>Phase C · `fantasy.deadline_card.transfers_other` | ☐ | |
| T-06 | Transferts libres | <span dir="rtl">الانتقالات المجانية</span> | Fantasy hub, label “free transfers”.<br>Was: <span dir="rtl">التحويلات المجانية</span><br>Phase C · `fantasy.free_transfers` | ☐ | |
| T-07 | Chip actif | <span dir="rtl">الجوكر المفعّل</span> | Transfer screen, note while a chip (joker) is active.<br>Was: <span dir="rtl">الرقاقة النشطة</span><br>Phase C · `fantasy.transfers.chip_active` | ☐ | |
| T-08 | Aucune pénalité — chip actif | <span dir="rtl">بدون خصم — جوكر مفعّل</span> | Transfer screen, note while a chip (joker) is active.<br>Was: <span dir="rtl">بدون خصم — رقاقة نشطة</span><br>Phase C · `fantasy.transfers.no_hit_chip` | ☐ | |
| T-09 | Calcul du transfert en cours… | <span dir="rtl">جارٍ احتساب الانتقال…</span> | Transfer screen, notice when the transfer check is pending or fails.<br>Phase A · `fantasy.transfers.preview.pending` | ☐ | |
| T-10 | Le calcul du transfert a échoué. Réessayez. | <span dir="rtl">تعذّر احتساب الانتقال. أعد المحاولة.</span> | Transfer screen, notice when the transfer check is pending or fails.<br>Phase A · `fantasy.transfers.preview.failed` | ☐ | |
| T-11 | Budget insuffisant : il manque {amount} M pour ces transferts. Choisissez un joueur moins cher. | <span dir="rtl">الرصيد لا يكفي: ينقصك {amount} م لإتمام هذه الانتقالات. اختر لاعبًا أقل سعرًا.</span> | Transfer screen, notice when the transfer check is pending or fails.<br>Placeholders: `{amount}`.<br>“م” stands for M (millions of the game currency). Is “م” clear, or should it be spelled out?<br>Phase A · `fantasy.transfers.preview.budget` | ☐ | |
| T-12 | Le budget ou les prix ont changé. Vérifiez vos choix, puis réessayez. | <span dir="rtl">تغيّرت الميزانية أو الأسعار. راجع اختياراتك ثم أعد المحاولة.</span> | Transfer screen, notice when the transfer check is pending or fails.<br>Phase A · `fantasy.transfers.preview.budget_changed` | ☐ | |
| T-13 | Une version plus récente de votre équipe existe. Rechargez-la : vos transferts sont conservés. | <span dir="rtl">توجد نسخة أحدث من فريقك. أعد تحميلها، فانتقالاتك محفوظة.</span> | Transfer screen, notice when the transfer check is pending or fails.<br>Phase A · `fantasy.transfers.preview.stale` | ☐ | |
| T-14 | Un code de confirmation est demandé. Saisissez-le, puis réessayez : vos transferts sont conservés. | <span dir="rtl">مطلوب رمز التأكيد. أدخله ثم أعد المحاولة، فانتقالاتك محفوظة.</span> | Transfer screen, notice when the transfer check is pending or fails.<br>Phase A · `fantasy.transfers.preview.step_up` | ☐ | |
| T-15 | Ce transfert n'est plus possible : vérifiez vos choix. | <span dir="rtl">لم يعد هذا الانتقال ممكنًا. راجع اختياراتك.</span> | Transfer screen, notice when the transfer check is pending or fails.<br>Phase A · `fantasy.transfers.preview.invalid` | ☐ | |
| T-16 | Connexion indisponible. Vos transferts sont conservés : réessayez. | <span dir="rtl">لا يوجد اتصال. انتقالاتك محفوظة، أعد المحاولة.</span> | Transfer screen, notice when the transfer check is pending or fails.<br>Phase A · `fantasy.transfers.preview.network` | ☐ | |
| T-17 | Hors marché | <span dir="rtl">خارج السوق</span> | Transfer screen, tag on an owned player who left the market.<br>Phase B · `fantasy.transfers.owned_unavailable` | ☐ | |
| T-18 | Forme | <span dir="rtl">المستوى الأخير</span> | Player picker, sort option “form”.<br>Was: <span dir="rtl">الحالة</span><br>Glossary: form is “المستوى الأخير”.<br>Phase C · `fantasy.picker.sort.form` | ☐ | |
| T-19 | Vous allez effectuer {n} transferts. | <span dir="rtl">ستُجري {n} انتقالًا.</span> | Transfer confirmation screen, headline with the number of transfers.<br>Plural form “many”: 11 to 99 (also 111…).<br>Placeholders: `{n}`.<br>Used for 11 to 99 (“ستُجري 11 انتقالًا”).<br>Phase C · `fpl.about_to_transfer_many` | ☐ | |
| T-20 | Vous allez effectuer {n} transferts. | <span dir="rtl">ستُجري {n} انتقال.</span> | Transfer confirmation screen, headline with the number of transfers.<br>Plural form “other”: 100 and over (and any case not listed).<br>Placeholders: `{n}`.<br>Used from 100 up (“ستُجري 100 انتقال”).<br>Phase C · `fpl.about_to_transfer_other` | ☐ | |
| T-21 | Vous allez effectuer 1 transfert. | <span dir="rtl">ستُجري انتقالًا واحدًا.</span> | Transfer confirmation screen, headline with the number of transfers.<br>Plural form “one”: exactly 1.<br>Was: <span dir="rtl">أنت على وشك إجراء انتقال واحد!</span><br>Exclamation mark removed in both languages.<br>Phase C · `fpl.about_to_transfer_one` | ☐ | |
| T-22 | Vous allez effectuer 2 transferts. | <span dir="rtl">ستُجري انتقالين.</span> | Transfer confirmation screen, headline with the number of transfers.<br>Plural form “two”: exactly 2.<br>Check the dual: “انتقالين” (accusative after “ستُجري”).<br>Phase C · `fpl.about_to_transfer_two` | ☐ | |
| T-23 | Vous allez effectuer {n} transferts. | <span dir="rtl">ستُجري {n} انتقالات.</span> | Transfer confirmation screen, headline with the number of transfers.<br>Plural form “few”: 3 to 10 (also 103, 1003…).<br>Placeholders: `{n}`.<br>Phase C · `fpl.about_to_transfer_few` | ☐ | |
| T-24 | 1 transfert gratuit, ensuite −{hit} pts | <span dir="rtl">انتقال واحد مجاني، ثم −{hit} نقاط</span> | Player picker, line about free transfers and the points cost.<br>Plural form “one”: exactly 1.<br>Placeholders: `{hit}`.<br>Was: <span dir="rtl">تحويل واحد مجاني، ثم −{hit} نقاط</span><br>Phase C · `fpl.pick.transfer_cost_one` | ☐ | |
| T-25 | 2 transferts gratuits, ensuite −{hit} pts | <span dir="rtl">انتقالان مجانيان، ثم −{hit} نقاط</span> | Player picker, line about free transfers and the points cost.<br>Plural form “two”: exactly 2.<br>Placeholders: `{hit}`.<br>Was: <span dir="rtl">تحويلان مجانيان، ثم −{hit} نقاط</span><br>Phase C · `fpl.pick.transfer_cost_two` | ☐ | |
| T-26 | {n} transferts gratuits, ensuite −{hit} pts | <span dir="rtl">{n} انتقالات مجانية، ثم −{hit} نقاط</span> | Player picker, line about free transfers and the points cost.<br>Plural form “few”: 3 to 10 (also 103, 1003…).<br>Placeholders: `{n}` `{hit}`.<br>Was: <span dir="rtl">{n} تحويلات مجانية، ثم −{hit} نقاط</span><br>Phase C · `fpl.pick.transfer_cost_few` | ☐ | |
| T-27 | {n} transferts gratuits, ensuite −{hit} pts | <span dir="rtl">{n} انتقالًا مجانيًا، ثم −{hit} نقاط</span> | Player picker, line about free transfers and the points cost.<br>Plural form “other”: 100 and over (and any case not listed).<br>Placeholders: `{n}` `{hit}`.<br>Was: <span dir="rtl">{n} تحويلًا مجانيًا، ثم −{hit} نقاط</span><br>Phase C · `fpl.pick.transfer_cost_other` | ☐ | |
| T-28 | Aucun transfert gratuit : −{hit} pts par transfert | <span dir="rtl">لا انتقالات مجانية: −{hit} نقاط لكل انتقال</span> | Player picker, line about free transfers and the points cost.<br>Placeholders: `{hit}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>Was: <span dir="rtl">لا تحويلات مجانية: −{hit} نقاط لكل تحويل</span><br>Phase C · `fpl.pick.transfer_cost_none` | ☐ | |
| T-29 | Forme minimale | <span dir="rtl">الحد الأدنى للمستوى الأخير</span> | Player picker filters, “minimum form”.<br>Was: <span dir="rtl">أدنى مستوى للأداء</span><br>Glossary: form is now “المستوى الأخير”.<br>Phase C · `fpl.pick.filter_form` | ☐ | |
| T-30 | Voir {n} joueurs | <span dir="rtl">عرض {n} لاعبًا</span> | Player picker filter sheet, button showing how many players match.<br>Plural form “many”: 11 to 99 (also 111…).<br>Placeholders: `{n}`.<br>Phase C · `fpl.pick.filters_apply_many` | ☐ | |
| T-31 | Voir {n} joueurs | <span dir="rtl">عرض {n} لاعب</span> | Player picker filter sheet, button showing how many players match.<br>Plural form “other”: 100 and over (and any case not listed).<br>Placeholders: `{n}`.<br>Phase C · `fpl.pick.filters_apply_other` | ☐ | |
| T-32 | Aucun joueur correspondant | <span dir="rtl">لا يوجد لاعب مطابق</span> | Player picker filter sheet, button showing how many players match.<br>Plural form “zero”: exactly 0.<br>Button text when no player matches.<br>Phase C · `fpl.pick.filters_apply_zero` | ☐ | |
| T-33 | Voir 1 joueur | <span dir="rtl">عرض لاعب واحد</span> | Player picker filter sheet, button showing how many players match.<br>Plural form “one”: exactly 1.<br>Phase C · `fpl.pick.filters_apply_one` | ☐ | |
| T-34 | Voir 2 joueurs | <span dir="rtl">عرض لاعبين</span> | Player picker filter sheet, button showing how many players match.<br>Plural form “two”: exactly 2.<br>Written without vowel marks it reads both as “two players” and as “players”. Decide whether to add the dual marks or reword (“لاعبان”).<br>Phase C · `fpl.pick.filters_apply_two` | ☐ | |
| T-35 | Voir {n} joueurs | <span dir="rtl">عرض {n} لاعبين</span> | Player picker filter sheet, button showing how many players match.<br>Plural form “few”: 3 to 10 (also 103, 1003…).<br>Placeholders: `{n}`.<br>Phase C · `fpl.pick.filters_apply_few` | ☐ | |
| T-36 | Journée clôturée — transferts désactivés. | <span dir="rtl">الجولة مُقفَلة — الانتقالات معطّلة.</span> | Transfer screen, banner when the round is closed.<br>Was: <span dir="rtl">الجولة مُقفَلة — التحويلات معطّلة.</span><br>Phase C · `fantasy.transfers.gw_closed` | ☐ | |
| T-37 | Les transferts n'ont pas pu être confirmés. | <span dir="rtl">تعذّر تأكيد الانتقالات.</span> | Transfer screen, error after confirming.<br>Was: <span dir="rtl">تعذّر تأكيد التحويلات.</span><br>Phase C · `fantasy.error.transfer_failed` | ☐ | |

### G. Fantasy leagues, rankings and squad creation

14 strings. Screen: Fantasy, Leagues and rankings.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| G-01 | La recherche porte sur les {scanned} premiers managers (sur {total}). Les autres restent accessibles page par page. | <span dir="rtl">يشمل البحث أول {scanned} مدرب فقط (من أصل {total}). يمكنك الوصول إلى الباقين بالتنقل بين الصفحات.</span> | Rankings, notice when search covers only the first managers.<br>Placeholders: `{scanned}` `{total}`.<br>“مدرب” = manager (coach). Counts are in the hundreds or thousands.<br>Phase B · `fantasy.rankings.search_limited` | ☐ | |
| G-02 | Évolution non disponible | <span dir="rtl">لا تتوفر بيانات عن تغيّر المركز</span> | Rankings, rank change when the previous rank is unknown.<br>Replaces an invented arrow when the previous rank is unknown.<br>Phase A · `fantasy.rank.unknown` | ☐ | |
| G-03 | membres | <span dir="rtl">عضو</span> | League list and table, word after the member count.<br>Was: <span dir="rtl">عضواً</span><br>Changed from “عضواً” to “عضو”. The word sits after the member count: is the bare singular right for 2 to 10 members (“أعضاء”)?<br>Phase B · `fantasy.leagues.members` | ☐ | |
| G-04 | Afficher la suite du classement | <span dir="rtl">عرض بقية الترتيب</span> | League table, “show more” button and its error.<br>Phase B · `fantasy.leagues.show_more` | ☐ | |
| G-05 | La suite du classement n'a pas pu être chargée. Les rangs déjà affichés restent valables. | <span dir="rtl">تعذّر تحميل بقية الترتيب. تظل المراتب المعروضة صحيحة.</span> | League table, “show more” button and its error.<br>Phase B · `fantasy.leagues.more_failed` | ☐ | |
| G-06 | Mise à jour impossible pour le moment : ces données sont celles de la dernière lecture réussie. | <span dir="rtl">تعذّر التحديث حاليًا: هذه البيانات هي آخر ما تمّت قراءته بنجاح.</span> | League page, notice when data could not be refreshed.<br>Phase B · `fantasy.leagues.stale` | ☐ | |
| G-07 | Vos ligues n'ont pas pu être chargées. Elles n'ont pas disparu : réessayez. | <span dir="rtl">تعذّر تحميل دورياتك. لم تختفِ: أعد المحاولة.</span> | Leagues, error when a list could not be loaded.<br>Phase B · `fantasy.leagues.read_failed` | ☐ | |
| G-08 | Les ligues publiques n'ont pas pu être chargées. | <span dir="rtl">تعذّر تحميل الدوريات العامة.</span> | Leagues, error when a list could not be loaded.<br>Phase B · `fantasy.leagues.public_read_failed` | ☐ | |
| G-09 | La liste des managers n'a pas pu être chargée. Elle n'est pas vide : réessayez. | <span dir="rtl">تعذّر تحميل قائمة المدربين. القائمة ليست فارغة: أعد المحاولة.</span> | Leagues, error when a list could not be loaded.<br>“المدربين” = managers; same word as elsewhere in the Fantasy screens.<br>Phase B · `fantasy.leagues.members_read_failed` | ☐ | |
| G-10 | Vous avez bien rejoint la ligue, mais ses informations n'ont pas pu être actualisées. Votre code est valide : réessayez. | <span dir="rtl">لقد انضممت إلى الدوري بالفعل، لكن تعذّر تحديث معلوماته. رمزك صحيح: أعد المحاولة.</span> | Join a league by code, error messages.<br>Phase B · `fantasy.leagues.joined_refresh_failed` | ☐ | |
| G-11 | Connexion impossible : le code n'est pas en cause. Vérifiez votre connexion et réessayez ; vous avez peut-être déjà rejoint la ligue, consultez vos ligues. | <span dir="rtl">تعذّر الاتصال، والرمز ليس هو السبب. تحقّق من اتصالك وأعد المحاولة؛ ربما انضممت بالفعل إلى الدوري، فراجع دورياتك.</span> | Join a league by code, error messages.<br>Two sentences joined by a semicolon: check flow.<br>Phase B · `fantasy.leagues.join_network` | ☐ | |
| G-12 | Service momentanément indisponible : le code n'est pas en cause. Réessayez dans un instant ; vous avez peut-être déjà rejoint la ligue, consultez vos ligues. | <span dir="rtl">الخدمة غير متاحة مؤقتًا، والرمز ليس هو السبب. أعد المحاولة بعد قليل؛ ربما انضممت بالفعل إلى الدوري، فراجع دورياتك.</span> | Join a league by code, error messages.<br>Two sentences joined by a semicolon: check flow.<br>Phase B · `fantasy.leagues.join_unavailable` | ☐ | |
| G-13 | Cet appareil ne peut pas garder votre brouillon : votre équipe n’existe que tant que cette page reste ouverte. Rechargée ou fermée, la composition serait perdue. | <span dir="rtl">لا يستطيع هذا الجهاز حفظ مسودتك: يبقى فريقك ما دامت هذه الصفحة مفتوحة. إن أُعيد تحميلها أو أُغلقت ضاعت التشكيلة.</span> | Squad creation (guest), warning that the draft cannot be saved.<br>Phase A · `fantasy.create.guest_unsaved` | ☐ | |
| G-14 | Créez un compte gratuit ou connectez-vous pour enregistrer votre équipe. Cet appareil ne garde pas votre brouillon : ne rechargez pas la page pendant l’inscription, n’ouvrez pas le lien de confirmation par e-mail dans un autre onglet, et évitez la connexion Google, qui quitte la page. | <span dir="rtl">أنشئ حسابًا مجانيًا أو سجّل الدخول لحفظ فريقك. هذا الجهاز لا يحفظ مسودتك: لا تُعد تحميل الصفحة أثناء التسجيل، ولا تفتح رابط تأكيد البريد في تبويب آخر، وتجنّب الدخول عبر Google لأنه يغادر الصفحة.</span> | Squad creation (guest), warning that the draft cannot be saved.<br>Latin text inside: Google.<br>Long instruction; contains the Latin word Google.<br>Phase A · `fantasy.create.sign_in_reason_unsaved` | ☐ | |

### P. Fantasy points, chips (jokers), players and top players

28 strings. Screen: Fantasy, Points and Players.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| P-01 | Forme | <span dir="rtl">المستوى الأخير</span> | Players table and cards, column “form”.<br>Was: <span dir="rtl">الحالة</span><br>Glossary: form is “المستوى الأخير” (was “الحالة”).<br>Phase C · `fantasy.form` | ☐ | |
| P-02 | Le vice-capitaine a pris le relais | <span dir="rtl">تسلّم نائب القائد الشارة</span> | Points screen, line when the vice-captain took over.<br>Was: <span dir="rtl">النائب استلم الشارة</span><br>French also changed (“Vice a pris le relais” became a full sentence).<br>Phase C · `fantasy.points.vice_takeover` | ☐ | |
| P-03 | Joueur indisponible | <span dir="rtl">لاعب غير متاح</span> | Points screen, player no longer in the player list.<br>Phase B · `fantasy.points.unknown_player` | ☐ | |
| P-04 | Certains joueurs de cette journée ne figurent plus dans la liste des joueurs : leur nom ne peut pas être affiché, mais leurs points comptent bien dans le total. | <span dir="rtl">بعض لاعبي هذه الجولة لم يعودوا ضمن قائمة اللاعبين، لذا لا يمكن عرض أسمائهم، لكن نقاطهم محسوبة في المجموع.</span> | Points screen, player no longer in the player list.<br>Long sentence.<br>Phase B · `fantasy.points.unresolved_players` | ☐ | |
| P-05 | Jeton actif | <span dir="rtl">الجوكر المفعّل</span> | Points screen, active chip (joker) line.<br>Was: <span dir="rtl">الرقاقة المفعّلة</span><br>Phase C · `fantasy.points.active_chip` | ☐ | |
| P-06 | Aucun jeton actif | <span dir="rtl">لا يوجد جوكر مفعّل</span> | Points screen, active chip (joker) line.<br>Was: <span dir="rtl">لا توجد رقاقة مفعّلة</span><br>Phase C · `fantasy.points.no_active_chip` | ☐ | |
| P-07 | Joueurs affichés : {n} sur {total} | <span dir="rtl">اللاعبون المعروضون: {n} من {total}</span> | Players page, “showing n of total”.<br>Placeholders: `{n}` `{total}`.<br>Was: <span dir="rtl">{n} لاعباً من أصل {total}</span><br>French also changed.<br>Phase C · `fantasy.players.showing` | ☐ | |
| P-08 | Jetons | <span dir="rtl">الجوكرات</span> | Rules page, “chips” section title.<br>Was: <span dir="rtl">الرقاقات</span><br>Glossary: “الجوكرات”. The four chip names themselves (الورقة الحرة, الضربة الحرة, تعزيز الاحتياط, القائد الثلاثي) are unchanged and approved.<br>Phase C · `fantasy.rules.chips` | ☐ | |
| P-09 | Joueurs Fantasy Botola Pro : prix, points et forme — BotolaGO | <span dir="rtl">لاعبو فانتازي البطولة الاحترافية: الأسعار والنقاط والمستوى الأخير — BotolaGO</span> | Browser tab title and search-engine snippet of the Players pages.<br>Latin text inside: BotolaGO.<br>Was: <span dir="rtl">لاعبو فانتازي البطولة الاحترافية: الأسعار والنقاط والفورمة — BotolaGO</span><br>Appears in browser tabs and Google results. Glossary change (form).<br>Phase C · `fantasy.meta.players_title` | ☐ | |
| P-10 | Tous les joueurs de BotolaGO Fantasy avec leur prix, leurs points et leur forme, à filtrer par poste et par club et à comparer entre eux. | <span dir="rtl">جميع لاعبي BotolaGO Fantasy بأسعارهم ونقاطهم ومستواهم الأخير، مع التصفية حسب المركز والنادي والمقارنة بينهم.</span> | Browser tab title and search-engine snippet of the Players pages.<br>Latin text inside: BotolaGO, Fantasy.<br>Was: <span dir="rtl">جميع لاعبي BotolaGO Fantasy بأسعارهم ونقاطهم وفورمتهم، مع التصفية حسب المركز والنادي والمقارنة بينهم.</span><br>Phase C · `fantasy.meta.players_description` | ☐ | |
| P-11 | {name} : prix, points et forme — BotolaGO Fantasy | <span dir="rtl">{name}: السعر والنقاط والمستوى الأخير — BotolaGO Fantasy</span> | Browser tab title and search-engine snippet of the Players pages.<br>Placeholders: `{name}`.<br>Latin text inside: BotolaGO, Fantasy.<br>Was: <span dir="rtl">{name}: السعر والنقاط والفورمة — BotolaGO Fantasy</span><br>Phase C · `fantasy.meta.player_title` | ☐ | |
| P-12 | {name} : statistiques, forme, prix et prochains matchs, pour décider de sa place dans votre équipe BotolaGO Fantasy. | <span dir="rtl">{name}: الإحصائيات والمستوى الأخير والسعر والمباريات القادمة، لتقرّر إن كان يستحق مكانًا في فريقك على BotolaGO Fantasy.</span> | Browser tab title and search-engine snippet of the Players pages.<br>Placeholders: `{name}`.<br>Latin text inside: BotolaGO, Fantasy.<br>Was: <span dir="rtl">{name}: الإحصائيات والفورمة والسعر والمباريات القادمة، لتقرّر إن كان يستحق مكانًا في فريقك على BotolaGO Fantasy.</span><br>Phase C · `fantasy.meta.player_description` | ☐ | |
| P-13 | Statistiques, forme, prix et prochains matchs d'un joueur de la Botola Pro pour votre équipe BotolaGO Fantasy. | <span dir="rtl">إحصائيات لاعب من البطولة الاحترافية ومستواه الأخير وسعره ومبارياته القادمة، لفريقك على BotolaGO Fantasy.</span> | Browser tab title and search-engine snippet of the Players pages.<br>Latin text inside: BotolaGO, Fantasy.<br>Was: <span dir="rtl">إحصائيات لاعب من البطولة الاحترافية وفورمته وسعره ومبارياته القادمة، لفريقك على BotolaGO Fantasy.</span><br>Phase C · `fantasy.meta.player_unknown_description` | ☐ | |
| P-14 | Forme | <span dir="rtl">المستوى الأخير</span> | Player card, “form”.<br>Was: <span dir="rtl">الفورمة</span><br>Glossary: form is “المستوى الأخير” (was “الفورمة”, a transliteration).<br>Phase C · `fpl.form` | ☐ | |
| P-15 | Données chargées | <span dir="rtl">تم تحميل البيانات</span> | Fantasy screens, “data loaded” stamp.<br>Phase A · `fpl.last_retrieved` | ☐ | |
| P-16 | La copie a échoué. Sélectionnez le code pour le copier. | <span dir="rtl">تعذّر النسخ. حدّد الرمز لنسخه.</span> | League invite code, message when copying fails.<br>“الرمز” = the code (league invite).<br>Phase D · `fpl.copy_failed` | ☐ | |
| P-17 | Activer ce jeton ? | <span dir="rtl">تفعيل هذا الجوكر؟</span> | Chip (joker) activation dialog and messages.<br>Was: <span dir="rtl">تفعيل هذه الرقاقة؟</span><br>Phase C · `fantasy.chip.confirm_title` | ☐ | |
| P-18 | Un seul jeton peut être actif à la fois. Cette action sera bloquée après la date limite. | <span dir="rtl">لا يمكن تفعيل أكثر من جوكر واحد. سيتم إيقاف هذا الإجراء بعد الموعد النهائي.</span> | Chip (joker) activation dialog and messages.<br>Was: <span dir="rtl">لا يمكن تفعيل أكثر من رقاقة واحدة. سيتم إيقاف هذا الإجراء بعد الموعد النهائي.</span><br>Glossary: chip is now “الجوكر”.<br>Phase C · `fantasy.chip.confirm_desc` | ☐ | |
| P-19 | Jeton activé | <span dir="rtl">تم تفعيل الجوكر</span> | Chip (joker) activation dialog and messages.<br>Was: <span dir="rtl">تم تفعيل الرقاقة</span><br>Phase C · `fantasy.chip.activated` | ☐ | |
| P-20 | Jeton désactivé | <span dir="rtl">تم إلغاء الجوكر</span> | Chip (joker) activation dialog and messages.<br>Was: <span dir="rtl">تم إلغاء الرقاقة</span><br>Phase C · `fantasy.chip.deactivated` | ☐ | |
| P-21 | Ce jeton a déjà été utilisé. | <span dir="rtl">سبق استخدام هذا الجوكر.</span> | Chip (joker) error messages.<br>Was: <span dir="rtl">تم استخدام هذه الرقاقة من قبل.</span><br>Phase C · `fantasy.engine.chip_used` | ☐ | |
| P-22 | Un autre jeton est déjà actif. | <span dir="rtl">يوجد جوكر آخر مفعّل.</span> | Chip (joker) error messages.<br>Was: <span dir="rtl">توجد رقاقة أخرى مفعّلة.</span><br>Phase C · `fantasy.engine.chip_conflict` | ☐ | |
| P-23 | Jeton annulé | <span dir="rtl">تم إلغاء الجوكر</span> | Chip (joker) activation dialog and messages.<br>Was: <span dir="rtl">تم إلغاء الرقاقة</span><br>Phase C · `fantasy.chip.cancelled` | ☐ | |
| P-24 | Le résultat sera enregistré, le jeton actif marqué utilisé et l'équipe Free Hit restaurée le cas échéant. | <span dir="rtl">سيتم حفظ النتيجة، واحتساب الجوكر المفعّل كمُستخدَم، واستعادة تشكيلة Free Hit عند الاقتضاء.</span> | Admin Fantasy console (staff), confirmation text.<br>Latin text inside: Free, Hit.<br>Was: <span dir="rtl">سيتم حفظ النتيجة، واحتساب الرقاقة النشطة كمُستخدَمة، واستعادة تشكيلة Free Hit عند الاقتضاء.</span><br>Staff-only dialog. Glossary change (chip).<br>Phase C · `fantasy.points.finalize_confirm_desc` | ☐ | |
| P-25 | Les transferts gratuits seront mis à jour (plafond 2) et l'état de transfert réinitialisé. | <span dir="rtl">سيتم تحديث الانتقالات المجانية (بحد أقصى 2) وإعادة تعيين حالة الانتقالات.</span> | Admin Fantasy console (staff), confirmation text.<br>Was: <span dir="rtl">سيتم تحديث التحويلات المجانية (بحد أقصى 2) وإعادة تعيين حالة التحويلات.</span><br>Phase C · `fantasy.points.advance_confirm_desc` | ☐ | |
| P-26 | {accent}Top 5{/accent} de la journée | <span dir="rtl">{accent}أفضل 5{/accent} لاعبين في الجولة</span> | Fantasy home, “Top 5 players” block.<br>Placeholders: `{accent}`.<br>Was: <span dir="rtl">{accent}أفضل 5{/accent} لاعبين هذا الأسبوع</span><br>{accent}…{/accent} marks the highlighted words (not shown to the reader). French also changed: “de la semaine” became “de la journée”.<br>Phase C · `fantasy.top.title` | ☐ | |
| P-27 | Forme | <span dir="rtl">المستوى الأخير</span> | Fantasy home, “Top 5 players” block.<br>Was: <span dir="rtl">المستوى</span><br>Glossary: form is “المستوى الأخير” (was “المستوى”).<br>Phase C · `fantasy.top.form` | ☐ | |
| P-28 | Joueur de la journée | <span dir="rtl">لاعب الجولة</span> | Fantasy home, “Top 5 players” block.<br>Was: <span dir="rtl">لاعب الأسبوع</span><br>French also changed: “de la semaine” became “de la journée”.<br>Phase C · `fantasy.top.best_player` | ☐ | |

### R. Pronostics (match predictions)

12 strings. Screen: Pronostics.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| R-01 | Ajout de vos pronostics de visiteur à votre compte… | <span dir="rtl">جارٍ إضافة توقعاتك كزائر إلى حسابك…</span> | Pronostics, while guest picks are added to the new account.<br>Phase A · `predictions.claim.pending` | ☐ | |
| R-02 | 1 pronostic fait avant la connexion n'est pas encore sur votre compte | <span dir="rtl">توقع واحد سجّلته قبل تسجيل الدخول لم يُضف إلى حسابك بعد</span> | Pronostics banner: guest picks not yet on the account (1, 2, 3–10, 11+).<br>Plural form “one”: exactly 1.<br>Plural form. “توقع” = prediction (Pronostic).<br>Phase A · `predictions.claim.unsaved_one` | ☐ | |
| R-03 | 2 pronostics faits avant la connexion ne sont pas encore sur votre compte | <span dir="rtl">توقعان قبل تسجيل الدخول لم يُضافا إلى حسابك بعد</span> | Pronostics banner: guest picks not yet on the account (1, 2, 3–10, 11+).<br>Plural form “two”: exactly 2.<br>Phase A · `predictions.claim.unsaved_two` | ☐ | |
| R-04 | {n} pronostics faits avant la connexion ne sont pas encore sur votre compte | <span dir="rtl">{n} توقعات قبل تسجيل الدخول لم تُضف إلى حسابك بعد</span> | Pronostics banner: guest picks not yet on the account (1, 2, 3–10, 11+).<br>Plural form “few”: 3 to 10 (also 103, 1003…).<br>Placeholders: `{n}`.<br>Phase A · `predictions.claim.unsaved_few` | ☐ | |
| R-05 | {n} pronostics faits avant la connexion ne sont pas encore sur votre compte | <span dir="rtl">{n} توقعًا قبل تسجيل الدخول لم يُضف إلى حسابك بعد</span> | Pronostics banner: guest picks not yet on the account (1, 2, 3–10, 11+).<br>Plural form “other”: 100 and over (and any case not listed).<br>Placeholders: `{n}`.<br>Phase A · `predictions.claim.unsaved_other` | ☐ | |
| R-06 | Rien n'est perdu : vos pronostics restent sur ce téléphone. Réessayez avant le coup d'envoi : un match commencé ne peut plus être ajouté. | <span dir="rtl">لم يضع شيء: توقعاتك باقية على هذا الهاتف. أعد المحاولة قبل انطلاق المباراة: لا يمكن إضافة توقع مباراة بدأت.</span> | Pronostics banner, explanation after a failed transfer of guest picks.<br>Reassurance wording: please check it reads calm and clear.<br>Phase A · `predictions.claim.failed_body` | ☐ | |
| R-07 | Nouvel essai automatique en cours… | <span dir="rtl">تُعاد المحاولة تلقائيًا…</span> | Pronostics banner, automatic retry.<br>Phase A · `predictions.claim.retrying` | ☐ | |
| R-08 | Chargement de vos pronostics enregistrés… | <span dir="rtl">جارٍ تحميل توقعاتك المحفوظة…</span> | Pronostics, loading and failure of saved picks.<br>Phase A · `predictions.personal.loading` | ☐ | |
| R-09 | Vos pronostics enregistrés n'ont pas pu être chargés. La modification est suspendue pour ne pas écraser vos scores. | <span dir="rtl">تعذّر تحميل توقعاتك المحفوظة. عُلّق التعديل حتى لا تُستبدل توقعاتك المحفوظة.</span> | Pronostics, loading and failure of saved picks.<br>Phase A · `predictions.personal.failed` | ☐ | |
| R-10 | Pronostic pas encore chargé | <span dir="rtl">لم يُحمَّل التوقع بعد</span> | Pronostics, loading and failure of saved picks.<br>Phase A · `predictions.personal.unknown_pick` | ☐ | |
| R-11 | carrousel | <span dir="rtl">عرض دوّار</span> | Pronostics cards carousel, role read aloud by screen readers.<br>Screen-reader word for a carousel: “عرض دوّار”.<br>Phase C · `predictions.votes.role` | ☐ | |
| R-12 | diapositive | <span dir="rtl">شريحة</span> | Pronostics cards carousel, role read aloud by screen readers.<br>Screen-reader word for one slide: “شريحة”.<br>Phase C · `predictions.votes.slide_role` | ☐ | |

### X. Prospects / المواهب (the under-23 section, renamed from Pépites)

27 strings. Screen: Prospects.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| X-01 | Ne plus recevoir l'e-mail Prospects ? | <span dir="rtl">هل تريد التوقف عن تلقي رسالة المواهب؟</span> | Prospects e-mail unsubscribe page.<br>Was: <span dir="rtl">هل تريد التوقف عن تلقي رسالة Pépites؟</span><br>Brand word. Compare the form “رسالة المواهب” (the Prospects e-mail).<br>Phase D · `unsubscribe.pepites_confirm_title` | ☐ | |
| X-02 | Cela arrête seulement l'e-mail hebdomadaire Prospects. Vos autres e-mails BotolaGO ne changent pas. | <span dir="rtl">سيوقف ذلك رسالة المواهب الأسبوعية فقط. باقي رسائل BotolaGO الإلكترونية لن تتغير.</span> | Prospects e-mail unsubscribe page.<br>Latin text inside: BotolaGO.<br>Was: <span dir="rtl">سيوقف ذلك رسالة Pépites الأسبوعية فقط. باقي رسائل BotolaGO الإلكترونية لن تتغير.</span><br>Phase D · `unsubscribe.pepites_confirm_body` | ☐ | |
| X-03 | Vous ne recevrez plus l'e-mail Prospects. | <span dir="rtl">لن تصلك بعد الآن رسالة المواهب.</span> | Prospects e-mail unsubscribe page.<br>Was: <span dir="rtl">لن تصلك بعد الآن رسالة Pépites.</span><br>Phase D · `unsubscribe.pepites_done_title` | ☐ | |
| X-04 | L'e-mail Prospects était déjà désactivé. | <span dir="rtl">رسالة المواهب كانت معطّلة من قبل.</span> | Prospects e-mail unsubscribe page.<br>Was: <span dir="rtl">رسالة Pépites كانت معطّلة من قبل.</span><br>Phase D · `unsubscribe.pepites_already_title` | ☐ | |
| X-05 | Vos autres e-mails BotolaGO ne changent pas. Vous pouvez vous réabonner à Prospects à tout moment. | <span dir="rtl">باقي رسائل BotolaGO الإلكترونية لن تتغير. يمكنك إعادة الاشتراك في المواهب في أي وقت.</span> | Prospects e-mail unsubscribe page.<br>Latin text inside: BotolaGO.<br>Was: <span dir="rtl">باقي رسائل BotolaGO الإلكترونية لن تتغير. يمكنك إعادة الاشتراك في Pépites في أي وقت.</span><br>Phase D · `unsubscribe.pepites_reenable_hint` | ☐ | |
| X-06 | Prospects | <span dir="rtl">المواهب</span> | Bottom/top navigation label.<br>Was: <span dir="rtl">جواهر</span><br>Brand word. Was “جواهر” (jewels). French also changed (Pépites became Prospects).<br>Phase D · `nav.pepites` | ☐ | |
| X-07 | Prospects | <span dir="rtl">المواهب</span> | Section name in the section’s header.<br>Was: <span dir="rtl">جواهر</span><br>Brand word.<br>Phase D · `pepites.brand` | ☐ | |
| X-08 | Joueurs : {n} | <span dir="rtl">عدد اللاعبين: {n}</span> | Ranking page, count of players.<br>Placeholders: `{n}`.<br>Was: <span dir="rtl">{n} لاعبا</span><br>French also changed (“{n} joueurs” became “Joueurs : {n}”).<br>Phase C · `pepites.ranking.count_short` | ☐ | |
| X-09 | Prospects | <span dir="rtl">المواهب</span> | Player page, back link.<br>Was: <span dir="rtl">جواهر</span><br>Phase D · `pepites.player.back` | ☐ | |
| X-10 | Prospects — le Top 10 des jeunes de Botola Pro \| BotolaGO | <span dir="rtl">المواهب — أفضل 10 لشباب البطولة الاحترافية \| BotolaGO</span> | Browser tab title / search snippet.<br>Latin text inside: BotolaGO.<br>Was: <span dir="rtl">جواهر — أفضل 10 لشباب البطولة الاحترافية \| BotolaGO</span><br>Browser tab. “أفضل 10” here, while e-mails use “توب 10”.<br>Phase D · `pepites.meta_title` | ☐ | |
| X-11 | Bientôt sur BotolaGO : Prospects | <span dir="rtl">المواهب قريبًا</span> | Section placeholder (not yet open) or error.<br>Was: <span dir="rtl">جواهر قريبًا</span><br>French says “Soon on BotolaGO: Prospects”; Arabic says only “المواهب قريبًا”.<br>Phase D · `pepites.state.coming_soon` | ☐ | |
| X-12 | Impossible de charger Prospects | <span dir="rtl">تعذّر تحميل المواهب</span> | Section placeholder (not yet open) or error.<br>Was: <span dir="rtl">تعذّر تحميل جواهر</span><br>Phase D · `pepites.state.error` | ☐ | |
| X-13 | La révélation du Top 10 — Prospects \| BotolaGO | <span dir="rtl">كشف أفضل 10 — المواهب \| BotolaGO</span> | Browser tab title / search snippet.<br>Latin text inside: BotolaGO.<br>Was: <span dir="rtl">كشف أفضل 10 — جواهر \| BotolaGO</span><br>Phase D · `pepites.reveal.meta_title` | ☐ | |
| X-14 | Prospects, c'est le classement des joueurs de Botola Pro de moins de 23 ans, établi à partir de leurs matchs. Le Top 10 est choisi chaque semaine par la rédaction. | <span dir="rtl">يرتّب قسم المواهب لاعبي البطولة الاحترافية دون 23 سنة انطلاقًا من مبارياتهم. تختار هيئة التحرير أفضل 10 كل أسبوع.</span> | Section home, “about” paragraph.<br>Was: <span dir="rtl">يرتّب جواهر لاعبي البطولة الاحترافية دون 23 سنة انطلاقًا من مبارياتهم. تختار هيئة التحرير أفضل 10 كل أسبوع.</span><br>Arabic says “قسم المواهب” (the Prospects section).<br>Phase D · `pepites.home.about` | ☐ | |
| X-15 | Connectez-vous pour recevoir le Top 10 Prospects par e-mail. | <span dir="rtl">سجّل الدخول لتتلقى توب 10 من المواهب عبر البريد الإلكتروني.</span> | Weekly Top 10 e-mail sign-up (prompt and confirmation).<br>Was: <span dir="rtl">سجّل الدخول لتتلقى توب 10 من Pépites عبر البريد الإلكتروني.</span><br>Phase D · `pepites.email.sign_in_reason` | ☐ | |
| X-16 | Inscription enregistrée. | <span dir="rtl">تم حفظ الاشتراك.</span> | Weekly Top 10 e-mail sign-up (prompt and confirmation).<br>Was: <span dir="rtl">ستتلقى توب 10 كل أسبوع.</span><br>French and Arabic both changed: no longer promises “every week”.<br>Phase B · `pepites.email.on_toast` | ☐ | |
| X-17 | Classement Prospects — les moins de 23 ans de Botola Pro \| BotolaGO | <span dir="rtl">ترتيب المواهب — لاعبو البطولة الاحترافية دون 23 سنة \| BotolaGO</span> | Browser tab title / search snippet.<br>Latin text inside: BotolaGO.<br>Was: <span dir="rtl">ترتيب جواهر — لاعبو البطولة الاحترافية دون 23 سنة \| BotolaGO</span><br>Phase D · `pepites.ranking.meta_title` | ☐ | |
| X-18 | {name} — Prospects \| BotolaGO | <span dir="rtl">{name} — ترتيب المواهب \| BotolaGO</span> | Browser tab title / search snippet.<br>Placeholders: `{name}`.<br>Latin text inside: BotolaGO.<br>Was: <span dir="rtl">{name} — ترتيب جواهر \| BotolaGO</span><br>Phase D · `pepites.player.meta_title` | ☐ | |
| X-19 | Ce joueur n'est pas dans Prospects. | <span dir="rtl">هذا اللاعب غير موجود في ترتيب المواهب.</span> | Player page, player not in the ranking.<br>Was: <span dir="rtl">هذا اللاعب غير موجود في جواهر.</span><br>Phase D · `pepites.player.not_found` | ☐ | |
| X-20 | Prospects · Top 10 de la semaine {n} \| BotolaGO | <span dir="rtl">المواهب · أفضل 10 للأسبوع {n} \| BotolaGO</span> | Browser tab title / search snippet.<br>Placeholders: `{n}`.<br>Latin text inside: BotolaGO.<br>Was: <span dir="rtl">جواهر · أفضل 10 للأسبوع {n} \| BotolaGO</span><br>Phase D · `pepites.edition.meta_title` | ☐ | |
| X-21 | Méthode Prospects — comment le classement est calculé \| BotolaGO | <span dir="rtl">منهجية المواهب — كيف يُحسب الترتيب \| BotolaGO</span> | Browser tab title / search snippet.<br>Latin text inside: BotolaGO.<br>Was: <span dir="rtl">طريقة جواهر — كيف يُحسب الترتيب \| BotolaGO</span><br>Phase D · `pepites.method.meta_title` | ☐ | |
| X-22 | Comment est établi le classement Prospects des moins de 23 ans de Botola Pro, et la couverture des données. | <span dir="rtl">كيف يرتّب قسم المواهب لاعبي البطولة الاحترافية دون 23 سنة، ومدى اكتمال البيانات.</span> | Browser tab title / search snippet.<br>Was: <span dir="rtl">كيف يرتّب جواهر لاعبي البطولة الاحترافية دون 23 سنة، ومدى اكتمال البيانات.</span><br>Phase D · `pepites.method.meta_description` | ☐ | |
| X-23 | {name} dans Prospects, le classement des moins de 23 ans de Botola Pro sur BotolaGO. | <span dir="rtl">{name} في المواهب، ترتيب لاعبي البطولة الاحترافية دون 23 سنة على BotolaGO.</span> | Share sheet (message, image description, copy fallback).<br>Placeholders: `{name}`.<br>Latin text inside: BotolaGO.<br>Was: <span dir="rtl">{name} في جواهر، ترتيب لاعبي البطولة الاحترافية دون 23 سنة على BotolaGO.</span><br>Message text for WhatsApp and similar.<br>Phase D · `pepites.share.player_message` | ☐ | |
| X-24 | Image du Top 10 Prospects de la semaine {n} | <span dir="rtl">صورة أفضل 10 من المواهب للأسبوع {n}</span> | Share sheet (message, image description, copy fallback).<br>Placeholders: `{n}`.<br>Was: <span dir="rtl">صورة أفضل 10 من جواهر للأسبوع {n}</span><br>Phase D · `pepites.share.image_alt` | ☐ | |
| X-25 | Le Top 10 Prospects de la semaine {n} : les meilleurs jeunes de Botola Pro sur BotolaGO. | <span dir="rtl">أفضل 10 من المواهب للأسبوع {n}: أفضل شباب البطولة الاحترافية على BotolaGO.</span> | Share sheet (message, image description, copy fallback).<br>Placeholders: `{n}`.<br>Latin text inside: BotolaGO.<br>Was: <span dir="rtl">أفضل 10 من جواهر للأسبوع {n}: أفضل شباب البطولة الاحترافية على BotolaGO.</span><br>Phase D · `pepites.share.message` | ☐ | |
| X-26 | La copie automatique a échoué. Copiez le texte ci-dessous. | <span dir="rtl">تعذّر النسخ تلقائيًا. انسخ النص أدناه.</span> | Share sheet (message, image description, copy fallback).<br>Fallback if automatic copy fails.<br>Phase D · `pepites.share.copy_manual` | ☐ | |
| X-27 | Texte à copier | <span dir="rtl">النص المراد نسخه</span> | Share sheet (message, image description, copy fallback).<br>Phase D · `pepites.share.copy_manual_label` | ☐ | |

### A. Sign-up, account deletion, admin prizes

3 strings. Screen: Account.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| A-01 | 3 à 20 caractères : lettres latines sans accent (a–z), chiffres, tiret (-) ou tiret bas (_). Commencez par une lettre ou un chiffre. | <span dir="rtl">من 3 إلى 20 حرفًا: أحرف لاتينية (⁦a–z⁩) وأرقام والرمزان ⁦-⁩ و⁦_⁩. ابدأ بحرف لاتيني أو رقم.</span> | Sign-up form, username error.<br>Was: <span dir="rtl">3 إلى 20 حرفًا: أحرف وأرقام و - و _ فقط.</span><br>Contains invisible direction marks around a–z, “-” and “_”; keep them when editing. The username itself must be written in Latin letters.<br>Phase C · `auth.error.username_invalid` | ☐ | |
| A-02 | Vos données de jeu : équipe Fantasy, compositions, transferts, jetons, points et classements, pronostics et votes. | <span dir="rtl">بيانات اللعب: فريق الفانتازي، التشكيلات، الانتقالات، الجوكرات، النقاط والترتيبات، التوقعات والتصويتات.</span> | Account deletion screen, list of what is erased.<br>Was: <span dir="rtl">بيانات اللعب: فريق الفانتازي، التشكيلات، الانتقالات، الرقائق، النقاط والترتيبات، التوقعات والتصويتات.</span><br>Glossary change (chips).<br>Phase C · `account_deletion.deleted_game` | ☐ | |
| A-03 | Aucun gagnant pour ce filtre. | <span dir="rtl">لا يوجد فائزون يطابقون هذه التصفية.</span> | Admin prizes (staff), empty filter result.<br>Was: <span dir="rtl">لا يوجد فائزون لهذا التصفية.</span><br>Staff-only; grammar fix (“هذه التصفية”).<br>Phase C · `prizes.admin.winners.empty` | ☐ | |

### C. Manager card loading failure

2 strings. Screen: Card.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| C-01 | La carte n’a pas pu s’afficher. Vérifiez votre connexion, puis réessayez. | <span dir="rtl">تعذّر عرض البطاقة. تحقّق من اتصالك ثم أعد المحاولة.</span> | Manager card, when it cannot be drawn.<br>Phase B · `card.load_failed` | ☐ | |
| C-02 | Recharger la page | <span dir="rtl">إعادة تحميل الصفحة</span> | Manager card, when it cannot be drawn.<br>Phase B · `card.reload` | ☐ | |

---

## Part 2. BotolaGO+ screens merged during the same period

382 strings. These are not part of the audit remediation, but they landed on `main` between Phase A and now, and the repository does not show that a native speaker has read them. Review them if time allows. They share the recap (#491), the rivals, briefing and trophies lanes (#492, #494) and the Saison screens (#501, #502).

### RC. BotolaGO+ Round recap (“Votre journée expliquée”)

77 strings. Screen: BotolaGO+ recap.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| RC-01 | Votre journée expliquée | <span dir="rtl">جولتك مشروحة</span> | Recap page title (member / locked preview).<br>BotolaGO+ recap (#491) · `plus.recap.title` | ☐ | |
| RC-02 | Pourquoi cette journée a tourné ainsi | <span dir="rtl">لماذا سارت هذه الجولة هكذا</span> | Recap page title (member / locked preview).<br>BotolaGO+ recap (#491) · `plus.recap.locked_title` | ☐ | |
| RC-03 | Journée {n} | <span dir="rtl">الجولة {n}</span> | Recap header stamps.<br>Placeholders: `{n}`.<br>BotolaGO+ recap (#491) · `plus.recap.journee` | ☐ | |
| RC-04 | Publié le {date} | <span dir="rtl">نُشرت في {date}</span> | Recap header stamps.<br>Placeholders: `{date}`.<br>Date: written by the app in Morocco time.<br>BotolaGO+ recap (#491) · `plus.recap.published` | ☐ | |
| RC-05 | Notes en attente | <span dir="rtl">تقييمات بانتظار النشر</span> | Recap header stamps.<br>BotolaGO+ recap (#491) · `plus.recap.waiting_chip` | ☐ | |
| RC-06 | Journée {n} : {score} pts, {gap} de plus que la moyenne de votre ligue | <span dir="rtl">الجولة {n}: {score} نقطة، {gap} أكثر من معدل دوريك</span> | Recap headline: score against the league average.<br>Placeholders: `{n}` `{score}` `{gap}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>{gap} is a number of points, e.g. “12 نقطة”.<br>BotolaGO+ recap (#491) · `plus.recap.headline_more` | ☐ | |
| RC-07 | Journée {n} : {score} pts, {gap} de moins que la moyenne de votre ligue | <span dir="rtl">الجولة {n}: {score} نقطة، {gap} أقل من معدل دوريك</span> | Recap headline: score against the league average.<br>Placeholders: `{n}` `{score}` `{gap}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>BotolaGO+ recap (#491) · `plus.recap.headline_less` | ☐ | |
| RC-08 | Journée {n} : {score} pts, pile la moyenne de votre ligue | <span dir="rtl">الجولة {n}: {score} نقطة، مثل معدل دوريك تماماً</span> | Recap headline: score against the league average.<br>Placeholders: `{n}` `{score}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>BotolaGO+ recap (#491) · `plus.recap.headline_same` | ☐ | |
| RC-09 | Journée {n} : {score} pts | <span dir="rtl">الجولة {n}: {score} نقطة</span> | Recap headline: score against the league average.<br>Placeholders: `{n}` `{score}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>BotolaGO+ recap (#491) · `plus.recap.headline_plain` | ☐ | |
| RC-10 | PTS | <span dir="rtl">نقطة</span> | Recap score tile units and waiting state.<br>French is the abbreviation “PTS” in capitals; Arabic spells “نقطة”.<br>BotolaGO+ recap (#491) · `plus.recap.pts` | ☐ | |
| RC-11 | pts | <span dir="rtl">نقطة</span> | Recap score tile units and waiting state.<br>BotolaGO+ recap (#491) · `plus.recap.unit` | ☐ | |
| RC-12 | en attente | <span dir="rtl">بانتظار التقييم</span> | Recap score tile units and waiting state.<br>BotolaGO+ recap (#491) · `plus.recap.waiting` | ☐ | |
| RC-13 | {n} au classement | <span dir="rtl">{n} في الترتيب</span> | Recap, league rank movement.<br>Placeholders: `{n}`.<br>BotolaGO+ recap (#491) · `plus.recap.move_up` | ☐ | |
| RC-14 | {n} au classement | <span dir="rtl">{n} في الترتيب</span> | Recap, league rank movement.<br>Placeholders: `{n}`.<br>BotolaGO+ recap (#491) · `plus.recap.move_down` | ☐ | |
| RC-15 | Même rang | <span dir="rtl">الترتيب نفسه</span> | Recap, league rank movement.<br>BotolaGO+ recap (#491) · `plus.recap.move_same` | ☐ | |
| RC-16 | Moyenne ligue | <span dir="rtl">معدل الدوري</span> | Recap, league average / best score labels.<br>BotolaGO+ recap (#491) · `plus.recap.avg` | ☐ | |
| RC-17 | Meilleur score | <span dir="rtl">أفضل نتيجة</span> | Recap, league average / best score labels.<br>BotolaGO+ recap (#491) · `plus.recap.best` | ☐ | |
| RC-18 | Votre onze · J{n} | <span dir="rtl">تشكيلتك · الجولة {n}</span> | Recap pitch view (your line-up of the round).<br>Placeholders: `{n}`.<br>BotolaGO+ recap (#491) · `plus.recap.pitch_title` | ☐ | |
| RC-19 | Banc · non compté | <span dir="rtl">الاحتياط · غير محتسب</span> | Recap pitch view (your line-up of the round).<br>BotolaGO+ recap (#491) · `plus.recap.bench` | ☐ | |
| RC-20 | {pts} pts | <span dir="rtl">{pts} نقطة</span> | Recap pitch view (your line-up of the round).<br>Placeholders: `{pts}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>BotolaGO+ recap (#491) · `plus.recap.bench_total` | ☐ | |
| RC-21 | n'a pas joué | <span dir="rtl">لم يشارك</span> | Recap pitch view (your line-up of the round).<br>BotolaGO+ recap (#491) · `plus.recap.did_not_play` | ☐ | |
| RC-22 | Capitaine | <span dir="rtl">القائد</span> | Recap pitch view (your line-up of the round).<br>BotolaGO+ recap (#491) · `plus.recap.captain_badge` | ☐ | |
| RC-23 | Transfert | <span dir="rtl">تبديل</span> | Recap pitch view (your line-up of the round).<br>Terminology: this part of BotolaGO+ says “تبديل” (substitution/swap) for “Transfert”; the Fantasy glossary above says “انتقال”. See the special-attention list.<br>BotolaGO+ recap (#491) · `plus.recap.transfer_badge` | ☐ | |
| RC-24 | Liseré : 8 pts et plus | <span dir="rtl">إطار: 8 نقاط فأكثر</span> | Recap pitch view (your line-up of the round).<br>BotolaGO+ recap (#491) · `plus.recap.legend_lit` | ☐ | |
| RC-25 | Hachuré : note en attente | <span dir="rtl">تظليل: بانتظار التقييم</span> | Recap pitch view (your line-up of the round).<br>BotolaGO+ recap (#491) · `plus.recap.legend_wait` | ☐ | |
| RC-26 | Ce qui explique l'écart | <span dir="rtl">ما يفسّر الفارق</span> | Recap, “what explains the gap” breakdown.<br>BotolaGO+ recap (#491) · `plus.recap.causes_title` | ☐ | |
| RC-27 | Touchez une cause pour la voir sur le terrain | <span dir="rtl">المس سبباً لتراه على الملعب</span> | Recap, “what explains the gap” breakdown.<br>BotolaGO+ recap (#491) · `plus.recap.causes_hint` | ☐ | |
| RC-28 | Moyenne de la ligue | <span dir="rtl">معدل الدوري</span> | Recap, “what explains the gap” breakdown.<br>BotolaGO+ recap (#491) · `plus.recap.league_avg` | ☐ | |
| RC-29 | Capitaine | <span dir="rtl">القائد</span> | Recap, “what explains the gap” breakdown.<br>BotolaGO+ recap (#491) · `plus.recap.cause_captain` | ☐ | |
| RC-30 | {name} : {formula} pts, {gap} vs les capitaines de la ligue | <span dir="rtl">{name}: {formula} نقطة، {gap} مقارنة بقادة الدوري</span> | Recap, “what explains the gap” breakdown.<br>Placeholders: `{name}` `{formula}` `{gap}`.<br>“نقطة” after a number in a fixed form (see “Counts” above).<br>BotolaGO+ recap (#491) · `plus.recap.captain_line` | ☐ | |
| RC-31 | {name} : {formula} pts | <span dir="rtl">{name}: {formula} نقطة</span> | Recap, “what explains the gap” breakdown.<br>Placeholders: `{name}` `{formula}`.<br>“نقطة” after a number in a fixed form (see “Counts” above).<br>BotolaGO+ recap (#491) · `plus.recap.captain_plain` | ☐ | |
| RC-32 | Brassard repris par le vice-capitaine | <span dir="rtl">شارة القيادة انتقلت إلى نائب القائد</span> | Recap, “what explains the gap” breakdown.<br>“شارة القيادة” = captain’s armband (as in the glossary).<br>BotolaGO+ recap (#491) · `plus.recap.captain_vice` | ☐ | |
| RC-33 | Transfert | <span dir="rtl">تبديل</span> | Recap, “what explains the gap” breakdown.<br>Terminology: “تبديل” vs glossary “انتقال”.<br>BotolaGO+ recap (#491) · `plus.recap.cause_transfer` | ☐ | |
| RC-34 | {out} → {in} : {gain} pts, pénalité {hit} = {net} | <span dir="rtl">{out} ← {in}: {gain} نقطة، غرامة {hit} = {net}</span> | Recap, “what explains the gap” breakdown.<br>Placeholders: `{out}` `{in}` `{gain}` `{hit}` `{net}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>Arrow: French “→”, Arabic “←” (direction reversed on purpose for right-to-left). Names inserted are mixed direction.<br>BotolaGO+ recap (#491) · `plus.recap.transfer_line` | ☐ | |
| RC-35 | {out} → {in} : {gain} pts, sans pénalité | <span dir="rtl">{out} ← {in}: {gain} نقطة، بلا غرامة</span> | Recap, “what explains the gap” breakdown.<br>Placeholders: `{out}` `{in}` `{gain}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>Arrow reversed on purpose. “بلا غرامة” = without penalty.<br>BotolaGO+ recap (#491) · `plus.recap.transfer_free` | ☐ | |
| RC-36 | {out} → {in} : en attente | <span dir="rtl">{out} ← {in}: بانتظار التقييم</span> | Recap, “what explains the gap” breakdown.<br>Placeholders: `{out}` `{in}`.<br>Arrow reversed on purpose.<br>BotolaGO+ recap (#491) · `plus.recap.transfer_wait` | ☐ | |
| RC-37 | Vos autres choix | <span dir="rtl">باقي اختياراتك</span> | Recap, “what explains the gap” breakdown.<br>BotolaGO+ recap (#491) · `plus.recap.cause_others` | ☐ | |
| RC-38 | Reste calculé : l'écart moins le capitaine et le transfert. Pas encore mesuré joueur par joueur. | <span dir="rtl">محسوب كباقٍ: الفارق ناقص القائد والتبديل. لم يُقَس بعد لاعباً بلاعب.</span> | Recap, “what explains the gap” breakdown.<br>BotolaGO+ recap (#491) · `plus.recap.others_line` | ☐ | |
| RC-39 | Vous | <span dir="rtl">أنت</span> | Recap, “what explains the gap” breakdown.<br>BotolaGO+ recap (#491) · `plus.recap.you` | ☐ | |
| RC-40 | Titulaires {n} | <span dir="rtl">الأساسيون {n}</span> | Recap, “what explains the gap” breakdown.<br>Placeholders: `{n}`.<br>BotolaGO+ recap (#491) · `plus.recap.part_starters` | ☐ | |
| RC-41 | Capitaine {n} | <span dir="rtl">القائد {n}</span> | Recap, “what explains the gap” breakdown.<br>Placeholders: `{n}`.<br>BotolaGO+ recap (#491) · `plus.recap.part_captain` | ☐ | |
| RC-42 | Pénalité {n} | <span dir="rtl">الغرامة {n}</span> | Recap, “what explains the gap” breakdown.<br>Placeholders: `{n}`.<br>BotolaGO+ recap (#491) · `plus.recap.part_hit` | ☐ | |
| RC-43 | Total {n} | <span dir="rtl">المجموع {n}</span> | Recap, “what explains the gap” breakdown.<br>Placeholders: `{n}`.<br>BotolaGO+ recap (#491) · `plus.recap.part_total` | ☐ | |
| RC-44 | {name} : note en attente | <span dir="rtl">{name}: التقييم بانتظار النشر</span> | Recap, footnotes and states.<br>Plural form “one”: exactly 1.<br>Placeholders: `{name}`.<br>BotolaGO+ recap (#491) · `plus.recap.pending_one` | ☐ | |
| RC-45 | {n} joueurs : notes en attente | <span dir="rtl">{n} لاعبين: تقييمات بانتظار النشر</span> | Recap, footnotes and states.<br>Plural form “many”: 11 to 99 (also 111…).<br>Placeholders: `{n}`.<br>BotolaGO+ recap (#491) · `plus.recap.pending_many` | ☐ | |
| RC-46 | Banc : {pts} pts non comptés | <span dir="rtl">الاحتياط: {pts} نقطة غير محتسبة</span> | Recap, footnotes and states.<br>Placeholders: `{pts}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>BotolaGO+ recap (#491) · `plus.recap.bench_note` | ☐ | |
| RC-47 | Banc : {pts} pts comptés (Bench Boost) | <span dir="rtl">الاحتياط: {pts} نقطة محتسبة (تعزيز الاحتياط)</span> | Recap, footnotes and states.<br>Placeholders: `{pts}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>BotolaGO+ recap (#491) · `plus.recap.bench_note_boost` | ☐ | |
| RC-48 | Banc {n} | <span dir="rtl">الاحتياط {n}</span> | Recap, “what explains the gap” breakdown.<br>Placeholders: `{n}`.<br>BotolaGO+ recap (#491) · `plus.recap.part_bench` | ☐ | |
| RC-49 | Moyenne de votre ligue privée ({n} managers). Les notes arrivent 5 à 16 jours après le match. | <span dir="rtl">معدل دوريك الخاص ({n} مدربين). تصل التقييمات بعد 5 إلى 16 يوماً من المباراة.</span> | Recap, footnotes and states.<br>Placeholders: `{n}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>BotolaGO+ recap (#491) · `plus.recap.league_note` | ☐ | |
| RC-50 | Sans ligue privée, pas de comparaison : rejoignez-en une pour voir l'écart. | <span dir="rtl">بلا دوري خاص لا توجد مقارنة: انضم إلى دوري لترى الفارق.</span> | Recap, footnotes and states.<br>BotolaGO+ recap (#491) · `plus.recap.no_league` | ☐ | |
| RC-51 | Moins de trois managers dans votre ligue : la moyenne n'est pas affichée. | <span dir="rtl">أقل من ثلاثة مدربين في دوريك: لا يظهر المعدل.</span> | Recap, footnotes and states.<br>BotolaGO+ recap (#491) · `plus.recap.small_league` | ☐ | |
| RC-52 | Calcul v{n} | <span dir="rtl">الحساب v{n}</span> | Recap, footnotes and states.<br>Placeholders: `{n}`.<br>“Calcul v2”: v{n} is a version number, Latin letter inside Arabic.<br>BotolaGO+ recap (#491) · `plus.recap.calc` | ☐ | |
| RC-53 | Résultat corrigé | <span dir="rtl">نتيجة مصحّحة</span> | Recap, footnotes and states.<br>BotolaGO+ recap (#491) · `plus.recap.corrected` | ☐ | |
| RC-54 | Aucune liste d'absents n'est disponible pour l'instant. | <span dir="rtl">لا تتوفر قائمة غيابات حالياً.</span> | Recap, footnotes and states.<br>BotolaGO+ recap (#491) · `plus.recap.absences` | ☐ | |
| RC-55 | Partager ma journée | <span dir="rtl">شارك جولتي</span> | Recap, share button, image and message.<br>BotolaGO+ recap (#491) · `plus.recap.share` | ☐ | |
| RC-56 | Journée {n} · {gap} vs la ligue | <span dir="rtl">الجولة {n} · {gap} مقارنة بالدوري</span> | Recap, share button, image and message.<br>Placeholders: `{n}` `{gap}`.<br>BotolaGO+ recap (#491) · `plus.recap.share_heading` | ☐ | |
| RC-57 | Journée {n} | <span dir="rtl">الجولة {n}</span> | Recap, share button, image and message.<br>Placeholders: `{n}`.<br>BotolaGO+ recap (#491) · `plus.recap.share_heading_plain` | ☐ | |
| RC-58 | Ma journée {n} sur BotolaGO : {points} pts. | <span dir="rtl">جولتي {n} على بوطولاجو: {points} نقطة.</span> | Recap, share button, image and message.<br>Placeholders: `{n}` `{points}`.<br>“نقطة” after a number in a fixed form (see “Counts” above).<br>Brand written “بوطولاجو” (Arabic letters). Elsewhere the app writes BotolaGO in Latin letters. Pick one.<br>BotolaGO+ recap (#491) · `plus.recap.share_message` | ☐ | |
| RC-59 | botolago.com · Fantasy Botola Pro | <span dir="rtl">botolago.com · فانتازي البطولة الاحترافية</span> | Recap, share button, image and message.<br>Latin text inside: botolago.com.<br>Domain written in Latin letters inside the Arabic line.<br>BotolaGO+ recap (#491) · `plus.recap.share_footer` | ☐ | |
| RC-60 | Ma journée {n} expliquée | <span dir="rtl">جولتي {n} مشروحة</span> | Recap, share button, image and message.<br>Placeholders: `{n}`.<br>BotolaGO+ recap (#491) · `plus.recap.image_alt` | ☐ | |
| RC-61 | {n} note en attente | <span dir="rtl">{n} تقييم بانتظار النشر</span> | Recap, share button, image and message.<br>Placeholders: `{n}`.<br>BotolaGO+ recap (#491) · `plus.recap.share_waiting` | ☐ | |
| RC-62 | Choisir la journée | <span dir="rtl">اختر الجولة</span> | Recap, round selector, loading, empty and error states.<br>BotolaGO+ recap (#491) · `plus.recap.select_label` | ☐ | |
| RC-63 | Chargement de votre journée | <span dir="rtl">جارٍ تحميل جولتك</span> | Recap, round selector, loading, empty and error states.<br>BotolaGO+ recap (#491) · `plus.recap.loading` | ☐ | |
| RC-64 | Votre journée s'explique dès que ses résultats sont publiés. | <span dir="rtl">تُشرح جولتك فور نشر نتائجها.</span> | Recap, round selector, loading, empty and error states.<br>BotolaGO+ recap (#491) · `plus.recap.empty` | ☐ | |
| RC-65 | Votre journée n'est pas disponible pour le moment. | <span dir="rtl">جولتك غير متاحة حالياً.</span> | Recap, round selector, loading, empty and error states.<br>BotolaGO+ recap (#491) · `plus.recap.failed` | ☐ | |
| RC-66 | Votre saison jusqu'ici : {pts} pts, {rank} après {n} journées | <span dir="rtl">موسمك حتى الآن: {pts} نقطة، {rank} بعد {n} جولات</span> | Recap, season summary tiles.<br>Placeholders: `{pts}` `{rank}` `{n}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>BotolaGO+ recap (#491) · `plus.recap.season_title` | ☐ | |
| RC-67 | Votre saison jusqu'ici : {pts} pts après {n} journées | <span dir="rtl">موسمك حتى الآن: {pts} نقطة بعد {n} جولات</span> | Recap, season summary tiles.<br>Placeholders: `{pts}` `{n}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>BotolaGO+ recap (#491) · `plus.recap.season_title_plain` | ☐ | |
| RC-68 | Meilleure journée | <span dir="rtl">أفضل جولة</span> | Recap, season summary tiles.<br>BotolaGO+ recap (#491) · `plus.recap.tile_best_week` | ☐ | |
| RC-69 | J{n}, {pts} pts | <span dir="rtl">الجولة {n}، {pts} نقطة</span> | Recap, season summary tiles.<br>Placeholders: `{n}` `{pts}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>BotolaGO+ recap (#491) · `plus.recap.tile_best_week_v` | ☐ | |
| RC-70 | Meilleur transfert | <span dir="rtl">أفضل تبديل</span> | Recap, season summary tiles.<br>Terminology: “تبديل” vs glossary “انتقال”.<br>BotolaGO+ recap (#491) · `plus.recap.tile_best_transfer` | ☐ | |
| RC-71 | Transfert le plus coûteux | <span dir="rtl">التبديل الأكثر كلفة</span> | Recap, season summary tiles.<br>Terminology: “تبديل” vs glossary “انتقال”.<br>BotolaGO+ recap (#491) · `plus.recap.tile_worst_transfer` | ☐ | |
| RC-72 | {out} → {in}, {gain} (J{n}) | <span dir="rtl">{out} ← {in}، {gain} (الجولة {n})</span> | Recap, season summary tiles.<br>Placeholders: `{out}` `{in}` `{gain}` `{n}`.<br>Arrow reversed on purpose.<br>BotolaGO+ recap (#491) · `plus.recap.tile_transfer_v` | ☐ | |
| RC-73 | Capitaine bien choisi | <span dir="rtl">القائد المناسب</span> | Recap, season summary tiles.<br>BotolaGO+ recap (#491) · `plus.recap.tile_captain` | ☐ | |
| RC-74 | {k} journées sur {n} | <span dir="rtl">{k} جولات من {n}</span> | Recap, season summary tiles.<br>Placeholders: `{k}` `{n}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>BotolaGO+ recap (#491) · `plus.recap.tile_captain_v` | ☐ | |
| RC-75 | Pénalités | <span dir="rtl">الغرامات</span> | Recap, season summary tiles.<br>BotolaGO+ recap (#491) · `plus.recap.tile_hits` | ☐ | |
| RC-76 | {k}, {pts} pts | <span dir="rtl">{k}، {pts} نقطة</span> | Recap, season summary tiles.<br>Placeholders: `{k}` `{pts}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>BotolaGO+ recap (#491) · `plus.recap.tile_hits_v` | ☐ | |
| RC-77 | Le bilan final s'affiche quand la dernière journée est publiée. | <span dir="rtl">تظهر الحصيلة النهائية عند نشر الجولة الأخيرة.</span> | Recap, season summary tiles.<br>BotolaGO+ recap (#491) · `plus.recap.season_note` | ☐ | |

### RV. BotolaGO+ Rivals (“Vos rivaux”)

67 strings. Screen: BotolaGO+ rivals.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| RV-01 | Suivez vos rivaux, journée après journée | <span dir="rtl">تابع منافسيك، جولة بعد جولة</span> | Headline of the BotolaGO+ offer page when the reader arrives from Rivals.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.ctx.rivals` | ☐ | |
| RV-02 | Vos rivaux | <span dir="rtl">منافسوك</span> | Rivals page title (member / locked preview).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.title` | ☐ | |
| RV-03 | Vos rivaux, journée après journée | <span dir="rtl">منافسوك، جولة بعد جولة</span> | Rivals page title (member / locked preview).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.locked_title` | ☐ | |
| RV-04 | Total | <span dir="rtl">المجموع</span> | Rivals head-to-head board: totals, lead, publication stamps.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.total` | ☐ | |
| RV-05 | {n} pts | <span dir="rtl">{n} نقطة</span> | Rivals head-to-head board: totals, lead, publication stamps.<br>Placeholders: `{n}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.pts` | ☐ | |
| RV-06 | Vous menez de {gap} | <span dir="rtl">تتقدّم بفارق {gap}</span> | Rivals head-to-head board: totals, lead, publication stamps.<br>Placeholders: `{gap}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.lead_me` | ☐ | |
| RV-07 | {name} mène de {gap} | <span dir="rtl">{name} يتقدّم بفارق {gap}</span> | Rivals head-to-head board: totals, lead, publication stamps.<br>Placeholders: `{name}` `{gap}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.lead_him` | ☐ | |
| RV-08 | À égalité | <span dir="rtl">تعادل</span> | Rivals head-to-head board: totals, lead, publication stamps.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.level` | ☐ | |
| RV-09 | Publié le {date} | <span dir="rtl">نُشر في {date}</span> | Rivals head-to-head board: totals, lead, publication stamps.<br>Placeholders: `{date}`.<br>Date: written by the app in Morocco time.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.published` | ☐ | |
| RV-10 | Résultat corrigé le {date} | <span dir="rtl">تم تصحيح النتيجة في {date}</span> | Rivals head-to-head board: totals, lead, publication stamps.<br>Placeholders: `{date}`.<br>Date: written by the app in Morocco time.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.corrected` | ☐ | |
| RV-11 | {round} · {published} | <span dir="rtl">{round}، {published}</span> | Rivals head-to-head board: totals, lead, publication stamps.<br>Placeholders: `{round}` `{published}`.<br>Date: written by the app in Morocco time.<br>Separator: French uses “·”, Arabic uses “،”.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.stamp` | ☐ | |
| RV-12 | {name} vous passe devant : {a} contre {b} | <span dir="rtl">{name} يتقدّم عليك: {a} مقابل {b}</span> | Rivals lead-change banner and round verdict.<br>Placeholders: `{name}` `{a}` `{b}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.banner_rival` | ☐ | |
| RV-13 | Vous passez devant {name} : {a} contre {b} | <span dir="rtl">تتقدّم على {name}: {a} مقابل {b}</span> | Rivals lead-change banner and round verdict.<br>Placeholders: `{name}` `{a}` `{b}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.banner_me` | ☐ | |
| RV-14 | Résultat corrigé : vous reprenez la tête sur {name}, {a} contre {b} | <span dir="rtl">تم تصحيح النتيجة: عدت إلى الصدارة أمام {name}، {a} مقابل {b}</span> | Rivals lead-change banner and round verdict.<br>Placeholders: `{name}` `{a}` `{b}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.banner_me_corrected` | ☐ | |
| RV-15 | Journée {n} : {me} contre {rival} | <span dir="rtl">الجولة {n}: {me} مقابل {rival}</span> | Rivals lead-change banner and round verdict.<br>Placeholders: `{n}` `{me}` `{rival}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.banner_sub` | ☐ | |
| RV-16 | Voir l'affiche | <span dir="rtl">عرض الملصق</span> | Rivals lead-change banner and round verdict.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.see_poster` | ☐ | |
| RV-17 | Journée {n} : vous gagnez {a} à {b} | <span dir="rtl">الجولة {n}: فزت {a} مقابل {b}</span> | Rivals lead-change banner and round verdict.<br>Placeholders: `{n}` `{a}` `{b}`.<br>Addresses a masculine reader (“فزت”). Same as the rest of the app.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.verdict_won` | ☐ | |
| RV-18 | Journée {n} : {name} gagne {a} à {b} | <span dir="rtl">الجولة {n}: فاز {name} {a} مقابل {b}</span> | Rivals lead-change banner and round verdict.<br>Placeholders: `{n}` `{name}` `{a}` `{b}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.verdict_lost` | ☐ | |
| RV-19 | Journée {n} : égalité, {a} à {b} | <span dir="rtl">الجولة {n}: تعادل، {a} مقابل {b}</span> | Rivals lead-change banner and round verdict.<br>Placeholders: `{n}` `{a}` `{b}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.verdict_level` | ☐ | |
| RV-20 | Bilan : {parts} | <span dir="rtl">الحصيلة: {parts}</span> | Rivals season record (wins, losses, ties, biggest gap).<br>Placeholders: `{parts}`.<br>{parts} is a list such as “2 انتصارين، هزيمة واحدة”, joined with the Arabic comma.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.bilan` | ☐ | |
| RV-21 | 1 victoire | <span dir="rtl">انتصار واحد</span> | Rivals season record (wins, losses, ties, biggest gap).<br>Plural form “one”: exactly 1.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.wins_one` | ☐ | |
| RV-22 | 2 victoires | <span dir="rtl">انتصاران</span> | Rivals season record (wins, losses, ties, biggest gap).<br>Plural form “two”: exactly 2.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.wins_two` | ☐ | |
| RV-23 | {n} victoires | <span dir="rtl">{n} انتصارات</span> | Rivals season record (wins, losses, ties, biggest gap).<br>Plural form “few”: 3 to 10 (also 103, 1003…).<br>Placeholders: `{n}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.wins_few` | ☐ | |
| RV-24 | {n} victoires | <span dir="rtl">{n} انتصارًا</span> | Rivals season record (wins, losses, ties, biggest gap).<br>Plural form “other”: 100 and over (and any case not listed).<br>Placeholders: `{n}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.wins_other` | ☐ | |
| RV-25 | 1 défaite | <span dir="rtl">هزيمة واحدة</span> | Rivals season record (wins, losses, ties, biggest gap).<br>Plural form “one”: exactly 1.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.losses_one` | ☐ | |
| RV-26 | 2 défaites | <span dir="rtl">هزيمتان</span> | Rivals season record (wins, losses, ties, biggest gap).<br>Plural form “two”: exactly 2.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.losses_two` | ☐ | |
| RV-27 | {n} défaites | <span dir="rtl">{n} هزائم</span> | Rivals season record (wins, losses, ties, biggest gap).<br>Plural form “few”: 3 to 10 (also 103, 1003…).<br>Placeholders: `{n}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.losses_few` | ☐ | |
| RV-28 | {n} défaites | <span dir="rtl">{n} هزيمة</span> | Rivals season record (wins, losses, ties, biggest gap).<br>Plural form “other”: 100 and over (and any case not listed).<br>Placeholders: `{n}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.losses_other` | ☐ | |
| RV-29 | 1 nul | <span dir="rtl">تعادل واحد</span> | Rivals season record (wins, losses, ties, biggest gap).<br>Plural form “one”: exactly 1.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.ties_one` | ☐ | |
| RV-30 | 2 nuls | <span dir="rtl">تعادلان</span> | Rivals season record (wins, losses, ties, biggest gap).<br>Plural form “two”: exactly 2.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.ties_two` | ☐ | |
| RV-31 | {n} nuls | <span dir="rtl">{n} تعادلات</span> | Rivals season record (wins, losses, ties, biggest gap).<br>Plural form “few”: 3 to 10 (also 103, 1003…).<br>Placeholders: `{n}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.ties_few` | ☐ | |
| RV-32 | {n} nuls | <span dir="rtl">{n} تعادلًا</span> | Rivals season record (wins, losses, ties, biggest gap).<br>Plural form “other”: 100 and over (and any case not listed).<br>Placeholders: `{n}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.ties_other` | ☐ | |
| RV-33 | Plus grand écart : {margin} (J{n}, {a}–{b}) | <span dir="rtl">أكبر فارق: {margin} (ج{n}، {a}–{b})</span> | Rivals season record (wins, losses, ties, biggest gap).<br>Placeholders: `{margin}` `{n}` `{a}` `{b}`.<br>“ج{n}” = abbreviation of “الجولة”; “{a}–{b}” are two scores.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.big_gap` | ☐ | |
| RV-34 | {name} garde son historique privé. | <span dir="rtl">{name} يحتفظ بسجلّه لنفسه.</span> | Rivals board, what the rival shares.<br>Placeholders: `{name}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.private` | ☐ | |
| RV-35 | {name} partage son historique. | <span dir="rtl">{name} يشارك سجلّه.</span> | Rivals board, what the rival shares.<br>Placeholders: `{name}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.shared` | ☐ | |
| RV-36 | Capitaines J{n} | <span dir="rtl">قادة الجولة {n}</span> | Rivals board, what the rival shares.<br>Placeholders: `{n}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.captains` | ☐ | |
| RV-37 | Transfert de {name} : {player} | <span dir="rtl">انتقال {name}: {player}</span> | Rivals board, what the rival shares.<br>Placeholders: `{name}` `{player}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.transfer` | ☐ | |
| RV-38 | en attente | <span dir="rtl">بانتظار التقييم</span> | Rivals board, waiting state and carousel dot label.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.pending` | ☐ | |
| RV-39 | Partager sur WhatsApp | <span dir="rtl">شارك على واتساب</span> | Rivals poster: WhatsApp share, message and picture description.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.share` | ☐ | |
| RV-40 | Journée {n} : {a} contre {b}. Au total, je mène de {gap} sur {name}. | <span dir="rtl">الجولة {n}: {a} مقابل {b}. في المجموع أتقدّم على {name} بفارق {gap}.</span> | Rivals poster: WhatsApp share, message and picture description.<br>Placeholders: `{n}` `{a}` `{b}` `{name}` `{gap}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.share_msg_lead` | ☐ | |
| RV-41 | Journée {n} : {a} contre {b}. Au total, {name} mène de {gap}. | <span dir="rtl">الجولة {n}: {a} مقابل {b}. في المجموع يتقدّم {name} عليّ بفارق {gap}.</span> | Rivals poster: WhatsApp share, message and picture description.<br>Placeholders: `{n}` `{a}` `{b}` `{name}` `{gap}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.share_msg_trail` | ☐ | |
| RV-42 | Journée {n} : {a} contre {b}. Au total, égalité avec {name}. | <span dir="rtl">الجولة {n}: {a} مقابل {b}. في المجموع نحن متعادلان أنا و{name}.</span> | Rivals poster: WhatsApp share, message and picture description.<br>Placeholders: `{n}` `{a}` `{b}` `{name}`.<br>“نحن متعادلان أنا و{name}”: check the sentence reads naturally.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.share_msg_level` | ☐ | |
| RV-43 | Affiche : {me} contre {name}, journée {n} | <span dir="rtl">ملصق: {me} أمام {name}، الجولة {n}</span> | Rivals poster: WhatsApp share, message and picture description.<br>Placeholders: `{me}` `{name}` `{n}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.img_alt` | ☐ | |
| RV-44 | Ne plus suivre {name} | <span dir="rtl">إلغاء متابعة {name}</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>Placeholders: `{name}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.remove` | ☐ | |
| RV-45 | Me prévenir quand la tête change | <span dir="rtl">نبّهني عندما يتغيّر المتصدّر</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.toggle_t` | ☐ | |
| RV-46 | Après publication, jamais pendant les matchs. | <span dir="rtl">بعد النشر، وليس أثناء المباريات.</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.toggle_d` | ☐ | |
| RV-47 | Vos rivaux ne savent pas que vous les suivez. | <span dir="rtl">منافسوك لا يعرفون أنك تتابعهم.</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.foot_secret` | ☐ | |
| RV-48 | Quitter la ligue retire le rival. | <span dir="rtl">مغادرة الدوري تُزيل المنافس.</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.foot_leave` | ☐ | |
| RV-49 | Un résultat publié peut être corrigé, et la tête avec lui. | <span dir="rtl">قد تُصحَّح النتيجة المنشورة، وتتغيّر الصدارة معها.</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.foot_correct` | ☐ | |
| RV-50 | Les résultats arrivent quand les notes sont publiées, 5 à 16 jours après les matchs. | <span dir="rtl">تصل النتائج عند نشر التقييمات، بعد 5 إلى 16 يومًا من المباريات.</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.foot_live` | ☐ | |
| RV-51 | Trois rivaux au plus : retirez-en un pour en ajouter un autre. | <span dir="rtl">ثلاثة منافسين على الأكثر: أزل واحدًا لإضافة آخر.</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.foot_full` | ☐ | |
| RV-52 | Seuls les managers de vos ligues privées peuvent devenir vos rivaux, jusqu'à 3. | <span dir="rtl">يمكنك اختيار منافسين من دورياتك الخاصة فقط، حتى 3.</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.limit` | ☐ | |
| RV-53 | Vous voyez leurs points journée par journée, comme dans la ligue. Leur capitaine et leurs transferts n'apparaissent que s'ils choisissent de les partager. | <span dir="rtl">ترى نقاطهم جولة بعد جولة كما في الدوري. لا يظهر قائدهم وانتقالاتهم إلا إذا اختاروا مشاركتها.</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.privacy` | ☐ | |
| RV-54 | Ce que vous verrez | <span dir="rtl">ما ستراه</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.see_title` | ☐ | |
| RV-55 | Les journées et le total de chacun de vos rivaux | <span dir="rtl">جولات كل منافس ومجموع نقاطه</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.see_1` | ☐ | |
| RV-56 | Leur capitaine et leurs transferts, s'ils les partagent | <span dir="rtl">قائدهم وانتقالاتهم، إن شاركوها</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.see_2` | ☐ | |
| RV-57 | Une notification quand la tête change, si vous le voulez | <span dir="rtl">تنبيه عندما يتغيّر المتصدّر، إن أردت ذلك</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.see_3` | ☐ | |
| RV-58 | Ajouter un rival | <span dir="rtl">أضف منافسًا</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.add` | ☐ | |
| RV-59 | Choisissez parmi les managers de vos ligues privées. | <span dir="rtl">اختر من مدربي دورياتك الخاصة.</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>Terminology: “مدربي” = managers.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.add_from` | ☐ | |
| RV-60 | Aucun autre manager dans vos ligues privées pour le moment. | <span dir="rtl">لا يوجد مدربون آخرون في دورياتك الخاصة حاليًا.</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.add_none` | ☐ | |
| RV-61 | Ce rival n'a pas pu être ajouté. Réessayez. | <span dir="rtl">تعذّرت إضافة هذا المنافس. حاول مرة أخرى.</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.add_failed` | ☐ | |
| RV-62 | Ajoutez un ami de ligue pour suivre votre duel journée après journée. | <span dir="rtl">أضف صديقًا من دوريك لتتابع مواجهتك معه جولة بعد جولة.</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.empty` | ☐ | |
| RV-63 | Chargement de vos rivaux | <span dir="rtl">جارٍ تحميل منافسيك</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.loading` | ☐ | |
| RV-64 | Vos rivaux ne sont pas disponibles pour le moment. | <span dir="rtl">منافسوك غير متاحين حاليًا.</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.failed` | ☐ | |
| RV-65 | Rival {i} sur {n} | <span dir="rtl">المنافس {i} من {n}</span> | Rivals board, waiting state and carousel dot label.<br>Placeholders: `{i}` `{n}`.<br>Screen-reader label of a carousel dot.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.dot` | ☐ | |
| RV-66 | Sami | <span dir="rtl">سامي</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>Example first name shown in the locked preview only.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.ex_a` | ☐ | |
| RV-67 | Yassine | <span dir="rtl">ياسين</span> | Rivals set-up page: follow, notifications, limits and privacy.<br>Example first name shown in the locked preview only.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.rv.ex_b` | ☐ | |

### BR. BotolaGO+ Deadline briefing

97 strings. Screen: BotolaGO+ briefing.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| BR-01 | Préparez votre équipe avant la date limite, décision par décision | <span dir="rtl">حضّر فريقك قبل آخر أجل، قرارًا بعد قرار</span> | Headline of the BotolaGO+ offer page when the reader arrives from the briefing.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.ctx.briefing` | ☐ | |
| BR-02 | Briefing avant la date limite — BotolaGO Fantasy | <span dir="rtl">إحاطة ما قبل آخر أجل — BotolaGO Fantasy</span> | Briefing page header, browser title and entry card.<br>Latin text inside: BotolaGO, Fantasy.<br>“آخر أجل” vs “الموعد النهائي” used elsewhere.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.meta` | ☐ | |
| BR-03 | Votre briefing avant la date limite : absences listées, remplaçants dans votre budget, capitaine et coût des transferts. | <span dir="rtl">إحاطتك قبل آخر أجل: الغيابات المعلنة، البدلاء ضمن ميزانيتك، القائد وكلفة الانتقالات.</span> | Briefing page header, browser title and entry card.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.meta_description` | ☐ | |
| BR-04 | Briefing avant la date limite | <span dir="rtl">إحاطة ما قبل آخر أجل</span> | Briefing page header, browser title and entry card.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.aria` | ☐ | |
| BR-05 | J{n} | <span dir="rtl">الجولة {n}</span> | Briefing page header, browser title and entry card.<br>Placeholders: `{n}`.<br>French is the abbreviation “J”; Arabic spells “الجولة”.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.gw_short` | ☐ | |
| BR-06 | Tableau {gw} · aujourd’hui {date} | <span dir="rtl">لوحة {gw} · اليوم {date}</span> | Briefing page header, browser title and entry card.<br>Placeholders: `{gw}` `{date}`.<br>Date: written by the app in Morocco time.<br>{gw} is “الجولة 12” style; {date} is written by the app (e.g. “14 أكتوبر”).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.eyebrow` | ☐ | |
| BR-07 | Votre briefing {gw} — date limite {date} à {time} | <span dir="rtl">إحاطة {gw} — آخر أجل {date} على {time}</span> | Briefing page header, browser title and entry card.<br>Placeholders: `{gw}` `{date}` `{time}`.<br>Date: written by the app in Morocco time.<br>Time: Morocco time.<br>Time word: Arabic uses “على” (on) before the time; “في الساعة” (at) may be more natural. Time is Morocco time (UTC+0 since 20 September 2026).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.title` | ☐ | |
| BR-08 | Votre briefing avant la date limite | <span dir="rtl">إحاطتك قبل آخر أجل</span> | Briefing page header, browser title and entry card.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.title_nodate` | ☐ | |
| BR-09 | La date limite est passée. Le briefing revient avec la prochaine journée. | <span dir="rtl">انتهى آخر أجل. تعود الإحاطة مع الجولة المقبلة.</span> | Briefing page header, browser title and entry card.<br>“آخر أجل” = deadline. The Fantasy e-mails and notifications say “الموعد النهائي”. See the special-attention list.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.passed` | ☐ | |
| BR-10 | jours | <span dir="rtl">أيام</span> | Briefing scoreboard: countdown units and four counters.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.unit_days` | ☐ | |
| BR-11 | heures | <span dir="rtl">ساعات</span> | Briefing scoreboard: countdown units and four counters.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.unit_hours` | ☐ | |
| BR-12 | min | <span dir="rtl">دقائق</span> | Briefing scoreboard: countdown units and four counters.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.unit_minutes` | ☐ | |
| BR-13 | Absences confirmées | <span dir="rtl">غيابات مؤكدة</span> | Briefing scoreboard: countdown units and four counters.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cell_absent` | ☐ | |
| BR-14 | Sans information | <span dir="rtl">بلا معلومة</span> | Briefing scoreboard: countdown units and four counters.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cell_noinfo` | ☐ | |
| BR-15 | Transferts gratuits | <span dir="rtl">انتقالات مجانية</span> | Briefing scoreboard: countdown units and four counters.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cell_free` | ☐ | |
| BR-16 | Rang en ligue | <span dir="rtl">الترتيب في الدوري</span> | Briefing scoreboard: countdown units and four counters.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cell_rank` | ☐ | |
| BR-17 | Chargement de votre briefing | <span dir="rtl">جارٍ تحميل إحاطتك</span> | Briefing page states.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.loading` | ☐ | |
| BR-18 | Votre briefing n’est pas disponible pour le moment. | <span dir="rtl">إحاطتك غير متاحة في الوقت الحالي.</span> | Briefing page states.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.failed` | ☐ | |
| BR-19 | Votre briefing apparaît dès que votre équipe est créée et qu’une journée est ouverte aux changements. | <span dir="rtl">تظهر إحاطتك بمجرد إنشاء فريقك وفتح جولة أمام التعديلات.</span> | Briefing page states.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.empty` | ☐ | |
| BR-20 | Créez un compte pour préparer votre équipe | <span dir="rtl">أنشئ حسابًا لتحضير فريقك</span> | Briefing page states.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.guest_cta` | ☐ | |
| BR-21 | Votre briefing avant la date limite | <span dir="rtl">إحاطتك قبل آخر أجل</span> | Briefing page header, browser title and entry card.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.locked_title` | ☐ | |
| BR-22 | Depuis votre visite du {date} | <span dir="rtl">منذ زيارتك يوم {date}</span> | Briefing “what changed since your last visit” ticker.<br>Placeholders: `{date}`.<br>Date: written by the app in Morocco time.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.since` | ☐ | |
| BR-23 | Première visite | <span dir="rtl">الزيارة الأولى</span> | Briefing “what changed since your last visit” ticker.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.since_first` | ☐ | |
| BR-24 | sur cet appareil | <span dir="rtl">على هذا الجهاز</span> | Briefing “what changed since your last visit” ticker.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.device` | ☐ | |
| BR-25 | Mettre le défilement en pause | <span dir="rtl">إيقاف التمرير مؤقتًا</span> | Briefing “what changed since your last visit” ticker.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.ticker_pause` | ☐ | |
| BR-26 | Reprendre le défilement | <span dir="rtl">استئناف التمرير</span> | Briefing “what changed since your last visit” ticker.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.ticker_play` | ☐ | |
| BR-27 | Nous noterons ici ce qui change d’une visite à l’autre. | <span dir="rtl">سنسجّل هنا ما يتغيّر من زيارة إلى أخرى.</span> | Briefing “what changed since your last visit” ticker.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.chg_first` | ☐ | |
| BR-28 | Rien de nouveau depuis votre dernière visite. | <span dir="rtl">لا جديد منذ زيارتك الأخيرة.</span> | Briefing “what changed since your last visit” ticker.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.chg_none` | ☐ | |
| BR-29 | {gw} publiée le {date} · joueurs notés : {rated} · en attente : {waiting} | <span dir="rtl">نُشرت {gw} يوم {date} · لاعبون مقيَّمون: {rated} · بانتظار التقييم: {waiting}</span> | Briefing “what changed since your last visit” ticker.<br>Placeholders: `{gw}` `{date}` `{rated}` `{waiting}`.<br>Date: written by the app in Morocco time.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.chg_published` | ☐ | |
| BR-30 | Ajouté aux absents : {names} | <span dir="rtl">أُضيف إلى الغائبين: {names}</span> | Briefing “what changed since your last visit” ticker.<br>Placeholders: `{names}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.chg_absent` | ☐ | |
| BR-31 | Dépassé par {names} · votre rang : {rank} sur {size} | <span dir="rtl">تجاوزك {names} · ترتيبك: {rank} من {size}</span> | Briefing “what changed since your last visit” ticker.<br>Placeholders: `{names}` `{rank}` `{size}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.chg_overtaken` | ☐ | |
| BR-32 | Votre rang passe de {from} à {rank} sur {size} | <span dir="rtl">ترتيبك انتقل من {from} إلى {rank} من {size}</span> | Briefing “what changed since your last visit” ticker.<br>Placeholders: `{from}` `{rank}` `{size}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.chg_rank` | ☐ | |
| BR-33 | Les quatre décisions | <span dir="rtl">القرارات الأربعة</span> | Briefing pager (four decision cards).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.pager_aria` | ☐ | |
| BR-34 | Absences | <span dir="rtl">الغيابات</span> | Briefing pager (four decision cards).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.tab_absences` | ☐ | |
| BR-35 | Remplacer | <span dir="rtl">تعويض</span> | Briefing pager (four decision cards).<br>French “Remplacer” (replace a player). Arabic “تعويض” usually means compensation; check it reads as “replace”.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.tab_replace` | ☐ | |
| BR-36 | Capitaine | <span dir="rtl">القائد</span> | Briefing pager (four decision cards).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.tab_captain` | ☐ | |
| BR-37 | Transferts | <span dir="rtl">الانتقالات</span> | Briefing pager (four decision cards).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.tab_transfers` | ☐ | |
| BR-38 | Carte {n}/4 | <span dir="rtl">البطاقة {n}/4</span> | Briefing pager (four decision cards).<br>Placeholders: `{n}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.card_of` | ☐ | |
| BR-39 | Vos {n} joueurs · absences confirmées : {a} | <span dir="rtl">لاعبوك الـ{n} · غيابات مؤكدة: {a}</span> | Briefing card 1: absences.<br>Placeholders: `{n}` `{a}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.abs_title` | ☐ | |
| BR-40 | Absent · blessure | <span dir="rtl">غائب · إصابة</span> | Briefing card 1: absences.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.abs_injury` | ☐ | |
| BR-41 | absent | <span dir="rtl">غائب</span> | Briefing card 1: absences.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.abs_injury_short` | ☐ | |
| BR-42 | Absent · suspension | <span dir="rtl">غائب · إيقاف</span> | Briefing card 1: absences.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.abs_suspension` | ☐ | |
| BR-43 | liste du fournisseur, {date} | <span dir="rtl">قائمة مزوّد البيانات، {date}</span> | Briefing card 1: absences.<br>Placeholders: `{date}`.<br>Date: written by the app in Morocco time.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.abs_source` | ☐ | |
| BR-44 | retour prévu le {date} | <span dir="rtl">العودة المتوقعة يوم {date}</span> | Briefing card 1: absences.<br>Placeholders: `{date}`.<br>Date: written by the app in Morocco time.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.abs_return` | ☐ | |
| BR-45 | Aucune information confirmée · {n} min en {gw} | <span dir="rtl">لا معلومة مؤكدة · {n} دقيقة في {gw}</span> | Briefing card 1: absences.<br>Placeholders: `{n}` `{gw}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.abs_noinfo` | ☐ | |
| BR-46 | Le fournisseur ne liste aucune absence dans votre équipe. | <span dir="rtl">لا يعلن مزوّد البيانات أي غياب في فريقك.</span> | Briefing card 1: absences.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.abs_none_listed` | ☐ | |
| BR-47 | Aucune liste d’absences n’est disponible pour le moment. Nous n’en inventons pas. | <span dir="rtl">لا توجد قائمة غيابات متاحة حاليًا. نحن لا نخترع قائمة.</span> | Briefing card 1: absences.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.abs_no_feed` | ☐ | |
| BR-48 | Autres joueurs ({n}) | <span dir="rtl">لاعبون آخرون ({n})</span> | Briefing card 1: absences.<br>Placeholders: `{n}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.abs_others` | ☐ | |
| BR-49 | aucune absence signalée | <span dir="rtl">لا غياب معلن</span> | Briefing card 1: absences.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.abs_others_ok` | ☐ | |
| BR-50 | pas de liste d’absences disponible | <span dir="rtl">لا توجد قائمة غيابات</span> | Briefing card 1: absences.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.abs_others_nofeed` | ☐ | |
| BR-51 | Seules les absences listées par notre fournisseur apparaissent ici ; aucune information ne veut pas dire disponible. | <span dir="rtl">تظهر هنا فقط الغيابات التي يعلنها مزوّد بياناتنا؛ غياب المعلومة لا يعني أن اللاعب جاهز.</span> | Briefing card 1: absences.<br>Disclaimer: no information does not mean the player is available.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.abs_honest` | ☐ | |
| BR-52 | Notre fournisseur n’a listé aucune absence pour cette journée. Aucune information ne veut pas dire disponible : seuls les minutes jouées et les points publiés sont des faits. | <span dir="rtl">لم يعلن مزوّد بياناتنا أي غياب لهذه الجولة. غياب المعلومة لا يعني أن اللاعب جاهز: الحقائق الوحيدة هي الدقائق التي لُعبت والنقاط المنشورة.</span> | Briefing card 1: absences.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.abs_honest_nofeed` | ☐ | |
| BR-53 | Remplacer {name} | <span dir="rtl">تعويض {name}</span> | Briefing card 2: replace a player.<br>Placeholders: `{name}`.<br>“تعويض {name}”: see the line above.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.swap_title` | ☐ | |
| BR-54 | Joueur à remplacer | <span dir="rtl">اللاعب المراد تعويضه</span> | Briefing card 2: replace a player.<br>“المراد تعويضه”: same word.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.swap_pick` | ☐ | |
| BR-55 | Budget : {sale} {unit} à la vente + {bank} {unit} en banque = {max} {unit} | <span dir="rtl">الميزانية: {sale} {unit} عند البيع + {bank} {unit} في الرصيد = {max} {unit}</span> | Briefing card 2: replace a player.<br>Placeholders: `{sale}` `{unit}` `{bank}` `{max}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.swap_budget` | ☐ | |
| BR-56 | Joueurs que vous pouvez vous offrir | <span dir="rtl">لاعبون يمكنك شراؤهم</span> | Briefing card 2: replace a player.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.swap_list` | ☐ | |
| BR-57 | Aucun joueur de ce poste dans votre budget et la limite par club. | <span dir="rtl">لا يوجد لاعب في هذا المركز ضمن ميزانيتك وحد النادي.</span> | Briefing card 2: replace a player.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.swap_none` | ☐ | |
| BR-58 | : la note n’est pas publiée, aucun chiffre n’est affiché. Les points passés ne prédisent pas la prochaine journée. | <span dir="rtl">: التقييم غير منشور، ولا يُعرض أي رقم. النقاط السابقة لا تتنبأ بالجولة المقبلة.</span> | Briefing card 2: replace a player.<br>Starts with a colon on purpose: it is appended after a player name.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.swap_footnote` | ☐ | |
| BR-59 | Préparer ce transfert | <span dir="rtl">حضّر هذا الانتقال</span> | Briefing card 2: replace a player.<br>Button text.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.swap_cta` | ☐ | |
| BR-60 | club {k}/{n} après le transfert | <span dir="rtl">النادي {k}/{n} بعد الانتقال</span> | Briefing card 2: replace a player.<br>Placeholders: `{k}` `{n}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.club_after` | ☐ | |
| BR-61 | Ce transfert serait gratuit | <span dir="rtl">هذا الانتقال سيكون مجانيًا</span> | Briefing card 2: replace a player.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cost_first_free` | ☐ | |
| BR-62 | Ce transfert coûte {pts} | <span dir="rtl">يكلّفك هذا الانتقال {pts}</span> | Briefing card 2: replace a player.<br>Placeholders: `{pts}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cost_first_paid` | ☐ | |
| BR-63 | Un 2e transfert : −{pts} sur {gw} | <span dir="rtl">انتقال ثانٍ: −{pts} في {gw}</span> | Briefing card 2: replace a player.<br>Placeholders: `{pts}` `{gw}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cost_second` | ☐ | |
| BR-64 | {gw} publiée le {date} | <span dir="rtl">نُشرت {gw} يوم {date}</span> | Briefing card 2: replace a player.<br>Placeholders: `{gw}` `{date}`.<br>Date: written by the app in Morocco time.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.stamp_published` | ☐ | |
| BR-65 | {gw} le {date} (partielle) | <span dir="rtl">{gw} يوم {date} (جزئية)</span> | Briefing card 2: replace a player.<br>Placeholders: `{gw}` `{date}`.<br>Date: written by the app in Morocco time.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.stamp_partial` | ☐ | |
| BR-66 | {gw} en attente | <span dir="rtl">{gw} بانتظار التقييم</span> | Briefing card 2: replace a player.<br>Placeholders: `{gw}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.stamp_pending` | ☐ | |
| BR-67 | en attente | <span dir="rtl">بانتظار التقييم</span> | Briefing card 2: replace a player.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.pending` | ☐ | |
| BR-68 | sans note | <span dir="rtl">دون تقييم</span> | Briefing card 2: replace a player.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.no_rating` | ☐ | |
| BR-69 | Ouvre votre écran Transferts ; rien n’est enregistré ici. | <span dir="rtl">يفتح شاشة الانتقالات؛ لا يُحفظ شيء هنا.</span> | Briefing card 2: replace a player.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.opens_transfers` | ☐ | |
| BR-70 | Ouvre votre écran Équipe ; rien n’est enregistré ici. | <span dir="rtl">يفتح شاشة فريقك؛ لا يُحفظ شيء هنا.</span> | Briefing card 2: replace a player.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.opens_team` | ☐ | |
| BR-71 | Capitaine {gw} : comparez sur les journées publiées | <span dir="rtl">قائد {gw}: قارن على الجولات المنشورة</span> | Briefing card 3: captain.<br>Placeholders: `{gw}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cap_title` | ☐ | |
| BR-72 | Le capitaine multiplie ses points par {m} sur {gw} | <span dir="rtl">يضاعف القائد نقاطه ×{m} في {gw}</span> | Briefing card 3: captain.<br>Placeholders: `{m}` `{gw}`.<br>“×{m}” multiplication sign.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cap_x2` | ☐ | |
| BR-73 | Candidats au brassard | <span dir="rtl">المرشحون للقيادة</span> | Briefing card 3: captain.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cap_list` | ☐ | |
| BR-74 | total publié · {k}/{n} journées | <span dir="rtl">المجموع المنشور · {k}/{n} جولات</span> | Briefing card 3: captain.<br>Placeholders: `{k}` `{n}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cap_total` | ☐ | |
| BR-75 | Capitaine actuel | <span dir="rtl">القائد الحالي</span> | Briefing card 3: captain.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cap_current` | ☐ | |
| BR-76 | Vice-capitaine actuel | <span dir="rtl">نائب القائد الحالي</span> | Briefing card 3: captain.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cap_vice` | ☐ | |
| BR-77 | {gw} · contre {club} | <span dir="rtl">{gw} · ضد {club}</span> | Briefing card 3: captain.<br>Placeholders: `{gw}` `{club}`.<br>Opponent club name inserted (Arabic or Latin).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cap_vs` | ☐ | |
| BR-78 | Difficulté {d}/5 | <span dir="rtl">الصعوبة {d}/5</span> | Briefing card 3: captain.<br>Placeholders: `{d}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cap_diff` | ☐ | |
| BR-79 | Prochain adversaire indisponible | <span dir="rtl">الخصم المقبل غير متاح</span> | Briefing card 3: captain.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cap_nofixture` | ☐ | |
| BR-80 | Aucun titulaire disponible à comparer. | <span dir="rtl">لا يوجد أساسي متاح للمقارنة.</span> | Briefing card 3: captain.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cap_none` | ☐ | |
| BR-81 | Les points passés ne prédisent pas la prochaine journée · difficulté estimée par BotolaGO. | <span dir="rtl">النقاط السابقة لا تتنبأ بالجولة المقبلة · الصعوبة تقدير من BotolaGO.</span> | Briefing card 3: captain.<br>Latin text inside: BotolaGO.<br>“Les points passés ne prédisent pas la prochaine journée”: disclaimer; check tone.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cap_honest` | ☐ | |
| BR-82 | Choisir mon capitaine | <span dir="rtl">اختر قائدك</span> | Briefing card 3: captain.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cap_cta` | ☐ | |
| BR-83 | à domicile | <span dir="rtl">على أرضه</span> | Briefing card 3: captain.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.home` | ☐ | |
| BR-84 | à l’extérieur | <span dir="rtl">خارج أرضه</span> | Briefing card 3: captain.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.away` | ☐ | |
| BR-85 | estimation · confiance élevée | <span dir="rtl">تقدير · ثقة عالية</span> | Briefing card 3: captain.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.conf_high` | ☐ | |
| BR-86 | estimation · confiance moyenne | <span dir="rtl">تقدير · ثقة متوسطة</span> | Briefing card 3: captain.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.conf_medium` | ☐ | |
| BR-87 | estimation · confiance faible | <span dir="rtl">تقدير · ثقة ضعيفة</span> | Briefing card 3: captain.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.conf_low` | ☐ | |
| BR-88 | Transferts avant {gw} | <span dir="rtl">الانتقالات قبل {gw}</span> | Briefing card 4: transfers.<br>Placeholders: `{gw}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.tr_title` | ☐ | |
| BR-89 | M en banque | <span dir="rtl">م في الرصيد</span> | Briefing card 4: transfers.<br>“م” = M (millions). Same abbreviation as in transfer budget messages.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.tr_bank` | ☐ | |
| BR-90 | 1 transfert | <span dir="rtl">انتقال واحد</span> | Briefing card 4: transfers.<br>Plural form “one”: exactly 1.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.tr_one` | ☐ | |
| BR-91 | 2 transferts | <span dir="rtl">انتقالان</span> | Briefing card 4: transfers.<br>Plural form “two”: exactly 2.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.tr_two` | ☐ | |
| BR-92 | {n} transferts | <span dir="rtl">{n} انتقالات</span> | Briefing card 4: transfers.<br>Plural form “many”: 11 to 99 (also 111…).<br>Placeholders: `{n}`.<br>Fixed plural “انتقالات” for 3 or more.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.tr_many` | ☐ | |
| BR-93 | gratuit | <span dir="rtl">مجاني</span> | Briefing card 2: replace a player.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.cost_free` | ☐ | |
| BR-94 | Chaque transfert au-delà des transferts gratuits retire des points à votre score de {gw}. Wildcard et Free Hit n’en retirent aucun. | <span dir="rtl">كل انتقال يتجاوز الانتقالات المجانية يخصم نقاطًا من مجموعك في {gw}. لا تخصم Wildcard ولا Free Hit أي نقطة.</span> | Briefing card 4: transfers.<br>Placeholders: `{gw}`.<br>Latin text inside: Wildcard, Free, Hit.<br>Latin chip names Wildcard and Free Hit inside the Arabic line; elsewhere the approved Arabic chip names are used (الورقة الحرة, الضربة الحرة). Decide which to show here.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.tr_honest` | ☐ | |
| BR-95 | Ouvrir les transferts | <span dir="rtl">افتح الانتقالات</span> | Briefing card 4: transfers.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.tr_cta` | ☐ | |
| BR-96 | Votre briefing J{gw} | <span dir="rtl">إحاطتك للجولة {gw}</span> | Briefing page header, browser title and entry card.<br>Placeholders: `{gw}`.<br>French uses “J{gw}”; Arabic writes “الجولة {gw}”.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.entry_title` | ☐ | |
| BR-97 | Absences, remplaçants, capitaine et transferts | <span dir="rtl">الغيابات، البدلاء، القائد والانتقالات</span> | Briefing page header, browser title and entry card.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.brief.entry_sub` | ☐ | |

### TR. BotolaGO+ Trophies (“Trophées”) and card frames

86 strings. Screen: BotolaGO+ trophies.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| TR-01 | Saison {season} · après la journée {n} | <span dir="rtl">موسم {season} · بعد الجولة {n}</span> | Trophy cabinet header and families.<br>Placeholders: `{season}` `{n}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.kicker` | ☐ | |
| TR-02 | Saison {season} | <span dir="rtl">موسم {season}</span> | Trophy cabinet header and families.<br>Placeholders: `{season}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.kicker_season` | ☐ | |
| TR-03 | {name} : 1 trophée cette saison | <span dir="rtl">{name}: كأس واحدة هذا الموسم</span> | Trophy cabinet header and families.<br>Plural form “one”: exactly 1.<br>Placeholders: `{name}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.headline_one` | ☐ | |
| TR-04 | {name} : {n} trophées cette saison | <span dir="rtl">{name}: {n} من الكؤوس هذا الموسم</span> | Trophy cabinet header and families.<br>Plural form “many”: 11 to 99 (also 111…).<br>Placeholders: `{name}` `{n}`.<br>Count word avoided on purpose: “{n} من الكؤوس” (n of the trophies) so it works for any n.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.headline_many` | ☐ | |
| TR-05 | {name}, votre vitrine attend son premier trophée | <span dir="rtl">{name}، خزانتك تنتظر كأسها الأولى</span> | Trophy cabinet header and families.<br>Placeholders: `{name}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.headline_none` | ☐ | |
| TR-06 | , {p} en attente de publication | <span dir="rtl">، و{p} بانتظار النشر</span> | Trophy cabinet header and families.<br>Placeholders: `{p}`.<br>Begins with the Arabic comma and “و”; it is appended to the sentence before.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.headline_pending` | ☐ | |
| TR-07 | Paliers | <span dir="rtl">المستويات</span> | Trophy cabinet header and families.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.fam_paliers` | ☐ | |
| TR-08 | Journées | <span dir="rtl">الجولات</span> | Trophy cabinet header and families.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.fam_journees` | ☐ | |
| TR-09 | Décisions | <span dir="rtl">القرارات</span> | Trophy cabinet header and families.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.fam_decisions` | ☐ | |
| TR-10 | Ligue | <span dir="rtl">الدوري</span> | Trophy cabinet header and families.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.fam_ligue` | ☐ | |
| TR-11 | Carte | <span dir="rtl">البطاقة</span> | Trophy cabinet header and families.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.fam_carte` | ☐ | |
| TR-12 | {a} sur {b} | <span dir="rtl">{a} من {b}</span> | Trophy cabinet header and families.<br>Placeholders: `{a}` `{b}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.of` | ☐ | |
| TR-13 | J{n} | <span dir="rtl">ج{n}</span> | Trophy cabinet header and families.<br>Placeholders: `{n}`.<br>Abbreviation “ج” for “الجولة”.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.gw` | ☐ | |
| TR-14 | Journée {n} | <span dir="rtl">الجولة {n}</span> | Trophy cabinet header and families.<br>Placeholders: `{n}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.gw_long` | ☐ | |
| TR-15 | Publié le {date} | <span dir="rtl">نُشر في {date}</span> | Trophy cabinet header and families.<br>Placeholders: `{date}`.<br>Date: written by the app in Morocco time.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.published` | ☐ | |
| TR-16 | en attente | <span dir="rtl">بانتظار التقييم</span> | Trophy cabinet header and families.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.pending` | ☐ | |
| TR-17 | Les notes de la journée {n} ne sont pas encore toutes publiées. | <span dir="rtl">لم تُنشر بعد كل تقييمات الجولة {n}.</span> | Trophy cabinet header and families.<br>Placeholders: `{n}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.pending_why` | ☐ | |
| TR-18 | Nouveau | <span dir="rtl">جديد</span> | Trophy cabinet header and families.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.new` | ☐ | |
| TR-19 | note | <span dir="rtl">تقييم</span> | Trophy cabinet, tier progress and units.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.unit_rating` | ☐ | |
| TR-20 | pts | <span dir="rtl">نقطة</span> | Trophy cabinet, tier progress and units.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.unit_pts` | ☐ | |
| TR-21 | journées | <span dir="rtl">جولات</span> | Trophy cabinet, tier progress and units.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.unit_gameweeks` | ☐ | |
| TR-22 | sur {n} | <span dir="rtl">من {n}</span> | Trophy cabinet, tier progress and units.<br>Placeholders: `{n}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.rank_of` | ☐ | |
| TR-23 | {n}e | <span dir="rtl">المركز {n}</span> | Trophy cabinet, tier progress and units.<br>Placeholders: `{n}`.<br>French “{n}e”; Arabic “المركز {n}”.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.rank_nth` | ☐ | |
| TR-24 | 1er | <span dir="rtl">المركز 1</span> | Trophy cabinet, tier progress and units.<br>French “1er”; Arabic “المركز 1”.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.rank_first` | ☐ | |
| TR-25 | Cohorte fondatrice | <span dir="rtl">الدفعة المؤسِّسة</span> | Trophy cabinet, tier progress and units.<br>French “Cohorte fondatrice” (founding group).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.cohort` | ☐ | |
| TR-26 | Pas encore | <span dir="rtl">ليس بعد</span> | Trophy cabinet, tier progress and units.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.not_yet` | ☐ | |
| TR-27 | {have} sur {need} | <span dir="rtl">{have} من {need}</span> | Trophy cabinet, tier progress and units.<br>Placeholders: `{have}` `{need}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.prog_gameweeks` | ☐ | |
| TR-28 | Note {need} requise, la vôtre {have} | <span dir="rtl">يلزم تقييم {need}، تقييمك {have}</span> | Trophy cabinet, tier progress and units.<br>Placeholders: `{need}` `{have}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.prog_rating` | ☐ | |
| TR-29 | Note {need} requise, vous êtes sans note | <span dir="rtl">يلزم تقييم {need}، وأنت بلا تقييم</span> | Trophy cabinet, tier progress and units.<br>Placeholders: `{need}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.prog_rating_none` | ☐ | |
| TR-30 | Meilleure : {have} sur {need} pts | <span dir="rtl">الأفضل: {have} من {need} نقطة</span> | Trophy cabinet, tier progress and units.<br>Placeholders: `{have}` `{need}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.prog_points` | ☐ | |
| TR-31 | {need} pts requis | <span dir="rtl">يلزم {need} نقطة</span> | Trophy cabinet, tier progress and units.<br>Placeholders: `{need}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.prog_points_none` | ☐ | |
| TR-32 | Les trophées se gagnent en jouant, jamais en payant. Ils comptent une fois les notes publiées, 5 à 16 jours après le match. | <span dir="rtl">تُكسب الكؤوس باللعب، لا بالدفع أبدًا. تُحتسب بعد نشر التقييمات، من 5 إلى 16 يومًا بعد المباراة.</span> | Trophy cabinet, rules footnotes.<br>BotolaGO+ Saison (#502) (also #494) · `plus.tr.rule` | ☐ | |
| TR-33 | Un palier peut baisser ; « Premier passage STADE » reste acquis. | <span dir="rtl">قد ينخفض المستوى، لكن «أول مرة في مستوى ملعب» تبقى لك.</span> | Trophy cabinet, rules footnotes.<br>Tier names follow the Manager Card: ملعب / محترف / بطل / أسطورة (STADE / PRO / CHAMPION / LEGEND).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.rule_tier` | ☐ | |
| TR-34 | Un résultat corrigé ne retire jamais un trophée. | <span dir="rtl">النتيجة المصحَّحة لا تسحب كأسًا أبدًا.</span> | Trophy cabinet, rules footnotes.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.rule_kept` | ☐ | |
| TR-35 | Fondateur 2026 appartient à la cohorte fondatrice seulement. | <span dir="rtl">كأس مؤسس 2026 للدفعة المؤسِّسة فقط.</span> | Trophy cabinet, rules footnotes.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.rule_founder` | ☐ | |
| TR-36 | Ni argent ni lot : un trophée ne se convertit en rien. | <span dir="rtl">لا مال ولا هدايا: الكأس لا تُحوَّل إلى أي شيء.</span> | Trophy cabinet, rules footnotes.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.rule_nomoney` | ☐ | |
| TR-37 | Partager | <span dir="rtl">شارك</span> | Trophy detail and share.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.share` | ☐ | |
| TR-38 | Choisir un cadre | <span dir="rtl">اختر إطارًا</span> | Trophy detail and share.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.frame_pick` | ☐ | |
| TR-39 | Votre vitrine est vide pour l’instant. Les trophées arrivent avec vos premiers résultats publiés. | <span dir="rtl">خزانتك فارغة حاليًا. تصل الكؤوس مع أولى نتائجك المنشورة.</span> | Trophy cabinet states and locked preview.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.empty` | ☐ | |
| TR-40 | Chargement de vos trophées | <span dir="rtl">جارٍ تحميل كؤوسك</span> | Trophy cabinet states and locked preview.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.loading` | ☐ | |
| TR-41 | Vos trophées ne sont pas disponibles pour le moment. | <span dir="rtl">كؤوسك غير متاحة في الوقت الحالي.</span> | Trophy cabinet states and locked preview.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.failed` | ☐ | |
| TR-42 | Votre vitrine de trophées | <span dir="rtl">خزانة كؤوسك</span> | Trophy cabinet states and locked preview.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.locked_headline` | ☐ | |
| TR-43 | Avec la Saison | <span dir="rtl">مع الموسم</span> | Trophy cabinet states and locked preview.<br>BotolaGO+ Saison (#502) (also #494) · `plus.tr.locked_tag` | ☐ | |
| TR-44 | Trophées | <span dir="rtl">الكؤوس</span> | Trophy detail and share.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.back` | ☐ | |
| TR-45 | 1 de vos {n} trophées cette saison | <span dir="rtl">كأس من كؤوسك الـ {n} هذا الموسم</span> | Trophy detail and share.<br>Placeholders: `{n}`.<br>Says “one of your N trophies”.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.detail_of` | ☐ | |
| TR-46 | Trophée · saison {season} | <span dir="rtl">كأس · موسم {season}</span> | Trophy detail and share.<br>Placeholders: `{season}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.detail_kicker` | ☐ | |
| TR-47 | {label} : {what} | <span dir="rtl">كأس {label}: {what}</span> | Trophy detail and share.<br>Placeholders: `{label}` `{what}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.detail_headline` | ☐ | |
| TR-48 | {label}, journée {n} | <span dir="rtl">{label}، الجولة {n}</span> | Trophy detail and share.<br>Placeholders: `{label}` `{n}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.detail_headline_plain` | ☐ | |
| TR-49 | Un résultat corrigé ne retire jamais ce trophée. | <span dir="rtl">النتيجة المصحَّحة لا تسحب هذه الكأس أبدًا.</span> | Trophy detail and share.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.detail_note` | ☐ | |
| TR-50 | Image standard et WhatsApp : gratuits | <span dir="rtl">الصورة العادية وواتساب: مجانًا</span> | Trophy detail and share.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.detail_free` | ☐ | |
| TR-51 | Standard | <span dir="rtl">عادي</span> | Trophy detail and share.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.chip_standard` | ☐ | |
| TR-52 | Cadre {name} | <span dir="rtl">إطار {name}</span> | Trophy detail and share.<br>Placeholders: `{name}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.chip_framed` | ☐ | |
| TR-53 | Format 4:5 | <span dir="rtl">صيغة 4:5</span> | Trophy detail and share.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.chip_post` | ☐ | |
| TR-54 | Format story | <span dir="rtl">صيغة ستوري</span> | Trophy detail and share.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.chip_story` | ☐ | |
| TR-55 | Avec votre cadre | <span dir="rtl">مع إطارك</span> | Trophy detail and share.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.with_frame` | ☐ | |
| TR-56 | Trophée {label} | <span dir="rtl">كأس {label}</span> | Trophy detail and share.<br>Placeholders: `{label}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.share_alt` | ☐ | |
| TR-57 | Mon trophée « {label} » sur BotolaGO, Fantasy Botola Pro. | <span dir="rtl">كأسي «{label}» على بوطولا جو، فانتازي البطولة الاحترافية.</span> | Trophy detail and share.<br>Placeholders: `{label}`.<br>Brand written “بوطولا جو” (two words). The recap uses “بوطولاجو”. Pick one spelling or keep BotolaGO in Latin.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.share_message` | ☐ | |
| TR-58 | botolago.com · Fantasy Botola Pro | <span dir="rtl">botolago.com · فانتازي البطولة الاحترافية</span> | Trophy detail and share.<br>Latin text inside: botolago.com.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.share_footer` | ☐ | |
| TR-59 | Choisissez le cadre de votre carte parmi vos {n} cadres gagnés | <span dir="rtl">اختر إطار بطاقتك من بين {n} أُطر ربحتها</span> | Card frame picker.<br>Placeholders: `{n}`.<br>Counted word is in a fixed form for every number (see “Counts” above).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.frames_title` | ☐ | |
| TR-60 | Choisissez le cadre de votre carte : un cadre gagné | <span dir="rtl">اختر إطار بطاقتك: إطار واحد ربحته</span> | Card frame picker.<br>Plural form “one”: exactly 1.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.frames_title_one` | ☐ | |
| TR-61 | Toujours | <span dir="rtl">دائمًا</span> | Card frame picker.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.frame_standard_sub` | ☐ | |
| TR-62 | Choisi | <span dir="rtl">مختار</span> | Card frame picker.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.frame_chosen` | ☐ | |
| TR-63 | Publié le {date} | <span dir="rtl">نُشر في {date}</span> | Card frame picker.<br>Placeholders: `{date}`.<br>Date: written by the app in Morocco time.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.frame_earned` | ☐ | |
| TR-64 | À gagner | <span dir="rtl">للكسب</span> | Card frame picker.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.to_earn` | ☐ | |
| TR-65 | Votre cadre se voit partout où votre carte apparaît. Sans la Saison, la carte reprend le cadre standard ; vos trophées restent. | <span dir="rtl">يظهر إطارك أينما ظهرت بطاقتك. من دون الموسم تعود البطاقة إلى الإطار العادي، وتبقى كؤوسك.</span> | Card frame picker.<br>BotolaGO+ Saison (#502) (also #494) · `plus.tr.frames_note` | ☐ | |
| TR-66 | Les cadres se gagnent en jouant ; aucun ne s’achète. | <span dir="rtl">تُكسب الأُطر باللعب، ولا يُشترى أيٌّ منها.</span> | Card frame picker.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.frames_free` | ☐ | |
| TR-67 | Enregistrer | <span dir="rtl">حفظ</span> | Card frame picker.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.save` | ☐ | |
| TR-68 | Cadre enregistré | <span dir="rtl">تم حفظ الإطار</span> | Card frame picker.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.saved` | ☐ | |
| TR-69 | Le cadre n’a pas pu être enregistré. Réessayez. | <span dir="rtl">تعذّر حفظ الإطار. حاول مرة أخرى.</span> | Card frame picker.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.save_failed` | ☐ | |
| TR-70 | Vos {n} cadres vous attendent | <span dir="rtl">أُطرك الـ {n} بانتظارك</span> | Card frame picker.<br>Placeholders: `{n}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.frames_locked` | ☐ | |
| TR-71 | Cadre de la carte | <span dir="rtl">إطار البطاقة</span> | Card frame picker.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.frames_sheet` | ☐ | |
| TR-72 | note | <span dir="rtl">تقييم</span> | Card frame preview.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.card_note` | ☐ | |
| TR-73 | en cours | <span dir="rtl">قيد التقدّم</span> | Trophy cabinet, tier progress and units.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.in_progress` | ☐ | |
| TR-74 | {rank} pour l’instant. Attribué à la fin de la saison. | <span dir="rtl">{rank} حاليًا. تُمنح في نهاية الموسم.</span> | Trophy cabinet, tier progress and units.<br>Placeholders: `{rank}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.prog_rank` | ☐ | |
| TR-75 | Attribué à la fin de la saison, dans une ligue privée de 3 managers ou plus. | <span dir="rtl">تُمنح في نهاية الموسم، في دوري خاص يضم 3 مدراء أو أكثر.</span> | Trophy cabinet, tier progress and units.<br>Uses “مدراء” (managers). Other screens say “مدربين”. See the special-attention list.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.prog_rank_none` | ☐ | |
| TR-76 | Podium et champion de ligue : attribués à la fin de la saison, d’après le classement final. | <span dir="rtl">منصة الدوري وبطله: يُمنحان في نهاية الموسم، بحسب الترتيب النهائي.</span> | Trophy cabinet, rules footnotes.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.rule_season_end` | ☐ | |
| TR-77 | Montrer mes trophées | <span dir="rtl">إظهار كؤوسي</span> | Trophy visibility switch (who sees my trophies).<br>Switch label.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.vis_label` | ☐ | |
| TR-78 | Les managers de vos ligues privées voient les trophées que vous avez gagnés, jamais vos points, vos notes ni vos paliers. Personne d’autre. | <span dir="rtl">يرى مدراء دورياتك الخاصة الكؤوس التي ربحتها، وليس نقاطك أو تقييماتك أو مستوياتك. ولا أحد غيرهم.</span> | Trophy visibility switch (who sees my trophies).<br>Privacy promise: only trophies are shown, never points, ratings or tiers.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.vis_hint` | ☐ | |
| TR-79 | Vos trophées sont visibles dans vos ligues privées. | <span dir="rtl">كؤوسك ظاهرة في دورياتك الخاصة.</span> | Trophy visibility switch (who sees my trophies).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.vis_on` | ☐ | |
| TR-80 | Vos trophées sont masqués. | <span dir="rtl">كؤوسك مخفية.</span> | Trophy visibility switch (who sees my trophies).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.vis_off` | ☐ | |
| TR-81 | Le réglage n’a pas pu être enregistré. Réessayez. | <span dir="rtl">تعذّر حفظ الإعداد. حاول مرة أخرى.</span> | Trophy visibility switch (who sees my trophies).<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.vis_failed` | ☐ | |
| TR-82 | {name} : {n} trophées, voir | <span dir="rtl">{name}: {n} من الكؤوس، عرض</span> | A league mate’s trophies.<br>Placeholders: `{name}` `{n}`.<br>Count avoided on purpose: “{n} من الكؤوس”.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.mate_chip` | ☐ | |
| TR-83 | {name} : 1 trophée, voir | <span dir="rtl">{name}: كأس واحدة، عرض</span> | A league mate’s trophies.<br>Plural form “one”: exactly 1.<br>Placeholders: `{name}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.mate_chip_one` | ☐ | |
| TR-84 | Trophées de {name} | <span dir="rtl">كؤوس {name}</span> | A league mate’s trophies.<br>Placeholders: `{name}`.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.mate_title` | ☐ | |
| TR-85 | Cette saison, dans votre ligue privée | <span dir="rtl">هذا الموسم، في دوريك الخاص</span> | A league mate’s trophies.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.mate_sub` | ☐ | |
| TR-86 | Seuls les trophées gagnés sont montrés, jamais les points, les notes ni les paliers. | <span dir="rtl">تظهر الكؤوس المربوحة فقط، وليس النقاط ولا التقييمات ولا المستويات.</span> | A league mate’s trophies.<br>BotolaGO+ rivals/briefing/trophies (#494) · `plus.tr.mate_note` | ☐ | |

### SE. BotolaGO+ Saison: offer, payment, terms, “Ma saison”

55 strings. Screen: BotolaGO+ season.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| SE-01 | Saison BotolaGO+ | <span dir="rtl">موسم BotolaGO+</span> | BotolaGO+ offer page.<br>Latin text inside: BotolaGO+.<br>Was: <span dir="rtl">اشتراكك في BotolaGO+</span><br>Product name: “موسم BotolaGO+”.<br>BotolaGO+ Saison (#502) · `plus.meta.offer` | ☐ | |
| SE-02 | Découvrir la Saison | <span dir="rtl">اكتشف الموسم</span> | BotolaGO+ offer page.<br>Was: <span dir="rtl">اختر صيغتك</span><br>BotolaGO+ Saison (#502) · `plus.s2.cta` | ☐ | |
| SE-03 | Saison 2026/27 | <span dir="rtl">موسم 2026/27</span> | BotolaGO+ offer page.<br>Product name. “الموسم” is both the football season and the paid offer.<br>BotolaGO+ Saison (#502) · `plus.season.name` | ☐ | |
| SE-04 | {price} · un seul paiement | <span dir="rtl">{price} · دفعة واحدة</span> | BotolaGO+ offer page.<br>Placeholders: `{price}`.<br>BotolaGO+ Saison (#502) · `plus.season.l1` | ☐ | |
| SE-05 | Valable jusqu'au {date} | <span dir="rtl">صالح حتى {date}</span> | BotolaGO+ offer page.<br>Placeholders: `{date}`.<br>Date: written by the app in Morocco time.<br>BotolaGO+ Saison (#502) · `plus.season.l2` | ☐ | |
| SE-06 | Valable jusqu'à la fin de la saison | <span dir="rtl">صالح حتى نهاية الموسم</span> | BotolaGO+ offer page.<br>BotolaGO+ Saison (#502) · `plus.season.l2_nodate` | ☐ | |
| SE-07 | Ce que comprend la Saison | <span dir="rtl">ما يتضمنه الموسم</span> | BotolaGO+ offer page, feature list and pay button.<br>Was: <span dir="rtl">مزايا الاشتراك</span><br>BotolaGO+ Saison (#502) · `plus.s3.feat_title` | ☐ | |
| SE-08 | Payer ma Saison | <span dir="rtl">ادفع موسمي</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>BotolaGO+ Saison (#502) · `plus.pay.title` | ☐ | |
| SE-09 | Un virement ou un dépôt, puis le reçu sur WhatsApp. Nous activons votre Saison dès que le paiement est vérifié. | <span dir="rtl">تحويل أو إيداع، ثم الإيصال عبر واتساب. نفعّل موسمك فور التحقق من الدفع.</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>BotolaGO+ Saison (#502) · `plus.pay.lede` | ☐ | |
| SE-10 | Montant | <span dir="rtl">المبلغ</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>BotolaGO+ Saison (#502) · `plus.pay.amount` | ☐ | |
| SE-11 | Virement bancaire | <span dir="rtl">تحويل بنكي</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>BotolaGO+ Saison (#502) · `plus.pay.bank_t` | ☐ | |
| SE-12 | Titulaire | <span dir="rtl">صاحب الحساب</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>BotolaGO+ Saison (#502) · `plus.pay.holder` | ☐ | |
| SE-13 | Banque | <span dir="rtl">البنك</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>BotolaGO+ Saison (#502) · `plus.pay.bank` | ☐ | |
| SE-14 | RIB | <span dir="rtl">رقم الحساب (RIB)</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>Latin text inside: RIB.<br>RIB is the Moroccan bank account number.<br>BotolaGO+ Saison (#502) · `plus.pay.rib` | ☐ | |
| SE-15 | Copier | <span dir="rtl">نسخ</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>BotolaGO+ Saison (#502) · `plus.pay.copy` | ☐ | |
| SE-16 | Copié | <span dir="rtl">تم النسخ</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>BotolaGO+ Saison (#502) · `plus.pay.copied` | ☐ | |
| SE-17 | Copier : {what} | <span dir="rtl">نسخ: {what}</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>Placeholders: `{what}`.<br>BotolaGO+ Saison (#502) · `plus.pay.copy_aria` | ☐ | |
| SE-18 | CashPlus / Wafacash | <span dir="rtl">كاش بلس / وفاكاش</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>Brands written phonetically: كاش بلس, وفاكاش.<br>BotolaGO+ Saison (#502) · `plus.pay.cash_t` | ☐ | |
| SE-19 | Déposez le montant en agence, au nom de : | <span dir="rtl">أودع المبلغ في الوكالة باسم:</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>BotolaGO+ Saison (#502) · `plus.pay.cash_d` | ☐ | |
| SE-20 | Bénéficiaire | <span dir="rtl">المستفيد</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>BotolaGO+ Saison (#502) · `plus.pay.recipient` | ☐ | |
| SE-21 | Votre code | <span dir="rtl">رمزك</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>BotolaGO+ Saison (#502) · `plus.pay.code_t` | ☐ | |
| SE-22 | À écrire dans le motif du virement ou à donner à l'agence. | <span dir="rtl">اكتبه في خانة سبب التحويل أو أعطه للوكالة.</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>BotolaGO+ Saison (#502) · `plus.pay.code_d` | ☐ | |
| SE-23 | Envoyer le reçu sur WhatsApp | <span dir="rtl">أرسل الإيصال عبر واتساب</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>BotolaGO+ Saison (#502) · `plus.pay.wa_cta` | ☐ | |
| SE-24 | Votre reçu et votre code partent ensemble : nous retrouvons votre compte. | <span dir="rtl">يصلنا إيصالك ورمزك معًا: نجد حسابك بسهولة.</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>BotolaGO+ Saison (#502) · `plus.pay.wa_hint` | ☐ | |
| SE-25 | Bonjour, voici mon reçu de paiement pour la Saison 2026/27. Mon code : {code} | <span dir="rtl">مرحبًا، هذا إيصال دفعي لموسم 2026/27. رمزي: {code}</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>Placeholders: `{code}`.<br>This text is pre-filled into a WhatsApp message to the BotolaGO team.<br>BotolaGO+ Saison (#502) · `plus.pay.wa_message` | ☐ | |
| SE-26 | Les coordonnées de paiement arrivent bientôt. | <span dir="rtl">بيانات الدفع ستتوفر قريبًا.</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>BotolaGO+ Saison (#502) · `plus.pay.soon` | ☐ | |
| SE-27 | Revenez dans quelques jours : le paiement n'est pas encore ouvert. | <span dir="rtl">عُد خلال أيام: الدفع غير متاح بعد.</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>BotolaGO+ Saison (#502) · `plus.pay.soon_d` | ☐ | |
| SE-28 | Chargement des coordonnées de paiement | <span dir="rtl">جارٍ تحميل بيانات الدفع</span> | “Pay my Season” page (bank transfer, CashPlus / Wafacash, WhatsApp receipt).<br>BotolaGO+ Saison (#502) · `plus.pay.loading` | ☐ | |
| SE-29 | Payer ma Saison | <span dir="rtl">ادفع موسمي</span> | BotolaGO+ offer page, feature list and pay button.<br>Was: <span dir="rtl">اشترك</span><br>Pay button; was “اشترك” (subscribe).<br>BotolaGO+ Saison (#502) · `plus.s3.cta` | ☐ | |
| SE-30 | Conditions de la Saison | <span dir="rtl">شروط الموسم</span> | BotolaGO+ offer page, feature list and pay button.<br>Was: <span dir="rtl">شروط الاشتراك</span><br>BotolaGO+ Saison (#502) · `plus.s3.terms_link` | ☐ | |
| SE-31 | Paiement unique de {price}, au même prix quel que soit le jour où vous payez. | <span dir="rtl">دفعة واحدة بقيمة {price}، بالسعر نفسه مهما كان يوم الدفع.</span> | Season terms (short list under the pay button).<br>Placeholders: `{price}`.<br>{price} is an amount in dirhams.<br>BotolaGO+ Saison (#502) · `plus.terms.once` | ☐ | |
| SE-32 | Votre accès à {logo} court jusqu'au {date}, la fin de la saison. | <span dir="rtl">يمتد وصولك إلى {logo} حتى {date}، نهاية الموسم.</span> | Season terms (short list under the pay button).<br>Placeholders: `{logo}` `{date}`.<br>Date: written by the app in Morocco time.<br>{logo} is the BotolaGO+ logo word, shown in Latin letters.<br>BotolaGO+ Saison (#502) · `plus.terms.until` | ☐ | |
| SE-33 | Votre accès à {logo} court jusqu'à la fin de la saison. | <span dir="rtl">يمتد وصولك إلى {logo} حتى نهاية الموسم.</span> | Season terms (short list under the pay button).<br>Placeholders: `{logo}`.<br>BotolaGO+ Saison (#502) · `plus.terms.until_end` | ☐ | |
| SE-34 | Rien ne se reconduit tout seul : aucun prélèvement automatique, rien à annuler. | <span dir="rtl">لا شيء يُعاد من تلقاء نفسه: لا خصم تلقائي ولا شيء يحتاج إلى إلغاء.</span> | Season terms (short list under the pay button).<br>No automatic renewal.<br>BotolaGO+ Saison (#502) · `plus.terms.norenew` | ☐ | |
| SE-35 | Votre accès commence dès que l'équipe a vérifié votre paiement. | <span dir="rtl">يبدأ وصولك فور أن يتحقق الفريق من دفعتك.</span> | Season terms (short list under the pay button).<br>BotolaGO+ Saison (#502) · `plus.terms.check` | ☐ | |
| SE-36 | À la fin de la saison, votre carte repasse au style de base. | <span dir="rtl">في نهاية الموسم تعود بطاقتك إلى الأسلوب الأساسي.</span> | Season terms (short list under the pay button).<br>BotolaGO+ Saison (#502) · `plus.terms.after` | ☐ | |
| SE-37 | Voir Ma saison | <span dir="rtl">عرض موسمي</span> | Member side of the Season (welcome, badge, locked cards).<br>Was: <span dir="rtl">إدارة في الملف الشخصي</span><br>BotolaGO+ Saison (#502) · `plus.s4.manage` | ☐ | |
| SE-38 | jusqu'au {date} | <span dir="rtl">حتى {date}</span> | Member side of the Season (welcome, badge, locked cards).<br>Placeholders: `{date}`.<br>Date: written by the app in Morocco time.<br>BotolaGO+ Saison (#502) · `plus.s4.access` | ☐ | |
| SE-39 | Ma saison | <span dir="rtl">موسمي</span> | Member side of the Season (welcome, badge, locked cards).<br>Was: <span dir="rtl">اشتراكي</span><br>“موسمي” = My season.<br>BotolaGO+ Saison (#502) · `plus.page.member_title` | ☐ | |
| SE-40 | Votre Saison est active. Vous la retrouvez dans Profil. | <span dir="rtl">موسمك فعّال. تجده في الملف الشخصي.</span> | Member side of the Season (welcome, badge, locked cards).<br>Was: <span dir="rtl">اشتراكك فعّال بالفعل. تديره من الملف الشخصي.</span><br>BotolaGO+ Saison (#502) · `plus.page.member_body` | ☐ | |
| SE-41 | Saison {name} active | <span dir="rtl">موسم {name} فعّال</span> | Member side of the Season (welcome, badge, locked cards).<br>Placeholders: `{name}`.<br>Was: <span dir="rtl">عضو {name}</span><br>BotolaGO+ Saison (#502) · `plus.in.member_aria` | ☐ | |
| SE-42 | Avec la Saison {name} | <span dir="rtl">مع موسم {name}</span> | Member side of the Season (welcome, badge, locked cards).<br>Placeholders: `{name}`.<br>Was: <span dir="rtl">مع اشتراك {name}</span><br>Read aloud only.<br>BotolaGO+ Saison (#502) · `plus.lock.aria` | ☐ | |
| SE-43 | Votre Saison 2026/27 est active · jusqu'au {date} | <span dir="rtl">موسمك 2026/27 فعّال · حتى {date}</span> | Profile “Ma saison” section and hub.<br>Placeholders: `{date}`.<br>Date: written by the app in Morocco time.<br>BotolaGO+ Saison (#502) · `plus.profile.active_line` | ☐ | |
| SE-44 | Votre Saison 2026/27 est active | <span dir="rtl">موسمك 2026/27 فعّال</span> | Profile “Ma saison” section and hub.<br>BotolaGO+ Saison (#502) · `plus.profile.active_nodate` | ☐ | |
| SE-45 | Votre Saison est terminée | <span dir="rtl">انتهى موسمك</span> | Profile “Ma saison” section and hub.<br>BotolaGO+ Saison (#502) · `plus.profile.ended` | ☐ | |
| SE-46 | Voir l'offre | <span dir="rtl">عرض الموسم</span> | Profile “Ma saison” section and hub.<br>BotolaGO+ Saison (#502) · `plus.profile.offer_link` | ☐ | |
| SE-47 | Ma saison | <span dir="rtl">موسمي</span> | Profile “Ma saison” section and hub.<br>Was: <span dir="rtl">اشتراكي</span><br>BotolaGO+ Saison (#502) · `plus.hub.title` | ☐ | |
| SE-48 | Votre accès reste ouvert jusqu'à cette date. Il n'y a rien à régler ni à annuler d'ici là. | <span dir="rtl">يبقى وصولك مفتوحًا حتى هذا التاريخ. لا شيء لتدفعه أو تلغيه قبل ذلك.</span> | Profile “Ma saison” section and hub.<br>BotolaGO+ Saison (#502) · `plus.hub.active_note` | ☐ | |
| SE-49 | Votre Saison | <span dir="rtl">موسمك</span> | Profile “Ma saison” section and hub.<br>BotolaGO+ Saison (#502) · `plus.hub.status_t` | ☐ | |
| SE-50 | Active jusqu'au {date} | <span dir="rtl">فعّال حتى {date}</span> | Profile “Ma saison” section and hub.<br>Placeholders: `{date}`.<br>Date: written by the app in Morocco time.<br>BotolaGO+ Saison (#502) · `plus.hub.status_d` | ☐ | |
| SE-51 | Active | <span dir="rtl">فعّال</span> | Profile “Ma saison” section and hub.<br>BotolaGO+ Saison (#502) · `plus.hub.status_d_nodate` | ☐ | |
| SE-52 | Votre Saison 2026/27 a pris fin le {date}. Votre carte est revenue au style de base. | <span dir="rtl">انتهى موسم 2026/27 في {date}. عادت بطاقتك إلى الأسلوب الأساسي.</span> | Profile “Ma saison” section and hub.<br>Placeholders: `{date}`.<br>Date: written by the app in Morocco time.<br>Was: <span dir="rtl">انتهى اشتراكك في {date}. عادت بطاقتك إلى الأسلوب الأساسي.</span><br>BotolaGO+ Saison (#502) · `plus.hub.expired_line` | ☐ | |
| SE-53 | Votre Saison 2026/27 a pris fin. Votre carte est revenue au style de base. | <span dir="rtl">انتهى موسم 2026/27. عادت بطاقتك إلى الأسلوب الأساسي.</span> | Profile “Ma saison” section and hub.<br>Was: <span dir="rtl">انتهى اشتراكك. عادت بطاقتك إلى الأسلوب الأساسي.</span><br>BotolaGO+ Saison (#502) · `plus.hub.expired_nodate` | ☐ | |
| SE-54 | Chargement de votre Saison | <span dir="rtl">جارٍ تحميل موسمك</span> | Profile “Ma saison” section and hub.<br>Was: <span dir="rtl">جارٍ تحميل اشتراكك</span><br>BotolaGO+ Saison (#502) · `plus.profile.loading` | ☐ | |
| SE-55 | Créez votre compte gratuit pour découvrir la Saison | <span dir="rtl">أنشئ حسابك المجاني لتكتشف الموسم</span> | Curva sign-up wall for guests.<br>Was: <span dir="rtl">أنشئ حسابك المجاني لتكتشف الاشتراك</span><br>Sign-up wall text.<br>BotolaGO+ Saison (#502) · `lock.curva.title.plus` | ☐ | |

---

## Part 3. Arabic outside the dictionary

### E. Weekly Prospects e-mail (`supabase/functions/_shared/notification-email-render.ts`)

The e-mail is rendered by an Edge Function, not from the dictionary. All eight lines changed because of the rename to Prospects (Phase D). The e-mail’s other Arabic text did not change.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| E-01 | Les dix meilleurs joueurs de moins de 23 ans de Botola Pro cette semaine, choisis par la rédaction à partir du classement Prospects. Le score va de 0 à 100. | <span dir="rtl">أفضل عشرة لاعبين دون 23 سنة في البطولة الاحترافية هذا الأسبوع، اختارتهم هيئة التحرير انطلاقًا من ترتيب المواهب. التنقيط من 0 إلى 100.</span> | Weekly Prospects e-mail, introduction paragraph. Was “ترتيب Pépites”. | ☐ | |
| E-02 | Prospects · {week} : le Top 10 des jeunes | <span dir="rtl">المواهب · {week}: توب 10 للشباب</span> | Weekly Prospects e-mail, subject line. {week} is a label such as “Semaine 42” / “الأسبوع 42”. Was “Pépites · …”. Uses “توب 10”. | ☐ | |
| E-03 | Prospects · {week} : le Top 10 corrigé | <span dir="rtl">المواهب · {week}: توب 10 بعد التصحيح</span> | Same e-mail, subject line when the list was corrected. Was “Pépites · …”. | ☐ | |
| E-04 | Prospects | <span dir="rtl">المواهب</span> | Same e-mail, small title above the headline (kicker). Was the Latin word Pépites in both languages. | ☐ | |
| E-05 | Vous recevez cet e-mail car vous vous êtes abonné à Prospects, le Top 10 hebdomadaire des jeunes de Botola Pro. | <span dir="rtl">تتلقى هذه الرسالة لأنك اشتركت في المواهب، توب 10 الأسبوعي لشباب البطولة الاحترافية.</span> | Same e-mail, footer “why you receive this”. Masculine “اشتركت”. Was “في Pépites”. | ☐ | |
| E-06 | Vous désabonner de Prospects ne change pas vos autres e-mails BotolaGO. | <span dir="rtl">إلغاء الاشتراك في رسالة المواهب لا يغيّر باقي رسائل BotolaGO الإلكترونية.</span> | Same e-mail, footer scope line. Arabic says “the Prospects e-mail”. Was “في Pépites”. | ☐ | |
| E-07 | Prospects | <span dir="rtl">المواهب</span> | Same e-mail, link back to the section (label). | ☐ | |
| E-08 | Se désabonner de Prospects | <span dir="rtl">إلغاء الاشتراك في رسالة المواهب</span> | Same e-mail, unsubscribe link label. Was “إلغاء الاشتراك في Pépites”. | ☐ | |

### D. Database notification templates and names

These live in database rows created by migrations: the weekly Top 10 bell title (PR 504, migration 20261016100000), the four Rivals lead-change notifications (migration 20261015130100) and the trophy and card-frame names (migration 20261015150000). The migrations are in `main`; whether they are applied on production is a separate question and not checked here. Changing a line after the migration is applied needs a new migration.

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| D-01 | Prospects : le Top 10 de la semaine {{week}} | <span dir="rtl">المواهب: توب 10 للأسبوع {{week}}</span> | Notification bell, title of the weekly Top 10 notification (PR 504, migration 20261016100000). Was “Pépites: توب 10 للأسبوع …”. New notifications only; old ones keep their text. {{week}} is the week number. | ☐ | |
| D-02 | {{rival}} vous passe devant | <span dir="rtl">{{rival}} يتقدّم عليك</span> | Notification bell, title when a rival takes the lead (migration 20261015130100). {{rival}} is a name. | ☐ | |
| D-03 | {{rival_total}} contre {{my_total}} après la journée {{gameweek}}. | <span dir="rtl">{{rival_total}} مقابل {{my_total}} بعد الجولة {{gameweek}}.</span> | Body of D-02. Three numbers inserted: mixed direction. | ☐ | |
| D-04 | Vous passez devant {{rival}} | <span dir="rtl">تتقدّم على {{rival}}</span> | Title when you take the lead. | ☐ | |
| D-05 | {{my_total}} contre {{rival_total}} après la journée {{gameweek}}. | <span dir="rtl">{{my_total}} مقابل {{rival_total}} بعد الجولة {{gameweek}}.</span> | Body of D-04. | ☐ | |
| D-06 | {{rival}} vous passe devant | <span dir="rtl">{{rival}} يتقدّم عليك</span> | Title, same as D-02 but for a corrected result. | ☐ | |
| D-07 | Résultat corrigé, journée {{gameweek}} : {{rival_total}} contre {{my_total}}. | <span dir="rtl">نتيجة مصحّحة، الجولة {{gameweek}}: {{rival_total}} مقابل {{my_total}}.</span> | Body of D-06 (corrected result). | ☐ | |
| D-08 | Vous reprenez la tête sur {{rival}} | <span dir="rtl">تعود إلى الصدارة أمام {{rival}}</span> | Title when a correction gives you the lead back. | ☐ | |
| D-09 | Résultat corrigé, journée {{gameweek}} : {{my_total}} contre {{rival_total}}. | <span dir="rtl">نتيجة مصحّحة، الجولة {{gameweek}}: {{my_total}} مقابل {{rival_total}}.</span> | Body of D-08. | ☐ | |
| D-10 | Première note | <span dir="rtl">أول تقييم</span> | Trophy name (database catalogue, migration 20261015150000). | ☐ | |
| D-11 | Premier passage STADE | <span dir="rtl">أول مرة في مستوى ملعب</span> | Trophy name. Tier names follow the Manager Card. | ☐ | |
| D-12 | Premier passage PRO | <span dir="rtl">أول مرة في مستوى محترف</span> | Trophy name. | ☐ | |
| D-13 | Premier passage CHAMPION | <span dir="rtl">أول مرة في مستوى بطل</span> | Trophy name. | ☐ | |
| D-14 | Premier passage LEGEND | <span dir="rtl">أول مرة في مستوى أسطورة</span> | Trophy name. | ☐ | |
| D-15 | Journée à 80 pts | <span dir="rtl">جولة بـ 80 نقطة</span> | Trophy name. Number with “بـ”. | ☐ | |
| D-16 | 10 journées jouées | <span dir="rtl">10 جولات لُعبت</span> | Trophy name. Fixed plural for 10. | ☐ | |
| D-17 | 30 journées jouées | <span dir="rtl">30 جولة لُعبت</span> | Trophy name. Singular after 30 (correct for 11 to 99). | ☐ | |
| D-18 | Transfert gagnant | <span dir="rtl">انتقال رابح</span> | Trophy name (and frame name). | ☐ | |
| D-19 | Podium de la ligue | <span dir="rtl">منصة الدوري</span> | Trophy name. “منصة” = podium. | ☐ | |
| D-20 | Champion de votre ligue | <span dir="rtl">بطل دوريك</span> | Trophy name. | ☐ | |
| D-21 | Fondateur 2026 | <span dir="rtl">مؤسس 2026</span> | Trophy name (and frame name). Screens say “كأس مؤسس 2026”. | ☐ | |
| D-22 | Standard | <span dir="rtl">عادي</span> | Card frame name (default frame). | ☐ | |
| D-23 | STADE | <span dir="rtl">ملعب</span> | Card frame name. | ☐ | |
| D-24 | PRO | <span dir="rtl">محترف</span> | Card frame name. | ☐ | |
| D-25 | CHAMPION | <span dir="rtl">بطل</span> | Card frame name. | ☐ | |
| D-26 | LEGEND | <span dir="rtl">أسطورة</span> | Card frame name. | ☐ | |
| D-27 | 10 journées | <span dir="rtl">10 جولات</span> | Card frame name. | ☐ | |
| D-28 | 30 journées | <span dir="rtl">30 جولة</span> | Card frame name. | ☐ | |

---

## Part 4. Staff-only admin screen (BotolaGO+ console)

87 lines in the BotolaGO+ admin console (`src/components/admin/plus/PlusAdminScreen.tsx`, `plus-presentation.ts`). Only staff see them. Lowest priority. The Arabic here is hard-coded next to the French, not in the dictionary, and the text still sometimes says “عضو / اشتراك” (member / subscription) where the product is now “الموسم”. Rows AD-03 and AD-08 keep “عضو” (member) next to the heading “البحث عن حساب” (account).

<!-- prettier-ignore -->
| # | French (original) | Arabic (to approve) | Where it appears, what to check | Approve | Change to: \_\_\_\_\_ |
| --- | --- | --- | --- | --- | --- |
| AD-01 | Comptes ayant eu une Saison ou un ancien abonnement :  | <span dir="rtl">عدد الحسابات التي لها اشتراك: </span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-02 | Consulter un compte | <span dir="rtl">البحث عن حساب</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-03 | Rechercher un compte | <span dir="rtl">البحث عن عضو</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-04 | Code de paiement, identifiant ou e-mail | <span dir="rtl">رمز الدفع أو معرّف الحساب أو البريد</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-05 | Code de paiement ou identifiant | <span dir="rtl">رمز الدفع أو معرّف الحساب</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-06 | Le code BG-XXXXXX envoyé par l’acheteur, un UUID, ou l’adresse e-mail complète. | <span dir="rtl">الرمز BG-XXXXXX الذي يرسله المشتري، أو UUID، أو البريد الكامل.</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-07 | Le code BG-XXXXXX ou un UUID. La recherche par e-mail demande l’accès à l’annuaire des utilisateurs. | <span dir="rtl">الرمز BG-XXXXXX أو UUID. البحث بالبريد يتطلب صلاحية دليل المستخدمين.</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-08 | Chargement du compte… | <span dir="rtl">جارٍ تحميل العضو…</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-09 | Saison activée jusqu’au {date}. L’action est consignée dans l’audit. | <span dir="rtl">فُعّل الموسم حتى {date}. سُجّل الإجراء في التدقيق.</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-10 | Compte | <span dir="rtl">الحساب</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-11 | Saison active | <span dir="rtl">موسم فعّال</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-12 | Pas de Saison active | <span dir="rtl">لا موسم فعّال</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-13 | Compte la Saison et les accès offerts valables aujourd’hui. | <span dir="rtl">يشمل الموسم والوصول الممنوح الساريين.</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-14 | Activer la Saison 2026/27 | <span dir="rtl">تفعيل موسم 2026/27</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-15 | Une fois le reçu envoyé sur WhatsApp vérifié. La Saison court jusqu’à la fin de la saison Fantasy. | <span dir="rtl">بعد التحقق من الإيصال الذي أرسله المشتري عبر واتساب. يمتد الموسم حتى نهاية الموسم الفانتازي.</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-16 | Mode de paiement | <span dir="rtl">طريقة الدفع</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-17 | Référence du paiement (requise) | <span dir="rtl">مرجع الدفع (مطلوب)</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-18 | Numéro du virement ou du reçu d’agence, tel qu’il figure sur le reçu. | <span dir="rtl">رقم التحويل أو إيصال الوكالة، كما يظهر في الإيصال.</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-19 | La Saison se termine le  | <span dir="rtl">ينتهي الموسم في </span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-20 | Confirmer l’activation | <span dir="rtl">تأكيد التفعيل</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-21 | Achat enregistré | <span dir="rtl">الشراء المسجّل</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-22 | Ce compte n’a jamais payé en ligne. | <span dir="rtl">لم يدفع هذا الحساب عبر الإنترنت قط.</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-23 | Saisons et accès offerts | <span dir="rtl">السجل: التفعيل والمنح</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-24 | Aucune Saison ni accès offert pour ce compte. | <span dir="rtl">لا منحة لهذا الحساب.</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-25 | Offrir un accès | <span dir="rtl">منح وصول مجاني</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-26 | Action secondaire, pour une durée choisie (geste, presse). Aucun paiement n’est enregistré. | <span dir="rtl">بديل ثانوي، لمدة محددة (هدية، صحافة). لا يسجّل أي دفع.</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-27 | Offrir un accès | <span dir="rtl">منح وصول</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-28 | Votre rôle permet de consulter les comptes, pas d’activer, d’offrir ni de retirer une Saison. | <span dir="rtl">يسمح دورك بالاطلاع على الحسابات، لا بتفعيل الموسم أو منحه أو سحبه.</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-29 | Du  | <span dir="rtl">من </span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-30 |  au  | <span dir="rtl"> إلى </span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-31 | Paiement | <span dir="rtl">الدفع</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-32 | Retirer l’accès | <span dir="rtl">سحب المنحة</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-33 | Coordonnées enregistrées. L’action est consignée dans l’audit. | <span dir="rtl">حُفظت بيانات الدفع. سُجّل الإجراء في التدقيق.</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-34 | Titulaire | <span dir="rtl">صاحب الحساب</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-35 | Banque | <span dir="rtl">البنك</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-36 | Bénéficiaire CashPlus / Wafacash | <span dir="rtl">المستفيد (كاش بلس / وفاكاش)</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-37 | Numéro WhatsApp | <span dir="rtl">رقم واتساب</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-38 | Note (français) | <span dir="rtl">ملاحظة بالفرنسية</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-39 | Note (arabe) | <span dir="rtl">ملاحظة بالعربية</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-40 | Coordonnées de paiement | <span dir="rtl">بيانات الدفع</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-41 | Ce que l’acheteur voit sur l’écran « Payer ma Saison ». Le propriétaire les saisit ici, jamais dans le code. | <span dir="rtl">ما يراه المشتري في شاشة «ادفع موسمي». يدخلها المالك هنا فقط، دون مس بالشيفرة.</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-42 | Pas de numéro WhatsApp : l’acheteur lit « Les coordonnées de paiement arrivent bientôt » et ne voit aucun bouton. | <span dir="rtl">لا رقم واتساب بعد: يقرأ المشتري «بيانات الدفع ستتوفر قريبًا» ولا يظهر أي زر.</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-43 | Non renseigné | <span dir="rtl">غير محدد</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-44 | Dernière modification :  | <span dir="rtl">آخر تعديل: </span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-45 | Modifier les coordonnées | <span dir="rtl">تعديل بيانات الدفع</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-46 | 10 à 40 caractères : chiffres, lettres, espaces, points, tirets. | <span dir="rtl">من 10 إلى 40 حرفًا: أرقام وحروف ومسافات ونقاط وشرطات.</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-47 | Copié tel quel par l’acheteur. | <span dir="rtl">يُنسخ كما هو من قبل المشتري.</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-48 | 8 à 16 chiffres, avec un « + » possible au début. | <span dir="rtl">من 8 إلى 16 رقمًا، و«+» اختياري في البداية.</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-49 | Reçoit le reçu et le code de l’acheteur. | <span dir="rtl">يصل إليه المشتري بالإيصال ورمزه.</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-50 | Note en français (facultatif) | <span dir="rtl">ملاحظة بالفرنسية (اختياري)</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-51 | Note en arabe (facultatif) | <span dir="rtl">ملاحظة بالعربية (اختياري)</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-52 | Enregistrer les coordonnées | <span dir="rtl">حفظ بيانات الدفع</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-53 | Enregistrer ces coordonnées ? Chaque acheteur les voit aussitôt et paie dessus : vérifiez le RIB et le numéro. L’action est consignée dans l’audit. | <span dir="rtl">حفظ هذه البيانات؟ يراها كل مشتري فورًا ويدفع إليها. تحقق من الرقم والـ RIB. يُسجَّل الإجراء في التدقيق.</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-54 | Confirmer l’enregistrement | <span dir="rtl">تأكيد الحفظ</span> | Admin BotolaGO+ console (staff only). | ☐ | |
| AD-55 | {price} · une fois | <span dir="rtl">{price} / مرة واحدة</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-56 | Valable jusqu’à la fin de la saison Fantasy, sans reconduction | <span dir="rtl">صالح حتى نهاية موسم الفانتازي، بلا تجديد</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-57 | Le mode est Éteint : rien n’apparaîtra tant que le propriétaire n’a pas ouvert l’aperçu. | <span dir="rtl">الوضع متوقف حاليًا: لن يظهر الموسم قبل أن يفتح المالك المعاينة.</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-58 | Saison 2026/27 | <span dir="rtl">موسم 2026/27</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-59 | Mensuel (ancien) | <span dir="rtl">شهري (قديم)</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-60 | Annuel (ancien) | <span dir="rtl">سنوي (قديم)</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-61 | Éteint : personne ne voit la Saison, même avec un accès offert par le personnel. | <span dir="rtl">متوقف: لا أحد يرى الموسم، حتى مع وصول ممنوح من الفريق.</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-62 | Aperçu : seuls les comptes qui ont une Saison la voient (activée par le personnel). Rien n’est public. | <span dir="rtl">معاينة: لا يراه إلا من لديهم موسم (يفعّله الفريق). لا شيء علني.</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-63 | Ouvert : la Saison est visible par tout le monde. | <span dir="rtl">مفتوح: الموسم ظاهر للجميع.</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-64 | Éteint | <span dir="rtl">متوقف</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-65 | Aperçu | <span dir="rtl">معاينة</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-66 | Ouvert | <span dir="rtl">مفتوح</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-67 | Renouvellement | <span dir="rtl">تجديد</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-68 | Virement | <span dir="rtl">تحويل</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-69 | CashPlus | <span dir="rtl">كاش بلس</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-70 | Wafacash | <span dir="rtl">وفاكاش</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-71 | Offert | <span dir="rtl">هدية</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-72 | Aucun compte ne correspond à ce code. Vérifiez-le avec l’acheteur. | <span dir="rtl">لا يوجد حساب يطابق هذا الرمز. تحقق منه مع المشتري.</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-73 | Ce compte a déjà une Saison valable jusqu’à la fin de la saison : rien à activer. | <span dir="rtl">لهذا الحساب موسم ساري حتى نهاية الموسم: لا شيء لتفعيله.</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-74 | Aucune saison Fantasy n’est en cours : la Saison ne peut pas être activée. | <span dir="rtl">لا يوجد موسم فانتازي جارٍ: لا يمكن تفعيل الموسم.</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-75 | La saison Fantasy est déjà terminée : la Saison ne peut plus être activée. | <span dir="rtl">انتهى الموسم الفانتازي: لا يمكن تفعيل الموسم.</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-76 | La référence du paiement doit faire entre 1 et 80 caractères. | <span dir="rtl">يجب أن يتراوح مرجع الدفع بين 1 و80 حرفًا.</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-77 | La Saison n'est pas en vente sur ce serveur : vérifiez que la mise à jour de la base est appliquée. | <span dir="rtl">الموسم غير متاح للبيع على هذا الخادم: تحقق من تطبيق تحديث قاعدة البيانات.</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-78 | Indiquez la référence du paiement (numéro du virement ou du reçu). | <span dir="rtl">أدخل مرجع الدفع (رقم التحويل أو الإيصال).</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-79 | Le mode de paiement n’est pas accepté. | <span dir="rtl">طريقة الدفع غير مقبولة.</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-80 | Les coordonnées ne sont pas valides. Le numéro WhatsApp compte 8 à 16 chiffres, avec un « + » possible au début ; le RIB, 10 à 40 caractères (chiffres, lettres, espaces, points, tirets). | <span dir="rtl">البيانات غير صالحة. رقم واتساب من 8 إلى 16 رقمًا، ويمكن أن يبدأ بـ «+».</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-81 | Ce code n’a pas le bon format : « BG- » suivi de six caractères. | <span dir="rtl">صيغة الرمز غير صحيحة: «BG-» ثم ستة أحرف.</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-82 | Saisissez l’identifiant du compte (UUID), son code de paiement (BG-…) ou son adresse e-mail complète. | <span dir="rtl">أدخل معرّف الحساب (UUID) أو رمز الدفع (BG-…) أو بريده الإلكتروني الكامل.</span> | Admin BotolaGO+ console (staff only), labels and messages. | ☐ | |
| AD-83 | Calcul de la date de fin… | <span dir="rtl">جارٍ حساب تاريخ الانتهاء…</span> | Admin console (staff only). | ☐ | |
| AD-84 | Date de fin non connue ici : le serveur la calcule à l’activation. | <span dir="rtl">تاريخ نهاية الموسم غير معروف: سيحسبه الخادم عند التفعيل.</span> | Admin console (staff only). | ☐ | |
| AD-85 | Activer la Saison pour le compte {id} ({méthode}, référence {ref}, jusqu’au {date}) ? Elle est active aussitôt ; l’action est consignée dans l’audit. | <span dir="rtl">تفعيل الموسم للحساب {id} ({méthode}، المرجع {ref})؟ يصبح الموسم فعّالًا فورًا، ويُسجَّل الإجراء في التدقيق.</span> | Admin console confirmation (staff only). Meaning differs: the French sentence includes the end date “jusqu’au {date}”; the Arabic does not. | ☐ | |
| AD-86 | La Saison apparaît dans Profil et sur votre carte : | <span dir="rtl">يظهر الموسم في الملف الشخصي وعلى بطاقتك:</span> | Admin console (staff only), preview line for your own account. | ☐ | |
| AD-87 | Connectez-vous avec ce compte : la Saison apparaît dans Profil et sur sa carte : | <span dir="rtl">سجّل الدخول بهذا الحساب: يظهر الموسم في الملف الشخصي وعلى بطاقته:</span> | Admin console (staff only), preview line for another account. | ☐ | |

---

## Part 6: consistency decisions (owner delegated 2026-10-17)

The owner delegated six small glossary decisions. Nothing else was changed; the
129 owner-approved rows and the Top-10, اشتراك, المواهب and الجاهزية decisions stand.
Tests: `src/i18n/arabic-consistency.test.ts`.

| #   | Key                                                                                                                                    | Old                                         | New                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| 1   | `fantasy.leagues.manager`                                                                                                              | المدير                                      | المدرب                                      |
| 1   | `fantasy.leagues.search_manager`                                                                                                       | ابحث عن مدير                                | ابحث عن مدرب                                |
| 2   | `fantasy.points.free_hit_restored`                                                                                                     | تمت استعادة تشكيلة Free Hit.                | تمت استعادة تشكيلة الضربة الحرة.            |
| 2   | `fantasy.freehit.restored`                                                                                                             | تمت استعادة الفريق الأصلي بعد الـ Free Hit. | تمت استعادة الفريق الأصلي بعد الضربة الحرة. |
| 3   | `fpl.substitute` (French: Remplacer)                                                                                                   | تبديل                                       | استبدال                                     |
| 3   | `fantasy.scoring.incrementalPolicy` (French: remplacements automatiques)                                                               | …تُطبَّق التبديلات التلقائية…               | …تُطبَّق الاستبدالات التلقائية…             |
| 4   | `bulk-copy.ts` phase headings                                                                                                          | ١. ٢. ٣.                                    | 1. 2. 3.                                    |
| 5   | `home.explore`                                                                                                                         | استكشف بوتولاجو                             | استكشف BotolaGO                             |
| 6   | `fantasy.hub.invite_message`, `fantasy.hub.invite_ready`, `card.onboarding.m6.msg.league`, `card.onboarding.m6.msg.league_provisional` | « {name} » / « {league} »                   | «{name}» / «{league}»                       |

Notes:

- `fantasy.substitute` was already استبدال; no change.
- Both Free Hit keys are not used by any component today; they were changed anyway.
- Latin chip names remain in the legal text `src/content/legal/prize-terms.ts`
  (line 153, Arabic: Wildcard and Free Hit; line 81 is the French source). Not edited.
- Left as they are: the four renderings of Forme, the two renderings of Pénalités,
  transfer strings (انتقال), and the 25 keys with a number before the singular نقطة
  (they need plural forms): predictions.rules.miss, plus.s2.lead_h, plus.s2.r_above,
  plus.s2.p_cum_h, plus.s2.p_bars_h, plus.s2.c_race_h, plus.s2.m_under50, plus.s2.a_bars,
  plus.s2.a_src, plus.home.duel_trail, plus.rv.pts, plus.recap.headline_more,
  plus.recap.headline_less, plus.recap.headline_same, plus.recap.headline_plain,
  plus.recap.captain_line, plus.recap.captain_plain, plus.recap.transfer_line,
  plus.recap.transfer_free, plus.recap.share_message, plus.recap.season_title,
  plus.recap.season_title_plain, plus.recap.tile_best_week_v, plus.tr.prog_points,
  plus.tr.prog_points_none.

---

## What this sheet did not cover

- Arabic that was not added or changed since Phase A (about 2,700 other strings) is not listed.
- Arabic text in the frozen demo (`public/demo/app.html`), legal text (`src/content/legal/documents.ts`), the older database notification templates (`supabase/migrations/20260720141854_…`, which still say “الشريحة” for chip) and the editorial articles was not reviewed; the Phase C report lists them as known gaps.
- Test files contain Arabic fixtures; they are not product wording.
- Nothing here was seen on a screen by this author: the sheet is built from the code, not from screenshots.

## How to return it

Send the filled tables back as they are (row numbers like T-07 are enough), or reply with the row number and the new wording. The code changes will be made afterwards, in a separate piece of work with the usual tests, because the Arabic dictionary and the i18n gate test every key.
