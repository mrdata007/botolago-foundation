# Arabic wording pre-read

Date: 2026-10-16. Companion to [`2026-10-16-arabic-wording-review.md`](2026-10-16-arabic-wording-review.md) (the review sheet, “the sheet” below). Nothing here changes the app, the sheet or any dictionary. No database was touched.

**This is not a native read and it approves nothing.** It was written by an AI model (Claude) that reads Arabic well but is not a native speaker. Its job is to sort the sheet's 697 lines so that the native reader's time goes to real doubts, and to catch definite errors early. A row rated OK here still needs the native reader's tick in the sheet.

## Summary

| Rating           | Rows    | Meaning                                                                                                                          |
| ---------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **ERROR-LIKELY** | **24**  | Very probably wrong: grammar that breaks for numbers the app really shows, a glossary clash, a missing part of the French.       |
| **DOUBT**        | **105** | Could be fine, but a native should decide: register, an awkward phrase, a term that collides with another one, a rendering risk. |
| **OK**           | **568** | No problem seen by this pre-read. Still to be ticked by the native reader.                                                       |
| Total            | 697     | Same rows as the sheet: 192 (Part 1) + 382 (Part 2) + 36 (Part 3) + 87 (Part 4).                                                 |

Where to spend native time, in order:

1. The ERROR-LIKELY rows (table below). Most of them have a mechanical fix; the native reader only needs to confirm the replacement.
2. The four open questions (brand word, Top 10, form word, the Saison offer name), answered with a recommendation in “Open questions”.
3. The DOUBT rows with confidence **med** or **high**.
4. Everything else, at reading speed.

### The five most important issues

1. **Transfer is called تبديل (substitution) in the recap** (RC-23, RC-33, RC-38, RC-70, RC-71). The Fantasy glossary says انتقال, and elsewhere in the app تبديل / استبدال already mean a substitution (match events, automatic substitutions). A reader will understand “best substitution”, not “best transfer”.
2. **Plural forms that break for numbers the app really shows.** RC-45 (“{n} لاعبين” is used from 2 players up, so “2 لاعبين” and “12 لاعبين” appear), RC-61 (“{n} تقييم” from 1 up), RC-66 and RC-67 (“{n} جولات” for 11 to 30 rounds, i.e. most of the season), TR-59 (“{n} أُطر” used for 2 frames), G-03 (“عضو” after any member count, wrong for 3 to 10 members, the usual size of a private league).
3. **Penalty is called غرامة (a money fine) in the recap** (RC-34, RC-35, RC-42, RC-75), while the Fantasy screens say خصم (deduction). In an app that also sells a paid offer, “fine” is the wrong idea.
4. **Managers are called مدراء in the trophies** (TR-75, TR-78), and everywhere else مدربين / مدربو. مدراء is also a plural that careful writers avoid (مديرون is the standard plural of مدير), so it is wrong twice.
5. **The brand is spelled three ways and the chip names drift:** BotolaGO (Latin, 124 strings), بوطولاجو (RC-58), بوطولا جو (TR-57); the briefing (BR-94) prints “Wildcard” and “Free Hit” in Latin instead of the approved الورقة الحرة and الضربة الحرة.

Close behind: the staff confirmation AD-85 drops the end date that the French shows before activating a paid Season, and AD-80 drops the RIB rule from the error message.

## How this pre-read was done

- Every row of the sheet was read, French against Arabic, in the order of the sheet. Rows were judged on agreement (gender, number, verb–subject), numeral–noun rules (3 to 10 plural genitive, 11 to 99 singular accusative, 100 and over singular genitive), spelling (hamza, tanwin, final weak letters), consistency with the glossary and with the rest of `src/i18n/dictionary-ar.ts`, register, faithfulness to the French, placeholders and direction marks, and anything that could mislead about notifications, deletion, privacy or money.
- For plural rows, the code that picks the key was read, because the sheet's form labels (“many”, “other”) do not always say which numbers reach the line. Three findings come from that: `plus.recap.pending_many` is used for every count from 2 (`src/components/plus/PlusRecapSection.tsx:533`), `plus.recap.share_waiting` for every count from 1 (line 314), and `plus.tr.frames_title` for every count except 1 (`src/components/plus/TrophyFrames.tsx:55`). `plus.brief.tr_many` is used from 3 up (`src/components/plus/PlusBriefing.tsx:1151`).
- Direction: the recap wraps player names in first-strong isolates (U+2068…U+2069) and signed numbers in left-to-right isolates (U+2066…U+2069) (`PlusRecapSection.tsx:199-210`). The reversed arrow in RC-34 to RC-36 and RC-72 should therefore render the right way round. The player picker (`src/components/fpl/picker-copy.ts`) and the briefing cost line put a minus sign inside the Arabic string with no isolate (T-24 to T-28, BR-63). That is a rendering doubt, flagged below. **Nothing was looked at on a screen**: these are readings of the code, not measurements.
- Glossary sources: `src/i18n/fantasy-glossary-ar.test.ts` (the Phase C glossary and its blocked words) and `src/i18n/prospects-rename.test.ts` (the Prospects names). Term counts below are `grep` counts over `src/i18n/dictionary-ar.ts` on `main` at `9e7056ad`.
- Confidence (low / med / high) is confidence that **there is a real problem**, not confidence in the suggested wording. Every suggestion is a starting point for the native reader.

## Rows rated DOUBT or ERROR-LIKELY

Placeholders in the suggestions are kept exactly as in the sheet. “Same as …” means the issue and the fix pattern repeat; the suggested line is still given in full.

### Part 1. Audit phases A to D

<!-- prettier-ignore -->
| # | Key | Current Arabic | Issue | Suggested Arabic | Rating | Conf. |
| --- | --- | --- | --- | --- | --- | --- |
| M-02 | `matches.status.abandoned` | <span dir="rtl">أُوقفت</span> | A badge written as a bare passive verb, beside adjective badges (متوقفة مؤقتًا, ملغاة). Reads as an unfinished sentence (“was stopped…”). | <span dir="rtl">لم تكتمل</span> (or <span dir="rtl">متوقفة نهائيًا</span>) | DOUBT | low |
| N-03 | `notifications.mark_all_failed` | <span dir="rtl">تعذّر تعليم الإشعارات كمقروءة. حاول مجددًا.</span> | تعليم first means “teaching”; “كـ” + adjective is a French calque. Understandable but stiff. | <span dir="rtl">تعذّر تحديد الإشعارات كمقروءة. حاول مجددًا.</span> | DOUBT | low |
| U-08 | `unsubscribe.reenable_hint` | <span dir="rtl">… تبقى رسائل أمان الحساب الضرورية متاحة.</span> | “متاحة” (available) does not say the reader will keep receiving them; the French “restent disponibles” means they keep being sent. A promise about e-mail scope should be unambiguous. | <span dir="rtl">يمكنك إعادة تفعيلها في أي وقت من إعدادات الإشعارات في ملفك الشخصي. ستظل تصلك الرسائل الضرورية لأمان حسابك.</span> | DOUBT | med |
| T-11 | `fantasy.transfers.preview.budget` | <span dir="rtl">الرصيد لا يكفي: ينقصك {amount} م …</span> | The next line (T-12) and BR-55 call the budget الميزانية; الرصيد is the money left in the bank (BR-55, BR-89). “م” is the app-wide price unit (`fantasy.players.price_unit`), so it is consistent. | <span dir="rtl">الميزانية لا تكفي: ينقصك {amount} م لإتمام هذه الانتقالات. اختر لاعبًا أقل سعرًا.</span> | DOUBT | low |
| T-24 | `fpl.pick.transfer_cost_one` | <span dir="rtl">انتقال واحد مجاني، ثم −{hit} نقاط</span> | The minus sign is typed in the Arabic string with no direction isolate. In right-to-left text it can display on the right of the digit (“4−”). The recap isolates its signed numbers; the picker does not. Check on a screen; rewording removes the risk. | <span dir="rtl">انتقال واحد مجاني، ثم خصم {hit} نقاط</span> | DOUBT | med |
| T-25 | `fpl.pick.transfer_cost_two` | <span dir="rtl">انتقالان مجانيان، ثم −{hit} نقاط</span> | Same as T-24. | <span dir="rtl">انتقالان مجانيان، ثم خصم {hit} نقاط</span> | DOUBT | med |
| T-26 | `fpl.pick.transfer_cost_few` | <span dir="rtl">{n} انتقالات مجانية، ثم −{hit} نقاط</span> | Same as T-24. | <span dir="rtl">{n} انتقالات مجانية، ثم خصم {hit} نقاط</span> | DOUBT | med |
| T-27 | `fpl.pick.transfer_cost_other` | <span dir="rtl">{n} انتقالًا مجانيًا، ثم −{hit} نقاط</span> | Same as T-24. | <span dir="rtl">{n} انتقالًا مجانيًا، ثم خصم {hit} نقاط</span> | DOUBT | med |
| T-28 | `fpl.pick.transfer_cost_none` | <span dir="rtl">لا انتقالات مجانية: −{hit} نقاط لكل انتقال</span> | Same as T-24. (“نقاط” is right for the usual 4 or 8 points.) | <span dir="rtl">لا انتقالات مجانية: خصم {hit} نقاط عن كل انتقال</span> | DOUBT | med |
| T-34 | `fpl.pick.filters_apply_two` | <span dir="rtl">عرض لاعبين</span> | Unvowelled, reads as “show players” as easily as “show two players” (the sheet's own question). | <span dir="rtl">عرض اللاعبَيْن</span> | DOUBT | low |
| G-03 | `fantasy.leagues.members` | <span dir="rtl">عضو</span> | Shown after a member count (“20 / 45 عضو”, `fantasy.leagues.$leagueId.tsx:427`). Wrong for 3 to 10 members (أعضاء), which is the normal size of a private league; wrong for 11 to 99 in careful writing (عضوًا). | Add plural forms (few <span dir="rtl">أعضاء</span>, many <span dir="rtl">عضوًا</span>, other <span dir="rtl">عضو</span>), or reword to <span dir="rtl">من الأعضاء</span> | ERROR-LIKELY | med |
| G-14 | `fantasy.create.sign_in_reason_unsaved` | <span dir="rtl">… وتجنّب الدخول عبر Google لأنه يغادر الصفحة.</span> | “لأنه يغادر الصفحة” says Google leaves the page; the meaning is that it takes the reader away from it. | <span dir="rtl">… وتجنّب الدخول عبر Google لأنه ينقلك خارج الصفحة.</span> | DOUBT | low |
| P-18 | `fantasy.chip.confirm_desc` | <span dir="rtl">لا يمكن تفعيل أكثر من جوكر واحد. سيتم إيقاف هذا الإجراء بعد الموعد النهائي.</span> | The French says one chip **at a time**; the Arabic drops “at a time” and can read as one chip for the whole season. “سيتم إيقاف” (will be stopped) is vaguer than “bloquée”. | <span dir="rtl">لا يمكن أن يكون أكثر من جوكر واحد مفعّلًا في الوقت نفسه. لن يكون هذا الإجراء متاحًا بعد الموعد النهائي.</span> | DOUBT | med |
| P-20 | `fantasy.chip.deactivated` | <span dir="rtl">تم إلغاء الجوكر</span> | Identical to P-23 (annulé) although the French distinguishes “désactivé” and “annulé”. | <span dir="rtl">تم إلغاء تفعيل الجوكر</span> | DOUBT | low |
| P-24 | `fantasy.points.finalize_confirm_desc` | <span dir="rtl">… واستعادة تشكيلة Free Hit عند الاقتضاء.</span> | Staff only. Latin chip name; the approved Arabic name is الضربة الحرة. | <span dir="rtl">سيتم حفظ النتيجة، واحتساب الجوكر المفعّل كمُستخدَم، واستعادة تشكيلة الضربة الحرة عند الاقتضاء.</span> | DOUBT | low |
| R-03 | `predictions.claim.unsaved_two` | <span dir="rtl">توقعان قبل تسجيل الدخول لم يُضافا إلى حسابك بعد</span> | Drops the verb that R-02 has (سجّلته): “two predictions before signing in” is elliptical. | <span dir="rtl">توقعان سجّلتهما قبل تسجيل الدخول لم يُضافا إلى حسابك بعد</span> | DOUBT | low |
| R-04 | `predictions.claim.unsaved_few` | <span dir="rtl">{n} توقعات قبل تسجيل الدخول لم تُضف إلى حسابك بعد</span> | Same as R-03. | <span dir="rtl">{n} توقعات سجّلتها قبل تسجيل الدخول لم تُضَف إلى حسابك بعد</span> | DOUBT | low |
| R-05 | `predictions.claim.unsaved_other` | <span dir="rtl">{n} توقعًا قبل تسجيل الدخول لم يُضف إلى حسابك بعد</span> | Same as R-03. The family has no “many” form, so this line serves 11 to 99 (right) and 100 and over (would need توقع); 100 guest picks is unlikely. | <span dir="rtl">{n} توقعًا سجّلتها قبل تسجيل الدخول لم تُضَف إلى حسابك بعد</span> | DOUBT | low |
| X-05 | `unsubscribe.pepites_reenable_hint` | <span dir="rtl">… يمكنك إعادة الاشتراك في المواهب في أي وقت.</span> | “Subscribe again to the talents”: the brand word needs its noun here, as X-02 and E-06 already do (رسالة المواهب). | <span dir="rtl">باقي رسائل BotolaGO الإلكترونية لن تتغير. يمكنك إعادة الاشتراك في رسالة المواهب في أي وقت.</span> | DOUBT | low |
| X-15 | `pepites.email.sign_in_reason` | <span dir="rtl">سجّل الدخول لتتلقى توب 10 من المواهب عبر البريد الإلكتروني.</span> | “توب 10” while page titles say “أفضل 10”. See the Top 10 question. | <span dir="rtl">سجّل الدخول لتتلقى أفضل 10 من المواهب عبر البريد الإلكتروني.</span> | DOUBT | med |
| X-23 | `pepites.share.player_message` | <span dir="rtl">{name} في المواهب، ترتيب لاعبي البطولة الاحترافية دون 23 سنة على BotolaGO.</span> | “{name} in the talents” reads oddly in a WhatsApp message read without the app around it. The rename test already prefers قسم المواهب where the section is meant. | <span dir="rtl">{name} ضمن قسم المواهب، ترتيب لاعبي البطولة الاحترافية دون 23 سنة على BotolaGO.</span> | DOUBT | low |

### Part 2. BotolaGO+ screens

<!-- prettier-ignore -->
| # | Key | Current Arabic | Issue | Suggested Arabic | Rating | Conf. |
| --- | --- | --- | --- | --- | --- | --- |
| RC-01 | `plus.recap.title` | <span dir="rtl">جولتك مشروحة</span> | Word-for-word “your round, explained”: a passive participle used as a title reads like a translation. | <span dir="rtl">شرح جولتك</span> | DOUBT | low |
| RC-04 | `plus.recap.published` | <span dir="rtl">نُشرت في {date}</span> | Same French (“Publié le {date}”) is نُشر in RV-09, TR-15 and TR-63. Pick one. | <span dir="rtl">نُشر في {date}</span> | DOUBT | low |
| RC-06 | `plus.recap.headline_more` | <span dir="rtl">الجولة {n}: {score} نقطة، {gap} أكثر من معدل دوريك</span> | “نقطة” after any score: wrong for 3 to 10 (نقاط). Round scores that low are rare, so low risk. See “Counted words”. | Keep, or add forms (few: <span dir="rtl">{score} نقاط</span>) | DOUBT | low |
| RC-07 | `plus.recap.headline_less` | <span dir="rtl">الجولة {n}: {score} نقطة، {gap} أقل من معدل دوريك</span> | Same as RC-06. | Same as RC-06 | DOUBT | low |
| RC-08 | `plus.recap.headline_same` | <span dir="rtl">الجولة {n}: {score} نقطة، مثل معدل دوريك تماماً</span> | Same as RC-06 (also older tanwin style تماماً). | Same as RC-06; <span dir="rtl">تمامًا</span> | DOUBT | low |
| RC-09 | `plus.recap.headline_plain` | <span dir="rtl">الجولة {n}: {score} نقطة</span> | Same as RC-06. | Same as RC-06 | DOUBT | low |
| RC-13 | `plus.recap.move_up` | <span dir="rtl">{n} في الترتيب</span> | Up and down (RC-14) have the same Arabic and French; the direction comes only from the icon. Check that a screen reader hears up or down. | <span dir="rtl">صعود {n} في الترتيب</span> | DOUBT | low |
| RC-14 | `plus.recap.move_down` | <span dir="rtl">{n} في الترتيب</span> | Same as RC-13. | <span dir="rtl">تراجع {n} في الترتيب</span> | DOUBT | low |
| RC-17 | `plus.recap.best` | <span dir="rtl">أفضل نتيجة</span> | نتيجة is a match result elsewhere in the app; here it is the best points total of the league. | <span dir="rtl">أعلى مجموع</span> | DOUBT | low |
| RC-20 | `plus.recap.bench_total` | <span dir="rtl">{pts} نقطة</span> | Bench totals are often 3 to 10, where Arabic needs نقاط. | Add forms, or <span dir="rtl">نقاط الاحتياط: {pts}</span> | DOUBT | med |
| RC-23 | `plus.recap.transfer_badge` | <span dir="rtl">تبديل</span> | Glossary clash: a transfer is انتقال; تبديل is a substitution elsewhere in the app (`matches.event.sub`, `matches.timeline.show_subs_*`). | <span dir="rtl">انتقال</span> | ERROR-LIKELY | high |
| RC-30 | `plus.recap.captain_line` | <span dir="rtl">{name}: {formula} نقطة، {gap} مقارنة بقادة الدوري</span> | “قادة الدوري” reads first as “the league leaders” (top of the table), not “the captains chosen in your league”. | <span dir="rtl">{name}: {formula} نقطة، {gap} مقارنة بقادة فرق دوريك</span> | DOUBT | med |
| RC-31 | `plus.recap.captain_plain` | <span dir="rtl">{name}: {formula} نقطة</span> | Fixed “نقطة”; a captain total of 3 to 10 is common. | Add forms (few: <span dir="rtl">{name}: {formula} نقاط</span>) | DOUBT | low |
| RC-33 | `plus.recap.cause_transfer` | <span dir="rtl">تبديل</span> | Same as RC-23. | <span dir="rtl">انتقال</span> | ERROR-LIKELY | high |
| RC-34 | `plus.recap.transfer_line` | <span dir="rtl">{out} ← {in}: {gain} نقطة، غرامة {hit} = {net}</span> | غرامة is a money fine; the Fantasy screens call the points cost خصم (`fantasy.points_hit`, `fantasy.transfers.hit`, T-08). Also fixed “نقطة” after a gain that is often 3 to 10. The arrow and names are isolated in code and should render correctly. | <span dir="rtl">{out} ← {in}: {gain} نقطة، خصم {hit} = {net}</span> | ERROR-LIKELY | med |
| RC-35 | `plus.recap.transfer_free` | <span dir="rtl">{out} ← {in}: {gain} نقطة، بلا غرامة</span> | Same as RC-34. | <span dir="rtl">{out} ← {in}: {gain} نقطة، بلا خصم</span> | ERROR-LIKELY | med |
| RC-38 | `plus.recap.others_line` | <span dir="rtl">محسوب كباقٍ: الفارق ناقص القائد والتبديل. لم يُقَس بعد لاعباً بلاعب.</span> | Contains تبديل (see RC-23). “محسوب كباقٍ” and “ناقص” are stiff calques of the French. | <span dir="rtl">الباقي محسوب: الفارق بعد طرح القائد والانتقال. لم يُحسب بعد لاعبًا لاعبًا.</span> | ERROR-LIKELY | high |
| RC-42 | `plus.recap.part_hit` | <span dir="rtl">الغرامة {n}</span> | Same as RC-34. | <span dir="rtl">الخصم {n}</span> | ERROR-LIKELY | med |
| RC-45 | `plus.recap.pending_many` | <span dir="rtl">{n} لاعبين: تقييمات بانتظار النشر</span> | Used for every count from 2 (`PlusRecapSection.tsx:533`). “2 لاعبين” is wrong (لاعبان), and so is 11 and over (لاعبًا). | <span dir="rtl">لاعبون بانتظار التقييم: {n}</span> | ERROR-LIKELY | high |
| RC-46 | `plus.recap.bench_note` | <span dir="rtl">الاحتياط: {pts} نقطة غير محتسبة</span> | Same as RC-20. | <span dir="rtl">نقاط الاحتياط غير المحتسبة: {pts}</span> | DOUBT | med |
| RC-47 | `plus.recap.bench_note_boost` | <span dir="rtl">الاحتياط: {pts} نقطة محتسبة (تعزيز الاحتياط)</span> | Same as RC-20. | <span dir="rtl">نقاط الاحتياط المحتسبة (تعزيز الاحتياط): {pts}</span> | DOUBT | med |
| RC-49 | `plus.recap.league_note` | <span dir="rtl">معدل دوريك الخاص ({n} مدربين). تصل التقييمات بعد 5 إلى 16 يوماً من المباراة.</span> | “{n} مدربين” is right for 3 to 10 only; private leagues of 11 and more get “12 مدربين”. Older tanwin يوماً. | <span dir="rtl">معدل دوريك الخاص (عدد المدربين: {n}). تصل التقييمات بعد 5 إلى 16 يومًا من المباراة.</span> | DOUBT | med |
| RC-58 | `plus.recap.share_message` | <span dir="rtl">جولتي {n} على بوطولاجو: {points} نقطة.</span> | Brand in Arabic letters, spelled differently from TR-57 (بوطولا جو); 124 other strings keep BotolaGO in Latin. | <span dir="rtl">جولتي {n} على BotolaGO: {points} نقطة.</span> | ERROR-LIKELY | med |
| RC-60 | `plus.recap.image_alt` | <span dir="rtl">جولتي {n} مشروحة</span> | Same as RC-01. | <span dir="rtl">شرح جولتي {n}</span> | DOUBT | low |
| RC-61 | `plus.recap.share_waiting` | <span dir="rtl">{n} تقييم بانتظار النشر</span> | Used for every count from 1 (`PlusRecapSection.tsx:314`). Singular after 2 to 10 is wrong; “1 تقييم” is unidiomatic (تقييم واحد). | <span dir="rtl">تقييمات بانتظار النشر: {n}</span> | ERROR-LIKELY | high |
| RC-66 | `plus.recap.season_title` | <span dir="rtl">موسمك حتى الآن: {pts} نقطة، {rank} بعد {n} جولات</span> | “{n} جولات” is right for 3 to 10 only; the Botola season has 30 rounds, so from round 11 most of the season reads “بعد 14 جولات”. | Add forms (many: <span dir="rtl">بعد {n} جولة</span>), or <span dir="rtl">موسمك حتى الآن: {pts} نقطة، {rank}، بعد {n} من الجولات</span> | ERROR-LIKELY | high |
| RC-67 | `plus.recap.season_title_plain` | <span dir="rtl">موسمك حتى الآن: {pts} نقطة بعد {n} جولات</span> | Same as RC-66. | Same fix as RC-66: <span dir="rtl">موسمك حتى الآن: {pts} نقطة بعد {n} من الجولات</span> | ERROR-LIKELY | high |
| RC-70 | `plus.recap.tile_best_transfer` | <span dir="rtl">أفضل تبديل</span> | Same as RC-23. | <span dir="rtl">أفضل انتقال</span> | ERROR-LIKELY | high |
| RC-71 | `plus.recap.tile_worst_transfer` | <span dir="rtl">التبديل الأكثر كلفة</span> | Same as RC-23. | <span dir="rtl">الانتقال الأكثر كلفة</span> | ERROR-LIKELY | high |
| RC-74 | `plus.recap.tile_captain_v` | <span dir="rtl">{k} جولات من {n}</span> | Fixed plural after {k}: wrong for k = 1, 2 and 11+. The tile title already says what is counted. | <span dir="rtl">{k} من أصل {n}</span> | DOUBT | med |
| RC-75 | `plus.recap.tile_hits` | <span dir="rtl">الغرامات</span> | Same as RC-34. | <span dir="rtl">نقاط الخصم</span> | ERROR-LIKELY | med |
| RC-76 | `plus.recap.tile_hits_v` | <span dir="rtl">{k}، {pts} نقطة</span> | Hit totals are 4, 8, 12…; “4 نقطة” and “8 نقطة” are wrong. | Add forms, or <span dir="rtl">{k}، مجموع الخصم: {pts}</span> | DOUBT | med |
| RV-05 | `plus.rv.pts` | <span dir="rtl">{n} نقطة</span> | Fixed “نقطة”; mostly totals of 100 and over (right), but a single round of 3 to 10 would be wrong. | Keep, or add forms | DOUBT | low |
| RV-33 | `plus.rv.big_gap` | <span dir="rtl">أكبر فارق: {margin} (ج{n}، {a}–{b})</span> | “ج” for الجولة is not a common abbreviation; readers may not decode it. The briefing spells الجولة out. | <span dir="rtl">أكبر فارق: {margin} (الجولة {n}، {a}–{b})</span> | DOUBT | low |
| RV-36 | `plus.rv.captains` | <span dir="rtl">قادة الجولة {n}</span> | “قادة الجولة” reads as “the leaders of round n” as easily as “the captains”. | <span dir="rtl">القادة في الجولة {n}</span> | DOUBT | low |
| RV-42 | `plus.rv.share_msg_level` | <span dir="rtl">… في المجموع نحن متعادلان أنا و{name}.</span> | “نحن متعادلان أنا و…” doubles the subject; the sheet already asks. | <span dir="rtl">الجولة {n}: {a} مقابل {b}. في المجموع، أنا و{name} متعادلان.</span> | DOUBT | med |
| BR-01 | `plus.ctx.briefing` | <span dir="rtl">حضّر فريقك قبل آخر أجل، قرارًا بعد قرار</span> | “آخر أجل” (natural in Moroccan administrative Arabic) while 32 strings, the Fantasy e-mails and notifications say الموعد النهائي. Pick one; this pre-read recommends الموعد النهائي. | <span dir="rtl">حضّر فريقك قبل الموعد النهائي، قرارًا بعد قرار</span> | DOUBT | med |
| BR-02 | `plus.brief.meta` | <span dir="rtl">إحاطة ما قبل آخر أجل — BotolaGO Fantasy</span> | Same as BR-01. (“إحاطة” is formal, “briefing” in a news or UN sense; acceptable.) | <span dir="rtl">إحاطة ما قبل الموعد النهائي — BotolaGO Fantasy</span> | DOUBT | med |
| BR-03 | `plus.brief.meta_description` | <span dir="rtl">إحاطتك قبل آخر أجل: …</span> | Same as BR-01. | <span dir="rtl">إحاطتك قبل الموعد النهائي: الغيابات المعلنة، البدلاء ضمن ميزانيتك، القائد وكلفة الانتقالات.</span> | DOUBT | med |
| BR-04 | `plus.brief.aria` | <span dir="rtl">إحاطة ما قبل آخر أجل</span> | Same as BR-01. | <span dir="rtl">إحاطة ما قبل الموعد النهائي</span> | DOUBT | med |
| BR-07 | `plus.brief.title` | <span dir="rtl">إحاطة {gw} — آخر أجل {date} على {time}</span> | Same as BR-01. Bare “على {time}” is colloquial (Darija “على 6”); Moroccan written Arabic says “على الساعة”. | <span dir="rtl">إحاطة {gw} — الموعد النهائي {date} على الساعة {time}</span> | DOUBT | med |
| BR-08 | `plus.brief.title_nodate` | <span dir="rtl">إحاطتك قبل آخر أجل</span> | Same as BR-01. | <span dir="rtl">إحاطتك قبل الموعد النهائي</span> | DOUBT | med |
| BR-09 | `plus.brief.passed` | <span dir="rtl">انتهى آخر أجل. تعود الإحاطة مع الجولة المقبلة.</span> | Same as BR-01. | <span dir="rtl">انقضى الموعد النهائي. تعود الإحاطة مع الجولة المقبلة.</span> | DOUBT | med |
| BR-21 | `plus.brief.locked_title` | <span dir="rtl">إحاطتك قبل آخر أجل</span> | Same as BR-01. | <span dir="rtl">إحاطتك قبل الموعد النهائي</span> | DOUBT | med |
| BR-32 | `plus.brief.chg_rank` | <span dir="rtl">ترتيبك انتقل من {from} إلى {rank} من {size}</span> | انتقل is the transfer word in this app; a rank “changes”. | <span dir="rtl">تغيّر ترتيبك من {from} إلى {rank} من أصل {size}</span> | DOUBT | low |
| BR-35 | `plus.brief.tab_replace` | <span dir="rtl">تعويض</span> | تعويض first reads as “compensation”. استبدال is taken (substitutions); the same screen calls replacements البدلاء (BR-03, BR-97). | <span dir="rtl">البدلاء</span> | DOUBT | med |
| BR-45 | `plus.brief.abs_noinfo` | <span dir="rtl">لا معلومة مؤكدة · {n} دقيقة في {gw}</span> | Fixed “دقيقة”: wrong for 3 to 10 minutes (دقائق), common for late substitutes. | <span dir="rtl">لا معلومة مؤكدة · دقائق اللعب في {gw}: {n}</span> | DOUBT | low |
| BR-53 | `plus.brief.swap_title` | <span dir="rtl">تعويض {name}</span> | Same as BR-35. | <span dir="rtl">بديل لـ{name}</span> | DOUBT | med |
| BR-54 | `plus.brief.swap_pick` | <span dir="rtl">اللاعب المراد تعويضه</span> | Same as BR-35. | <span dir="rtl">اللاعب المراد تغييره</span> | DOUBT | med |
| BR-57 | `plus.brief.swap_none` | <span dir="rtl">لا يوجد لاعب في هذا المركز ضمن ميزانيتك وحد النادي.</span> | “حد النادي” (the club's limit) is opaque; the rule is the maximum number of players from one club. | <span dir="rtl">لا يوجد لاعب في هذا المركز ضمن ميزانيتك والحد الأقصى للاعبي النادي الواحد.</span> | DOUBT | low |
| BR-60 | `plus.brief.club_after` | <span dir="rtl">النادي {k}/{n} بعد الانتقال</span> | “The club k/n” does not say that k players of that club are in the squad. | <span dir="rtl">لاعبو النادي نفسه: {k}/{n} بعد الانتقال</span> | DOUBT | low |
| BR-63 | `plus.brief.cost_second` | <span dir="rtl">انتقال ثانٍ: −{pts} في {gw}</span> | Same minus-sign rendering risk as T-24 ({pts} is not isolated). | <span dir="rtl">انتقال ثانٍ: خصم {pts} في {gw}</span> | DOUBT | med |
| BR-71 | `plus.brief.cap_title` | <span dir="rtl">قائد {gw}: قارن على الجولات المنشورة</span> | “قارن على” is not idiomatic. | <span dir="rtl">قائد {gw}: قارن بناءً على الجولات المنشورة</span> | DOUBT | low |
| BR-74 | `plus.brief.cap_total` | <span dir="rtl">المجموع المنشور · {k}/{n} جولات</span> | Fixed plural after a fraction; n reaches 30. | <span dir="rtl">المجموع المنشور · الجولات: {k}/{n}</span> | DOUBT | med |
| BR-79 | `plus.brief.cap_nofixture` | <span dir="rtl">الخصم المقبل غير متاح</span> | الخصم is also the glossary word for a points hit (“the next deduction”), and “غير متاح” suggests unavailable rather than unknown. | <span dir="rtl">الفريق المنافس المقبل غير معروف</span> | DOUBT | low |
| BR-87 | `plus.brief.conf_low` | <span dir="rtl">تقدير · ثقة ضعيفة</span> | The usual opposite of “ثقة عالية” (BR-85) is “منخفضة”. | <span dir="rtl">تقدير · ثقة منخفضة</span> | DOUBT | low |
| BR-92 | `plus.brief.tr_many` | <span dir="rtl">{n} انتقالات</span> | Used from 3 up (`PlusBriefing.tsx:1151`). A Wildcard round can reach 11 to 15 transfers, where Arabic needs انتقالًا. | Add a many form <span dir="rtl">{n} انتقالًا</span>, or <span dir="rtl">الانتقالات: {n}</span> | DOUBT | med |
| BR-94 | `plus.brief.tr_honest` | <span dir="rtl">… لا تخصم Wildcard ولا Free Hit أي نقطة.</span> | Latin chip names inside Arabic; the approved names are الورقة الحرة and الضربة الحرة (pinned by `fantasy-glossary-ar.test.ts`). | <span dir="rtl">كل انتقال يتجاوز الانتقالات المجانية يخصم نقاطًا من مجموعك في {gw}. لا تخصم الورقة الحرة ولا الضربة الحرة أي نقطة.</span> | ERROR-LIKELY | med |
| TR-13 | `plus.tr.gw` | <span dir="rtl">ج{n}</span> | Same as RV-33. If space forces an abbreviation, a native should confirm “ج” is recognised. | <span dir="rtl">الجولة {n}</span> | DOUBT | low |
| TR-21 | `plus.tr.unit_gameweeks` | <span dir="rtl">جولات</span> | Unit label under a large figure; reads “12 جولات” for counts of 11 and over. Label use makes this tolerable. | Keep as a label, or use forms | DOUBT | low |
| TR-43 | `plus.tr.locked_tag` | <span dir="rtl">مع الموسم</span> | “With the season”: الموسم alone does not say it is the paid offer. See “Saison”. | <span dir="rtl">مع موسم BotolaGO+</span> | DOUBT | med |
| TR-57 | `plus.tr.share_message` | <span dir="rtl">كأسي «{label}» على بوطولا جو، فانتازي البطولة الاحترافية.</span> | Same as RC-58, with a third spelling (two words). | <span dir="rtl">كأسي «{label}» على BotolaGO، فانتازي البطولة الاحترافية.</span> | ERROR-LIKELY | med |
| TR-59 | `plus.tr.frames_title` | <span dir="rtl">اختر إطار بطاقتك من بين {n} أُطر ربحتها</span> | Used for every count except 1 (`TrophyFrames.tsx:55`), so “من بين 2 أُطر” appears (should be إطارين), and 11 and over would need إطارًا. | <span dir="rtl">اختر إطار بطاقتك من بين الأُطر التي ربحتها ({n})</span> | ERROR-LIKELY | med |
| TR-64 | `plus.tr.to_earn` | <span dir="rtl">للكسب</span> | “For earning”: not idiomatic as a status tag. | <span dir="rtl">قابل للربح</span> | DOUBT | med |
| TR-65 | `plus.tr.frames_note` | <span dir="rtl">… من دون الموسم تعود البطاقة إلى الإطار العادي، وتبقى كؤوسك.</span> | Same as TR-43. | <span dir="rtl">يظهر إطارك أينما ظهرت بطاقتك. من دون موسم BotolaGO+ تعود البطاقة إلى الإطار العادي، وتبقى كؤوسك.</span> | DOUBT | low |
| TR-73 | `plus.tr.in_progress` | <span dir="rtl">قيد التقدّم</span> | Literal “in progress”; unusual as a status tag. | <span dir="rtl">جارٍ</span> (or <span dir="rtl">قيد الإنجاز</span>) | DOUBT | low |
| TR-75 | `plus.tr.prog_rank_none` | <span dir="rtl">… في دوري خاص يضم 3 مدراء أو أكثر.</span> | مدراء clashes with مدربين used for managers everywhere else, and is a plural careful writers avoid (مديرون). | <span dir="rtl">تُمنح في نهاية الموسم، في دوري خاص يضم 3 مدربين أو أكثر.</span> | ERROR-LIKELY | high |
| TR-76 | `plus.tr.rule_season_end` | <span dir="rtl">منصة الدوري وبطله: …</span> | “منصة الدوري” (the league's platform) does not clearly say podium; منصة التتويج does. | <span dir="rtl">منصة التتويج ولقب بطل الدوري: يُمنحان في نهاية الموسم، بحسب الترتيب النهائي.</span> | DOUBT | low |
| TR-78 | `plus.tr.vis_hint` | <span dir="rtl">يرى مدراء دورياتك الخاصة الكؤوس التي ربحتها، وليس نقاطك أو تقييماتك أو مستوياتك. ولا أحد غيرهم.</span> | Same as TR-75. Privacy promise: “jamais” is weaker as “وليس”; the suggestion keeps “never”. | <span dir="rtl">يرى مدربو دورياتك الخاصة الكؤوس التي ربحتها، ولا يرون أبدًا نقاطك أو تقييماتك أو مستوياتك. ولا أحد غيرهم.</span> | ERROR-LIKELY | high |
| TR-86 | `plus.tr.mate_note` | <span dir="rtl">تظهر الكؤوس المربوحة فقط، …</span> | “المربوحة” is rare and sounds colloquial. | <span dir="rtl">تظهر الكؤوس التي رُبحت فقط، وليس النقاط ولا التقييمات ولا المستويات.</span> | DOUBT | low |
| SE-02 | `plus.s2.cta` | <span dir="rtl">اكتشف الموسم</span> | The offer called “Saison” becomes الموسم, which is first the football season. Alone on a button it says “discover the season”. See “Saison”. | <span dir="rtl">اكتشف موسم BotolaGO+</span> | DOUBT | med |
| SE-07 | `plus.s3.feat_title` | <span dir="rtl">ما يتضمنه الموسم</span> | Same as SE-02. | <span dir="rtl">ما يتضمنه موسم BotolaGO+</span> | DOUBT | med |
| SE-08 | `plus.pay.title` | <span dir="rtl">ادفع موسمي</span> | “Pay my season” is an odd collocation in Arabic (one pays for something, or pays its price). | <span dir="rtl">ادفع ثمن موسمي</span> | DOUBT | med |
| SE-18 | `plus.pay.cash_t` | <span dir="rtl">كاش بلس / وفاكاش</span> | Phonetic brand names; check against the brands' own Arabic signage, or keep the Latin names the reader will see on the agency. | <span dir="rtl">CashPlus / Wafacash</span> | DOUBT | low |
| SE-19 | `plus.pay.cash_d` | <span dir="rtl">أودع المبلغ في الوكالة باسم:</span> | “في الوكالة” (the agency) is definite; the French means any agency. | <span dir="rtl">أودع المبلغ في إحدى الوكالات باسم:</span> | DOUBT | low |
| SE-22 | `plus.pay.code_d` | <span dir="rtl">اكتبه في خانة سبب التحويل أو أعطه للوكالة.</span> | Banking forms call the field “البيان”; “أعطه للوكالة” (give it to the agency) is loose. | <span dir="rtl">اكتبه في خانة بيان التحويل أو قدّمه لموظف الوكالة.</span> | DOUBT | low |
| SE-29 | `plus.s3.cta` | <span dir="rtl">ادفع موسمي</span> | Same as SE-08. | <span dir="rtl">ادفع ثمن موسمي</span> | DOUBT | med |
| SE-30 | `plus.s3.terms_link` | <span dir="rtl">شروط الموسم</span> | Same as SE-02. | <span dir="rtl">شروط موسم BotolaGO+</span> | DOUBT | med |
| SE-34 | `plus.terms.norenew` | <span dir="rtl">لا شيء يُعاد من تلقاء نفسه: لا خصم تلقائي ولا شيء يحتاج إلى إلغاء.</span> | Money promise. “يُعاد” (is repeated) does not clearly say “renewed”; خصم is the Fantasy points-hit word, a bank debit is اقتطاع. | <span dir="rtl">لا تجديد تلقائي: لا اقتطاع تلقائي ولا شيء تحتاج إلى إلغائه.</span> | DOUBT | med |
| SE-40 | `plus.page.member_body` | <span dir="rtl">موسمك فعّال. تجده في الملف الشخصي.</span> | فعّال means “effective”; a switched-on status is مفعّل (13 strings, e.g. N-07, الجوكر المفعّل). | <span dir="rtl">موسمك مفعّل. تجده في الملف الشخصي.</span> | DOUBT | med |
| SE-41 | `plus.in.member_aria` | <span dir="rtl">موسم {name} فعّال</span> | Same as SE-40. | <span dir="rtl">موسم {name} مفعّل</span> | DOUBT | med |
| SE-43 | `plus.profile.active_line` | <span dir="rtl">موسمك 2026/27 فعّال · حتى {date}</span> | Same as SE-40. | <span dir="rtl">موسمك 2026/27 مفعّل · حتى {date}</span> | DOUBT | med |
| SE-44 | `plus.profile.active_nodate` | <span dir="rtl">موسمك 2026/27 فعّال</span> | Same as SE-40. | <span dir="rtl">موسمك 2026/27 مفعّل</span> | DOUBT | med |
| SE-45 | `plus.profile.ended` | <span dir="rtl">انتهى موسمك</span> | Same as SE-02: “your season is over” can be read about football. | <span dir="rtl">انتهى موسمك في BotolaGO+</span> | DOUBT | med |
| SE-50 | `plus.hub.status_d` | <span dir="rtl">فعّال حتى {date}</span> | Same as SE-40. | <span dir="rtl">مفعّل حتى {date}</span> | DOUBT | med |
| SE-51 | `plus.hub.status_d_nodate` | <span dir="rtl">فعّال</span> | Same as SE-40. | <span dir="rtl">مفعّل</span> | DOUBT | med |
| SE-52 | `plus.hub.expired_line` | <span dir="rtl">انتهى موسم 2026/27 في {date}. …</span> | French says “your Saison”; without “your” the line reads as the football season having ended on that date. | <span dir="rtl">انتهى موسمك 2026/27 في {date}. عادت بطاقتك إلى الأسلوب الأساسي.</span> | DOUBT | low |
| SE-53 | `plus.hub.expired_nodate` | <span dir="rtl">انتهى موسم 2026/27. …</span> | Same as SE-52. | <span dir="rtl">انتهى موسمك 2026/27. عادت بطاقتك إلى الأسلوب الأساسي.</span> | DOUBT | low |
| SE-55 | `lock.curva.title.plus` | <span dir="rtl">أنشئ حسابك المجاني لتكتشف الموسم</span> | Same as SE-02. | <span dir="rtl">أنشئ حسابك المجاني لتكتشف موسم BotolaGO+</span> | DOUBT | med |

### Part 3. E-mail and database templates

<!-- prettier-ignore -->
| # | Source | Current Arabic | Issue | Suggested Arabic | Rating | Conf. |
| --- | --- | --- | --- | --- | --- | --- |
| E-02 | Prospects e-mail subject | <span dir="rtl">المواهب · {week}: توب 10 للشباب</span> | “توب 10”; see the Top 10 question. | <span dir="rtl">المواهب · {week}: أفضل 10 لاعبين شباب</span> | DOUBT | med |
| E-03 | Prospects e-mail subject (corrected) | <span dir="rtl">المواهب · {week}: توب 10 بعد التصحيح</span> | Same as E-02. | <span dir="rtl">المواهب · {week}: أفضل 10 بعد التصحيح</span> | DOUBT | med |
| E-05 | Prospects e-mail footer | <span dir="rtl">تتلقى هذه الرسالة لأنك اشتركت في المواهب، توب 10 الأسبوعي لشباب البطولة الاحترافية.</span> | Same as E-02; also “توب 10 الأسبوعي” puts a definite adjective after a borrowed, undeclined noun, and “subscribed to the talents” needs رسالة (as E-06 and E-08 have). | <span dir="rtl">تتلقى هذه الرسالة لأنك اشتركت في رسالة المواهب، قائمة أفضل 10 لاعبين شباب في البطولة الاحترافية كل أسبوع.</span> | DOUBT | med |
| D-01 | Bell title, migration 20261016100000 | <span dir="rtl">المواهب: توب 10 للأسبوع {{week}}</span> | Same as E-02. Changing it needs a new migration once applied. | <span dir="rtl">المواهب: أفضل 10 للأسبوع {{week}}</span> | DOUBT | med |
| D-19 | Trophy name, migration 20261015150000 | <span dir="rtl">منصة الدوري</span> | Same as TR-76. | <span dir="rtl">منصة تتويج الدوري</span> | DOUBT | low |

### Part 4. Staff-only admin console

Hard-coded in `src/components/admin/plus/PlusAdminScreen.tsx` and `plus-presentation.ts`.

<!-- prettier-ignore -->
| # | Source | Current Arabic | Issue | Suggested Arabic | Rating | Conf. |
| --- | --- | --- | --- | --- | --- | --- |
| AD-01 | Admin console | <span dir="rtl">عدد الحسابات التي لها اشتراك: </span> | Narrower than the French (“a Saison or an old subscription”) and keeps the retired word اشتراك alone. | <span dir="rtl">عدد الحسابات التي لها موسم أو اشتراك سابق: </span> | DOUBT | low |
| AD-03 | Admin console | <span dir="rtl">البحث عن عضو</span> | “Member” under a heading that says account (AD-02); the sheet notes it. | <span dir="rtl">البحث عن حساب</span> | DOUBT | low |
| AD-08 | Admin console | <span dir="rtl">جارٍ تحميل العضو…</span> | Same as AD-03. | <span dir="rtl">جارٍ تحميل الحساب…</span> | DOUBT | low |
| AD-11 | Admin console | <span dir="rtl">موسم فعّال</span> | Same as SE-40. | <span dir="rtl">موسم مفعّل</span> | DOUBT | med |
| AD-12 | Admin console | <span dir="rtl">لا موسم فعّال</span> | Same as SE-40. | <span dir="rtl">لا موسم مفعّل</span> | DOUBT | med |
| AD-15 | Admin console | <span dir="rtl">… يمتد الموسم حتى نهاية الموسم الفانتازي.</span> | “الموسم الفانتازي” uses Fantasy as an adjective; the app elsewhere says موسم الفانتازي (AD-56, AD-74). | <span dir="rtl">بعد التحقق من الإيصال الذي أرسله المشتري عبر واتساب. يمتد الموسم حتى نهاية موسم الفانتازي.</span> | DOUBT | low |
| AD-24 | Admin console | <span dir="rtl">لا منحة لهذا الحساب.</span> | French says “no Saison and no offered access”; the Arabic only says “no grant”, so a paid Season is not covered. | <span dir="rtl">لا يوجد موسم ولا وصول ممنوح لهذا الحساب.</span> | DOUBT | low |
| AD-26 | Admin console | <span dir="rtl">بديل ثانوي، لمدة محددة (هدية، صحافة). لا يسجّل أي دفع.</span> | “بديل” (alternative) for “Action”. | <span dir="rtl">إجراء ثانوي، لمدة محددة (هدية، صحافة). لا يُسجَّل أي دفع.</span> | DOUBT | low |
| AD-49 | Admin console | <span dir="rtl">يصل إليه المشتري بالإيصال ورمزه.</span> | Reads “the buyer reaches him with the receipt”; the French says the number receives the receipt and code. | <span dir="rtl">يستقبل إيصال المشتري ورمزه.</span> | DOUBT | low |
| AD-53 | Admin console | <span dir="rtl">حفظ هذه البيانات؟ يراها كل مشتري فورًا ويدفع إليها. …</span> | Spelling: an indefinite final-weak noun drops its ي: كلُّ مشترٍ. “يدفع إليها” is loose. | <span dir="rtl">حفظ هذه البيانات؟ يراها كل مشترٍ فورًا ويدفع بناءً عليها. تحقق من الرقم والـ RIB. يُسجَّل الإجراء في التدقيق.</span> | ERROR-LIKELY | med |
| AD-73 | Admin console | <span dir="rtl">لهذا الحساب موسم ساري حتى نهاية الموسم: لا شيء لتفعيله.</span> | Same spelling rule: موسمٌ سارٍ. | <span dir="rtl">لهذا الحساب موسم سارٍ حتى نهاية الموسم: لا شيء لتفعيله.</span> | ERROR-LIKELY | med |
| AD-75 | Admin console | <span dir="rtl">انتهى الموسم الفانتازي: لا يمكن تفعيل الموسم.</span> | Same as AD-15; also drops “plus” (no longer). | <span dir="rtl">انتهى موسم الفانتازي: لم يعد ممكنًا تفعيل الموسم.</span> | DOUBT | low |
| AD-80 | Admin console | <span dir="rtl">البيانات غير صالحة. رقم واتساب من 8 إلى 16 رقمًا، ويمكن أن يبدأ بـ «+».</span> | Missing half of the French: the RIB rule. A staff member whose RIB is wrong gets a message about WhatsApp only. | <span dir="rtl">البيانات غير صالحة. رقم واتساب من 8 إلى 16 رقمًا، ويمكن أن يبدأ بـ «+»؛ والـ RIB من 10 إلى 40 حرفًا (أرقام وحروف ومسافات ونقاط وشرطات).</span> | ERROR-LIKELY | high |
| AD-85 | Admin console | <span dir="rtl">تفعيل الموسم للحساب {id} ({méthode}، المرجع {ref})؟ يصبح الموسم فعّالًا فورًا، …</span> | The French confirmation shows the end date before a paid Season is activated; the Arabic drops it, so an Arabic-reading staff member confirms without seeing it. Check that the code passes `{date}` to the Arabic line. Also فعّال (SE-40). | <span dir="rtl">تفعيل الموسم للحساب {id} ({méthode}، المرجع {ref}، حتى {date})؟ يصبح الموسم مفعّلًا فورًا، ويُسجَّل الإجراء في التدقيق.</span> | ERROR-LIKELY | med |

## Counted words: an answer per case

The sheet (Counts, “Fixed counted words”) asks for (a) keep, (b) add forms, or (c) reword, per case. Recommendation:

| Case                                                 | Rows                                                   | Recommendation                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| “نقطة” after a season total or a threshold           | RC-66, RC-67, RV-05, TR-30, TR-31, RC-69, D-15         | (a) keep: these numbers are almost always 11 or more, where نقطة is right.                                                              |
| “نقطة” after a round score                           | RC-06 to RC-09, RC-58                                  | (a) keep, low risk; (b) if the plural helper is added anyway.                                                                           |
| “نقطة” after bench points, a gain, a captain or hits | RC-20, RC-30, RC-31, RC-34, RC-35, RC-46, RC-47, RC-76 | (b) add forms, or (c) reword to a label (“نقاط الاحتياط: {pts}”). 3 to 10 is the common range here.                                     |
| “{n} لاعبين” in the recap                            | RC-45                                                  | (c) reword: “لاعبون بانتظار التقييم: {n}”. Used from 2 up, so it is wrong today for 2 and for 11 and over.                              |
| “{n} مدربين” (league size)                           | RC-49                                                  | (c) reword: “عدد المدربين: {n}”.                                                                                                        |
| “{n} جولات” (rounds)                                 | RC-66, RC-67                                           | (b) add forms; (c) “{n} من الجولات” if forms are not added. Wrong for most of the season as written.                                    |
| “{k} جولات من {n}”, “{k}/{n} جولات”                  | RC-74, BR-74                                           | (c) drop the noun: “{k} من أصل {n}”, “الجولات: {k}/{n}”.                                                                                |
| “{n} أُطر” (frames)                                  | TR-59                                                  | (c) reword: “من بين الأُطر التي ربحتها ({n})”. Used for 2 today.                                                                        |
| “عضو” after a member count                           | G-03                                                   | (b) add forms; (c) “من الأعضاء” as a fallback. Wrong for 3 to 10, the usual league size.                                                |
| “{n} من الكؤوس” (trophies)                           | TR-04, TR-82                                           | (a) keep. Grammatical for every n; a native may find it slightly bookish, but it is the right kind of workaround.                       |
| Countdown units أيام / ساعات / دقائق                 | BR-10 to BR-12                                         | (a) keep: plural labels under a countdown are a common convention. Rated OK.                                                            |
| Free transfers “other” for 100 and over              | T-05, T-27                                             | (a) keep: free transfers never exceed 2, so these lines cannot appear today; if they ever do, the text is right for 11 to 99. Rated OK. |

## Glossary inconsistencies

Term counts are over `src/i18n/dictionary-ar.ts` at `9e7056ad`.

1. **Transfer.** انتقال is the glossary word and is pinned by a test; the recap uses تبديل (RC-23, RC-33, RC-38, RC-70, RC-71). تبديل / استبدال already mean a substitution elsewhere (`matches.event.sub` “تبديل”, `fantasy.substitute` “استبدال”, `fantasy.points.auto_subs` “استبدالات تلقائية”). The briefing also uses the verb انتقل for a rank change (BR-32).
2. **Points hit.** خصم (`fantasy.points_hit` “خصم نقاط”, `fantasy.transfers.hit`, T-08) against غرامة in the recap (RC-34, RC-35, RC-42, RC-75). SE-34 uses خصم for a bank debit, which would then collide; اقتطاع avoids that.
3. **Manager.** مدرب / مدربين / مدربو (G-01, G-09, RC-49, RC-51, RV-59, RV-60) against مدراء (TR-75, TR-78).
4. **Deadline.** الموعد النهائي (32 strings, the Fantasy e-mails and notifications) against آخر أجل (8 strings, all in the briefing: BR-01 to BR-04, BR-07 to BR-09, BR-21).
5. **Top 10.** أفضل 10 (26 strings, page titles and share texts) against توب 10 (7 strings in the e-mail sign-up block `pepites.email.*`, plus E-02, E-03, E-05, D-01, and the link-preview title in `src/routes/pepites.index.tsx`, which `prospects-rename.test.ts` pins as “Prospects · المواهب — توب 10 | BotolaGO”).
6. **Brand.** BotolaGO in Latin (124 strings) against بوطولاجو (RC-58) and بوطولا جو (TR-57).
7. **Chip names.** The four approved Arabic names (pinned by test) against Latin “Wildcard”, “Free Hit” in BR-94 and P-24 (staff). Outside this sheet: the legal pages still say الرقاقات, as the sheet notes.
8. **Form against availability.** Fantasy: form = المستوى الأخير, availability = الجاهزية (both pinned). Prospects still calls form الجاهزية (`pepites.sort.form`, `pepites.method.inputs_title`, `pepites.method.*` formula lines), so the same Arabic word means two things in two sections.
9. **مستوى for two ideas.** Manager Card tiers are المستويات (TR-07, TR-33, TR-78, TR-86, D-11 to D-14) while form is المستوى الأخير. Low risk because the tiers always carry their names (ملعب, محترف, بطل, أسطورة), but worth knowing.
10. **Replace.** تعويض (BR-35, BR-53, BR-54) against البدلاء on the same screen (BR-03, BR-97) and استبدال (substitution) elsewhere.
11. **Active status.** مفعّل (13 strings: reminders, jokers) against فعّال (SE-40, SE-41, SE-43, SE-44, SE-50, SE-51, AD-11, AD-12, AD-85).
12. **Budget and bank.** الميزانية (T-12, BR-55) for the budget, الرصيد for the money in the bank (BR-55, BR-89) and also for the budget in T-11.
13. **The paid offer.** “Saison” is الموسم, the same word as the football season; see the open question below.
14. **Published.** نُشرت (RC-04) against نُشر (RV-09, TR-15, TR-63) for the same French “Publié le {date}”.
15. **Round abbreviation.** ج{n} (RV-33, TR-13) against الجولة {n} spelled out everywhere else, including BR-05 where the French has “J”.
16. **Account and member** in the admin console: حساب (AD-02, AD-10) against عضو (AD-03, AD-08).
17. **“Try again”** has three wordings in these rows: حاول مجددًا (N-02, N-03, V-05, V-10, V-11), أعد المحاولة (T-10, T-12, T-14, G-07, G-10 to G-12), حاول مرة أخرى (RV-61, TR-69, TR-81). Not wrong; one wording would be tidier. Not counted as DOUBT.
18. **“م” has two meanings** (outside this sheet): it is the price unit (`fantasy.players.price_unit`, millions) and also the short label for a home match (`fpl.home_short`, French “D”). Worth a glance where both can appear on one player card.

## Open questions in the sheet: recommended answers

### 1. Brand word المواهب (Prospects)

**Recommendation: keep المواهب, but only as a label on its own; in running text, give it a noun.**

- As a navigation label, section header, back link, tab title or e-mail kicker (X-06, X-07, X-09, X-10, X-13, X-17, X-20, X-21, E-04, E-07), المواهب reads as a section name, the way “الأخبار” or “المباريات” does. “المواهب قريبًا” (X-11) and “تعذّر تحميل المواهب” (X-12) are fine.
- Inside a sentence, as the object of a preposition or verb, the plain meaning “the talents” takes over: “اشتركت في المواهب” (subscribed to the talents), “{name} في المواهب” (name is in the talents). There, write the noun that is meant: رسالة المواهب (the e-mail), ترتيب المواهب (the ranking), قسم المواهب (the section). The sheet already does this in most rows (X-01 to X-04, X-14, X-19, E-06, E-08) and the rename test enforces it for two keys; X-05, X-23 and E-05 are the remaining cases.
- If the owner wants the name to stand out in running text, the Arabic guillemets already used for trophy names (« … ») would do it: «المواهب». Optional.

### 2. Top 10 spelling: أفضل 10 or توب 10

**Recommendation: أفضل 10 everywhere.**

- It is Modern Standard Arabic, already the majority form (26 strings against 7 plus the e-mail and bell texts), and matches the register of the rest of the app.
- توب is an English loan that Moroccan fans know from social media, but the app does not otherwise mix loanwords into MSA headings (the glossary removed الفورمة for the same reason).
- One phrase per idea also helps search engines and screen readers.
- Cost: `pepites.email.*` (7 strings), E-02, E-03, E-05, D-01 (a new migration if 20261016100000 is applied), and the link-preview constant in `src/routes/pepites.index.tsx` together with its assertion in `prospects-rename.test.ts`.

### 3. The word for form in the Prospects pages

**Recommendation: المستوى الأخير, as in Fantasy; keep الجاهزية only for availability.**

- The Prospects method defines the input as “the average of the last {window} rated matches” (`pepites.method.*`), which is exactly what المستوى الأخير (“recent form”) says. الجاهزية means readiness or fitness, and the Fantasy glossary (pinned by test) already uses it for availability.
- Lines to change, outside this sheet's rows: `pepites.sort.form`, `pepites.method.inputs_title` (“التقييم والمستوى الأخير”), the formula line (“المستوى الأخير {form}”) and the window line (“المستوى الأخير هو متوسط آخر {window} مباريات مُقيَّمة”). Note that “آخر {window} مباريات” and “{rated} مباريات” in those unchanged lines are themselves fixed plurals.
- BR-51 and BR-52 use “جاهز” for “available” (a player with no news is not necessarily available); that fits the availability sense and can stay.

### 4. The offer called “Saison” (sheet section 4)

Not asked as a question, but listed as an open difference. **Recommendation: write “موسم BotolaGO+” wherever الموسم alone could mean the football season**: buttons, links, headings and the locked tag (SE-02, SE-07, SE-30, SE-45, SE-55, TR-43, TR-65). Keep the short forms (موسمي, موسمك) inside the “Ma saison” section, where the screen gives the context (SE-37, SE-39, SE-47, SE-49, SE-54, rated OK). An alternative is “باقة الموسم” (the season pack); it is clearer but adds a new word the owner has not chosen.

### 5. Smaller questions the sheet asks

- **T-22, T-34 (dual).** T-22 “ستُجري انتقالين” is correct (accusative dual after the verb). T-34 is ambiguous; see the table.
- **T-20, T-31 (100 and over).** “ستُجري 100 انتقال”, “عرض 100 لاعب” are correct.
- **T-11, BR-89 (“م”).** Keep: it is the app's price unit. In a full sentence (T-11), “مليون” would be friendlier, but consistency with the price labels matters more.
- **BR-07 and the reminder templates (“قبل 12/10 18:30”).** Acceptable. “على الساعة” before a time is the usual Moroccan written form and reads better than bare “على”: “قبل 12/10 على الساعة 18:30”.
- **V-14, V-15 (2000).** Correct grammar (“أكثر من 2000 مقال”). Whether the browser prints 2000 or 2,000 depends on the number formatter, not on the wording.
- **M-01, M-02.** Keep M-01; see M-02 in the table.

## Conventions

- **Tanwin with alif.** The sheet's 10 rows with the older “اً” are L-03, L-04, L-06, L-09, RC-08, RC-27, RC-38, RC-49, RC-54, RC-65. The dictionary has 198 strings with “ًا” and 79 with “اً”. Recommendation: “ًا” (tanwin on the letter before the alif), the majority and the modern print convention. Cosmetic; these rows are rated OK unless they have another issue.
- **Final weak letters.** Two indefinite nouns keep a ي that should drop (AD-53 مشتري → مشترٍ, AD-73 ساري → سارٍ). The other rows already write جارٍ, ثانٍ, كباقٍ correctly.
- **Direction marks.** A-01 keeps its isolates around a–z, “-” and “\_”. In the recap, names and signed numbers are isolated in code, so the reversed arrow (RC-34 to RC-36, RC-72) should read out → in. The picker and briefing minus signs are not isolated (T-24 to T-28, BR-63). The score pair “{a}–{b}” (RV-33) will show the first score on the right in Arabic, which is the normal Arabic reading order; a native should confirm that the first number is the reader's own.
- **Masculine address** (فزت, سجّل, اختر) and Latin digits follow the app's stated convention and were not flagged.

## What this pre-read cannot guarantee

- **It is not native judgement.** Grammar rules, glossary consistency and faithfulness to the French can be checked reliably by a careful non-native reader. Naturalness, tone, what a Moroccan fan would actually say, and whether a phrase sounds stiff, bookish or slightly comic cannot. The DOUBT rows are where that judgement is most needed, but a phrase rated OK here can still sound wrong to a native ear.
- **It can be wrong in both directions.** Some DOUBT rows will turn out fine (particularly the register ones), and an error may sit in a row rated OK. Nothing in this document replaces the native reader's approval in the sheet.
- **Nothing was seen on a screen.** Direction, line breaks, truncation and how a badge sits next to a number were judged from the strings and the code, not measured. The minus-sign doubts (T-24 to T-28, BR-63) and the score order (RV-33) need a rendered check.
- **The suggestions are drafts.** They follow the app's existing words where possible, but each needs the native reader's approval, then the usual code change, with the i18n gate and glossary tests, in a separate piece of work.
- **Scope is the sheet.** Arabic outside the 697 rows (legal text, the frozen demo, older notification templates, articles) was not read, except where a glossary answer needed a look at the Prospects method lines.
