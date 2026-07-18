-- Phase 3B2a Part A: canonical mock↔cloud ID mapping.

-- 1) Canonical club provider_ids for existing rows.
UPDATE public.clubs SET provider_id = 'war'   WHERE slug = 'wydad' AND provider_id IS DISTINCT FROM 'war';
UPDATE public.clubs SET provider_id = 'rca'   WHERE slug = 'raja'  AND provider_id IS DISTINCT FROM 'rca';
UPDATE public.clubs SET provider_id = 'asfar' WHERE slug = 'asfar' AND provider_id IS DISTINCT FROM 'asfar';
UPDATE public.clubs SET provider_id = 'fus'   WHERE slug = 'fus'   AND provider_id IS DISTINCT FROM 'fus';
UPDATE public.clubs SET provider_id = 'rsb'   WHERE slug = 'rsb'   AND provider_id IS DISTINCT FROM 'rsb';
UPDATE public.clubs SET provider_id = 'mat'   WHERE slug = 'mca'   AND provider_id IS DISTINCT FROM 'mat';

-- 2) Create Hassania Agadir + Mouloudia Oujda rows if absent.
INSERT INTO public.clubs (slug, name_fr, name_ar, short_name_fr, short_name_ar, city_fr, city_ar, primary_color, provider_id, is_active)
SELECT 'hus', 'Hassania Agadir', 'حسنية أكادير', 'HUSA', 'الحسنية', 'Agadir', 'أكادير', '#e63900', 'hus', true
WHERE NOT EXISTS (SELECT 1 FROM public.clubs WHERE provider_id = 'hus' OR slug = 'hus');

INSERT INTO public.clubs (slug, name_fr, name_ar, short_name_fr, short_name_ar, city_fr, city_ar, primary_color, provider_id, is_active)
SELECT 'moas', 'Mouloudia Oujda', 'مولودية وجدة', 'MCO', 'المولودية', 'Oujda', 'وجدة', '#1e88e5', 'moas', true
WHERE NOT EXISTS (SELECT 1 FROM public.clubs WHERE provider_id = 'moas' OR slug = 'moas');

-- 3) Backfill provider_id on existing player rows matching (canonical club + name_fr).
WITH src(provider_id, club_source, name_fr, name_ar, position, price_millions, form, ownership_percent, total_points, status) AS (VALUES
  ('fp_war_1','war','Ahmed Reda Tagnaouti','أحمد رضا تكناوتي','GK',5.0,5.2,28.4,82,'available'),
  ('fp_war_2','war','Adam Aznou','آدم أزنو','DEF',4.9,5.6,15.1,74,'available'),
  ('fp_war_3','war','Yahya Attiat-Allah','يحيى عطية الله','DEF',6.2,6.4,42.1,87,'available'),
  ('fp_war_4','war','Mohamed Nahiri','محمد ناهيري','DEF',5.5,5.1,21.8,71,'doubtful'),
  ('fp_war_5','war','Reda Jaadi','رضا جعدي','MID',6.8,6.9,24.6,88,'available'),
  ('fp_war_6','war','Zouhair El Moutaraji','زهير المتراجي','MID',7.4,7.1,33.2,95,'available'),
  ('fp_war_7','war','Bouly Sambou','بولي سامبو','FWD',8.0,7.2,31.5,96,'available'),
  ('fp_war_8','war','Cassius Mailula','كاسيوس ماييولا','FWD',7.6,6.5,18.9,82,'available'),
  ('fp_rca_1','rca','Anas Zniti','أنس زنيتي','GK',4.8,4.9,19.7,76,'available'),
  ('fp_rca_2','rca','Mohsine Moutouali','محسن متولي','DEF',5.3,5.4,12.6,72,'available'),
  ('fp_rca_3','rca','Abdelhak Ben Nasser','عبد الحق بن ناصر','DEF',5.1,4.8,10.1,68,'available'),
  ('fp_rca_4','rca','Abdelilah Hafidi','عبد الإله حافظي','MID',7.1,6.2,24.3,82,'injured'),
  ('fp_rca_5','rca','Nassim Boujellab','نسيم بوجلاب','MID',6.9,6.4,22.0,84,'available'),
  ('fp_rca_6','rca','Ben Malango','بن مالانغو','FWD',8.9,7.9,38.4,104,'available'),
  ('fp_rca_7','rca','Ayoub El Kaabi','أيوب الكعبي','FWD',9.5,8.6,51.2,118,'available'),
  ('fp_rca_8','rca','Yassine Meriah','ياسين مرياح','DEF',4.6,4.5,8.4,61,'available'),
  ('fp_asfar_1','asfar','Anas Bach','أنس باش','GK',5.2,6.0,34.5,89,'available'),
  ('fp_asfar_2','asfar','Achraf Dari','أشرف داري','DEF',6.0,6.6,39.2,91,'available'),
  ('fp_asfar_3','asfar','Anass Salah-Eddine','أنس صلاح الدين','DEF',5.7,6.1,22.7,79,'available'),
  ('fp_asfar_4','asfar','Ismael Baouf','إسماعيل باعوف','DEF',4.9,5.3,14.0,70,'available'),
  ('fp_asfar_5','asfar','Mohamed Rabie Hrimat','محمد ربيع حريمات','MID',6.7,6.8,19.5,78,'available'),
  ('fp_asfar_6','asfar','Oussama Lamlaoui','أسامة لملاوي','MID',7.0,7.4,27.9,92,'available'),
  ('fp_asfar_7','asfar','Sabir Bougrine','صابر بوكرين','FWD',7.8,7.6,29.1,98,'available'),
  ('fp_fus_1','fus','Ayoub Lakred','أيوب لكرد','GK',4.4,4.6,6.8,63,'available'),
  ('fp_fus_2','fus','Marouane Saadane','مروان سعدان','DEF',4.5,4.7,5.9,62,'available'),
  ('fp_fus_3','fus','Youssef El Fahli','يوسف الفهلي','DEF',4.7,4.9,7.1,66,'available'),
  ('fp_fus_4','fus','Zakaria Draoui','زكرياء الدراوي','MID',6.0,6.0,12.3,74,'available'),
  ('fp_fus_5','fus','Reda Slim','رضا سليم','MID',6.4,6.3,15.4,80,'available'),
  ('fp_fus_6','fus','Ilias Haddad','إلياس حداد','FWD',7.2,6.9,18.3,85,'available'),
  ('fp_rsb_1','rsb','Munir Mohamedi','منير محمدي','GK',4.6,5.0,11.2,71,'available'),
  ('fp_rsb_2','rsb','Issoufou Dayo','إيسوفو دايو','DEF',5.4,5.7,17.8,76,'available'),
  ('fp_rsb_3','rsb','Mehdi Attouchi','مهدي عتوشي','DEF',5.0,5.2,9.6,69,'available'),
  ('fp_rsb_4','rsb','Bakr El Helali','بكر الهلالي','MID',6.5,6.5,20.5,81,'available'),
  ('fp_rsb_5','rsb','Youssef Mehri','يوسف مهري','MID',6.2,5.9,13.7,72,'available'),
  ('fp_rsb_6','rsb','Youssoupha Mbodji','يوسوفا مبودجي','FWD',7.5,7.0,24.4,90,'available'),
  ('fp_mat_1','mat','Mehdi Benabid','مهدي بنعبيد','GK',4.3,4.4,5.1,58,'available'),
  ('fp_mat_2','mat','Anass Serrhir','أنس السرغيني','DEF',4.4,4.6,5.5,60,'available'),
  ('fp_mat_3','mat','Mohamed Aabid','محمد عابد','MID',5.8,5.7,8.9,68,'suspended'),
  ('fp_mat_4','mat','Youssef Fakhr','يوسف فخر','FWD',6.8,6.2,12.6,74,'available'),
  ('fp_hus_1','hus','Mohamed Amsif','محمد أمصيف','GK',4.5,4.8,8.0,65,'available'),
  ('fp_hus_2','hus','Aziz Boura','عزيز بورة','DEF',4.6,4.8,6.4,64,'available'),
  ('fp_hus_3','hus','Mohamed Ali Bemammer','محمد علي بامامر','MID',6.1,6.0,14.2,76,'available'),
  ('fp_hus_4','hus','Karim El Berkaoui','كريم البركاوي','FWD',7.0,6.6,16.1,82,'available'),
  ('fp_moas_1','moas','Zouhir Laâroubi','زهير العروبي','GK',4.2,4.3,4.2,55,'available'),
  ('fp_moas_2','moas','Rabii Alhous','الربيع الحوس','DEF',4.5,4.6,6.0,61,'available'),
  ('fp_moas_3','moas','Amine Bassi','أمين باسي','MID',5.9,5.8,10.7,70,'available'),
  ('fp_moas_4','moas','Ayoub Nanah','أيوب نانا','FWD',6.5,6.0,11.4,71,'available')
)
UPDATE public.players p
SET provider_id = s.provider_id
FROM src s
JOIN public.clubs c ON c.provider_id = s.club_source
WHERE p.club_id = c.id
  AND p.name_fr = s.name_fr
  AND (p.provider_id IS NULL OR p.provider_id = s.provider_id);

-- 4) Idempotent upsert of all 47 canonical fantasy players by provider_id.
WITH src(provider_id, club_source, name_fr, name_ar, position, price_millions, form, ownership_percent, total_points, status) AS (VALUES
  ('fp_war_1','war','Ahmed Reda Tagnaouti','أحمد رضا تكناوتي','GK',5.0,5.2,28.4,82,'available'),
  ('fp_war_2','war','Adam Aznou','آدم أزنو','DEF',4.9,5.6,15.1,74,'available'),
  ('fp_war_3','war','Yahya Attiat-Allah','يحيى عطية الله','DEF',6.2,6.4,42.1,87,'available'),
  ('fp_war_4','war','Mohamed Nahiri','محمد ناهيري','DEF',5.5,5.1,21.8,71,'doubtful'),
  ('fp_war_5','war','Reda Jaadi','رضا جعدي','MID',6.8,6.9,24.6,88,'available'),
  ('fp_war_6','war','Zouhair El Moutaraji','زهير المتراجي','MID',7.4,7.1,33.2,95,'available'),
  ('fp_war_7','war','Bouly Sambou','بولي سامبو','FWD',8.0,7.2,31.5,96,'available'),
  ('fp_war_8','war','Cassius Mailula','كاسيوس ماييولا','FWD',7.6,6.5,18.9,82,'available'),
  ('fp_rca_1','rca','Anas Zniti','أنس زنيتي','GK',4.8,4.9,19.7,76,'available'),
  ('fp_rca_2','rca','Mohsine Moutouali','محسن متولي','DEF',5.3,5.4,12.6,72,'available'),
  ('fp_rca_3','rca','Abdelhak Ben Nasser','عبد الحق بن ناصر','DEF',5.1,4.8,10.1,68,'available'),
  ('fp_rca_4','rca','Abdelilah Hafidi','عبد الإله حافظي','MID',7.1,6.2,24.3,82,'injured'),
  ('fp_rca_5','rca','Nassim Boujellab','نسيم بوجلاب','MID',6.9,6.4,22.0,84,'available'),
  ('fp_rca_6','rca','Ben Malango','بن مالانغو','FWD',8.9,7.9,38.4,104,'available'),
  ('fp_rca_7','rca','Ayoub El Kaabi','أيوب الكعبي','FWD',9.5,8.6,51.2,118,'available'),
  ('fp_rca_8','rca','Yassine Meriah','ياسين مرياح','DEF',4.6,4.5,8.4,61,'available'),
  ('fp_asfar_1','asfar','Anas Bach','أنس باش','GK',5.2,6.0,34.5,89,'available'),
  ('fp_asfar_2','asfar','Achraf Dari','أشرف داري','DEF',6.0,6.6,39.2,91,'available'),
  ('fp_asfar_3','asfar','Anass Salah-Eddine','أنس صلاح الدين','DEF',5.7,6.1,22.7,79,'available'),
  ('fp_asfar_4','asfar','Ismael Baouf','إسماعيل باعوف','DEF',4.9,5.3,14.0,70,'available'),
  ('fp_asfar_5','asfar','Mohamed Rabie Hrimat','محمد ربيع حريمات','MID',6.7,6.8,19.5,78,'available'),
  ('fp_asfar_6','asfar','Oussama Lamlaoui','أسامة لملاوي','MID',7.0,7.4,27.9,92,'available'),
  ('fp_asfar_7','asfar','Sabir Bougrine','صابر بوكرين','FWD',7.8,7.6,29.1,98,'available'),
  ('fp_fus_1','fus','Ayoub Lakred','أيوب لكرد','GK',4.4,4.6,6.8,63,'available'),
  ('fp_fus_2','fus','Marouane Saadane','مروان سعدان','DEF',4.5,4.7,5.9,62,'available'),
  ('fp_fus_3','fus','Youssef El Fahli','يوسف الفهلي','DEF',4.7,4.9,7.1,66,'available'),
  ('fp_fus_4','fus','Zakaria Draoui','زكرياء الدراوي','MID',6.0,6.0,12.3,74,'available'),
  ('fp_fus_5','fus','Reda Slim','رضا سليم','MID',6.4,6.3,15.4,80,'available'),
  ('fp_fus_6','fus','Ilias Haddad','إلياس حداد','FWD',7.2,6.9,18.3,85,'available'),
  ('fp_rsb_1','rsb','Munir Mohamedi','منير محمدي','GK',4.6,5.0,11.2,71,'available'),
  ('fp_rsb_2','rsb','Issoufou Dayo','إيسوفو دايو','DEF',5.4,5.7,17.8,76,'available'),
  ('fp_rsb_3','rsb','Mehdi Attouchi','مهدي عتوشي','DEF',5.0,5.2,9.6,69,'available'),
  ('fp_rsb_4','rsb','Bakr El Helali','بكر الهلالي','MID',6.5,6.5,20.5,81,'available'),
  ('fp_rsb_5','rsb','Youssef Mehri','يوسف مهري','MID',6.2,5.9,13.7,72,'available'),
  ('fp_rsb_6','rsb','Youssoupha Mbodji','يوسوفا مبودجي','FWD',7.5,7.0,24.4,90,'available'),
  ('fp_mat_1','mat','Mehdi Benabid','مهدي بنعبيد','GK',4.3,4.4,5.1,58,'available'),
  ('fp_mat_2','mat','Anass Serrhir','أنس السرغيني','DEF',4.4,4.6,5.5,60,'available'),
  ('fp_mat_3','mat','Mohamed Aabid','محمد عابد','MID',5.8,5.7,8.9,68,'suspended'),
  ('fp_mat_4','mat','Youssef Fakhr','يوسف فخر','FWD',6.8,6.2,12.6,74,'available'),
  ('fp_hus_1','hus','Mohamed Amsif','محمد أمصيف','GK',4.5,4.8,8.0,65,'available'),
  ('fp_hus_2','hus','Aziz Boura','عزيز بورة','DEF',4.6,4.8,6.4,64,'available'),
  ('fp_hus_3','hus','Mohamed Ali Bemammer','محمد علي بامامر','MID',6.1,6.0,14.2,76,'available'),
  ('fp_hus_4','hus','Karim El Berkaoui','كريم البركاوي','FWD',7.0,6.6,16.1,82,'available'),
  ('fp_moas_1','moas','Zouhir Laâroubi','زهير العروبي','GK',4.2,4.3,4.2,55,'available'),
  ('fp_moas_2','moas','Rabii Alhous','الربيع الحوس','DEF',4.5,4.6,6.0,61,'available'),
  ('fp_moas_3','moas','Amine Bassi','أمين باسي','MID',5.9,5.8,10.7,70,'available'),
  ('fp_moas_4','moas','Ayoub Nanah','أيوب نانا','FWD',6.5,6.0,11.4,71,'available')
)
INSERT INTO public.players (provider_id, club_id, name_fr, name_ar, position, price_millions, form, ownership_percent, total_points, status, is_active)
SELECT s.provider_id, c.id, s.name_fr, s.name_ar, s.position, s.price_millions, s.form, s.ownership_percent, s.total_points, s.status, true
FROM src s
JOIN public.clubs c ON c.provider_id = s.club_source
ON CONFLICT (provider_id) DO UPDATE SET
  club_id = EXCLUDED.club_id,
  name_fr = EXCLUDED.name_fr,
  name_ar = EXCLUDED.name_ar,
  position = EXCLUDED.position,
  price_millions = EXCLUDED.price_millions,
  form = EXCLUDED.form,
  ownership_percent = EXCLUDED.ownership_percent,
  total_points = EXCLUDED.total_points,
  status = EXCLUDED.status,
  is_active = true,
  updated_at = now();