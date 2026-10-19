-- Production tkewgajrljbwgwedqsxn only. Manifest SHA256 323a2d23882d8dc8e8616811107157c9b17a5906284d11298eeec5e8e4b21128.
-- Identity adjudication is distinct from disputed bio/registration attributes. All 21 keep a new-purchase hold.
-- Rehearse, independently verify all 21 mappings/holds rolled back, then change only mode to apply.
begin;
set local lock_timeout='5s';set local statement_timeout='90s';
select set_config('bg.legacy_identity_repair_mode','rehearsal',true);
select app_private.hold_scheduled_jobs();
lock table app_private.fantasy_worker_lease in exclusive mode;
lock table app_private.football_provider_mappings,app_private.sofascore_player_aliases,app.players,app.fantasy_players,
 app.fantasy_teams,app.fantasy_squad_memberships,app.fantasy_lineups,app.fantasy_lineup_players,app.fantasy_transfer_batches in share mode;
create temporary table legacy_manifest(source_text text,data jsonb generated always as(source_text::jsonb)stored)on commit drop;
insert into legacy_manifest(source_text)values($legacy_manifest${
  "seasonId": "5ada3e98-2929-405a-a3f1-a26de8e51933",
  "ownerApproval": "Complete the legacy selection identity investigation and repair verified API identities while automatic rating recovery continues. No compensation or historical-seal rewrite.",
  "decisionScope": "One-time compatibility IDs only; provider ratings remain native-ID based. Identity adjudications do not certify disputed DOB or current registration. No new-purchase restriction is added relative to the previous unidentified state.",
  "expectedOwnedSlots": 48,
  "expectedOwningTeams": 7,
  "repairs": [
    {
      "footballPlayerId": "d88bb178-f18e-40bd-a42e-3aad9c2dc6a1",
      "fantasyPlayerId": "9f790bec-a898-4d49-801c-1dd79dba3046",
      "apiPlayerId": "919951",
      "expectedFullName": "Amine Dghoughi",
      "expectedDateOfBirth": "1992-01-16",
      "expectedFootballPosition": "midfielder",
      "legacySportsMonksId": "38209264",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/de/football/player/amine-dghoughi/919951",
        "catalogClub": "CODM Meknès",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Exact non-placeholder birth date and full-name identity in the legacy catalog and provider profile, with compatible role and corroborating club career/transfer history. Current registration is evaluated separately.",
        "disputed": ["Legacy club/registration requires separate review"]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "ddbe3f8d-250a-43ac-805f-6a32bfa280bb",
      "fantasyPlayerId": "5531d0d0-c683-4fca-8194-c9bec3ad729b",
      "apiPlayerId": "372340",
      "expectedFullName": "Ange-Freddy Plumain",
      "expectedDateOfBirth": "1995-03-02",
      "expectedFootballPosition": "forward",
      "legacySportsMonksId": "98559",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/ange-freddy-plumain/372340",
        "catalogClub": "Hassania Agadir",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Exact non-placeholder birth date and full-name identity in the legacy catalog and provider profile, with compatible role and corroborating club career/transfer history. Current registration is evaluated separately.",
        "disputed": ["Legacy club/registration requires separate review"]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "b34e3155-4a52-4af1-9d3b-ad435b13b03c",
      "fantasyPlayerId": "511ad5c2-b0e4-49f6-9ca9-a5f8e9252890",
      "apiPlayerId": "1592863",
      "expectedFullName": "Assane Beye",
      "expectedDateOfBirth": "2000-01-08",
      "expectedFootballPosition": "defender",
      "legacySportsMonksId": "37728439",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/assane-beye/1592863",
        "catalogClub": "Hassania Agadir",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Exact non-placeholder birth date and full-name identity in the legacy catalog and provider profile, with compatible role and corroborating club career/transfer history. Current registration is evaluated separately.",
        "disputed": ["Legacy club/registration requires separate review"],
        "rejectedAlternate": "1604919 has no matching DOB and retains the old HUSA header; do not choose a duplicate merely for its club."
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "fad1373f-0cc6-420e-8884-dfda138adad0",
      "fantasyPlayerId": "f2b874d0-92d1-4767-b476-0b2d5cbebe99",
      "apiPlayerId": "2625215",
      "expectedFullName": "Aymane Khatmi",
      "expectedDateOfBirth": null,
      "expectedFootballPosition": "midfielder",
      "legacySportsMonksId": "38217938",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/aymane-khatmi/2625215",
        "catalogClub": "Difaâ El Jadida",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Exact rare full name and Difaâ context across the legacy SportsMonks identity 38217938, fresh authorized main-club API squad and October 2 provider observation. The same provider ID is listed under a youth-team profile; that registration discrepancy does not establish a different person. Do not change the catalog DOB, height, role or club to force agreement.",
        "disputed": [
          "Catalog has no DOB",
          "Shirt 72 versus 91; provider forward versus fixed Fantasy midfielder",
          "Provider profile youth-team header and placeholder bio; registration remains held"
        ]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "4f27d68f-0c03-4c00-95f3-c60a63ac2556",
      "fantasyPlayerId": "7e319fc2-485f-409a-9072-a887109c2de7",
      "apiPlayerId": "1546502",
      "expectedFullName": "Ayoub Tine",
      "expectedDateOfBirth": "1992-06-03",
      "expectedFootballPosition": "defender",
      "legacySportsMonksId": "37548292",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/ayoub-tine/1546502",
        "catalogClub": "CR Khemis Zemamra",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Exact non-placeholder birth date and full-name identity in the legacy catalog and provider profile, with compatible role and corroborating club career/transfer history. Current registration is evaluated separately.",
        "disputed": ["Legacy club/registration requires separate review"]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "a833fed0-e3ae-4371-acbe-6f0f22ba2b11",
      "fantasyPlayerId": "560eeb07-46e1-4637-b14b-117ad048d64d",
      "apiPlayerId": "788833",
      "expectedFullName": "Dylan Saint-Louis",
      "expectedDateOfBirth": "1995-04-26",
      "expectedFootballPosition": "forward",
      "legacySportsMonksId": "96852",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/dylan-saint-louis/788833",
        "catalogClub": "Ittihad Tanger",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Exact non-placeholder birth date and full-name identity in the legacy catalog and provider profile, with compatible role and corroborating club career/transfer history. Current registration is evaluated separately.",
        "disputed": ["Legacy club/registration requires separate review"]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "6cca1601-45a3-49dc-b6b5-aaa3238f1c03",
      "fantasyPlayerId": "f92384af-6d20-4bad-9cef-08e970f0e9c3",
      "apiPlayerId": "919632",
      "expectedFullName": "Issa Sioudi",
      "expectedDateOfBirth": "1997-09-20",
      "expectedFootballPosition": "goalkeeper",
      "legacySportsMonksId": "37492378",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/sioudi-aissa/919632",
        "catalogClub": "CR Khemis Zemamra",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Exact non-placeholder birth date and full-name identity in the legacy catalog and provider profile, with compatible role and corroborating club career/transfer history. Current registration is evaluated separately.",
        "disputed": ["Legacy club/registration requires separate review"]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "88076e6e-67fb-405b-a051-4624dff1e19a",
      "fantasyPlayerId": "df17f9bd-fba5-43fd-a013-bea79c4a3950",
      "apiPlayerId": "1155596",
      "expectedFullName": "Mamadou Lamine Camara",
      "expectedDateOfBirth": "2003-01-05",
      "expectedFootballPosition": "midfielder",
      "legacySportsMonksId": "37603706",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/camara-mamadou-lamine/1155596",
        "catalogClub": "RSB Berkane",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Exact non-placeholder birth date and full-name identity in the legacy catalog and provider profile, with compatible role and corroborating club career/transfer history. Current registration is evaluated separately.",
        "disputed": ["Legacy club/registration requires separate review"]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "33ac7935-e72c-4feb-ae68-c49f64957b07",
      "fantasyPlayerId": "7826f553-cff9-4df1-8be8-b5797cdbcb02",
      "apiPlayerId": "1994372",
      "expectedFullName": "Marouane Oujeddou",
      "expectedDateOfBirth": "2004-01-21",
      "expectedFootballPosition": "forward",
      "legacySportsMonksId": "37905335",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/marouane-oujeddou/1994372",
        "catalogClub": "CR Khemis Zemamra",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Exact non-placeholder birth date and full-name identity in the legacy catalog and provider profile, with compatible role and corroborating club career/transfer history. Current registration is evaluated separately.",
        "disputed": ["Legacy club/registration requires separate review"]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "4fe5004e-07a5-4987-94b4-505c635b08b3",
      "fantasyPlayerId": "710c31d8-76c3-4d37-a46c-a67e0fb75ffe",
      "apiPlayerId": "1004256",
      "expectedFullName": "Mehdi Lemzaouri",
      "expectedDateOfBirth": "1993-07-07",
      "expectedFootballPosition": "defender",
      "legacySportsMonksId": "37317224",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/marouane-lemzaouri/1004256",
        "catalogClub": "Difaâ El Jadida",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Catalog SportsMonks ID 37317224 corresponds to the Mehdi/Marouane name variant; exact DOB 7 July 1993, 176cm and matching Difaâ/Oujda/Zemamra career corroborate one identity. First-name discrepancy is retained, not silently edited.",
        "disputed": [
          "Mehdi/Marouane first-name discrepancy",
          "Current registration/header conflict"
        ],
        "additionalSources": ["https://www.soccerpunter.com/player/37317224/Mehdi-Lemzaouri"]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "0e229394-bf99-455b-ac8a-8593b2e4c5f6",
      "fantasyPlayerId": "eefa1958-3687-4f57-9c1a-671598f8c17c",
      "apiPlayerId": "919342",
      "expectedFullName": "Mohammad El Fakih",
      "expectedDateOfBirth": "1990-02-07",
      "expectedFootballPosition": "midfielder",
      "legacySportsMonksId": "430362",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/mohammad-el-fakih/919342",
        "catalogClub": "CR Khemis Zemamra",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Exact full name and provider history through Tetouan and Zemamra to Dcheira. Current timeline matches the legacy Zemamra identity. January 1 is treated as no DOB signal. Older duplicate 2829014 is not selected or aliased.",
        "disputed": [
          "Provider January 1 DOB placeholder",
          "Older duplicate profile 2829014",
          "Current club outside the legacy listing"
        ]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "df3f5e1e-a65d-42f3-bd2b-0dc6603c034f",
      "fantasyPlayerId": "6c59efb2-70a9-4c29-a3a1-2e57ba1b194c",
      "apiPlayerId": "1424737",
      "expectedFullName": "Moises Paniagua",
      "expectedDateOfBirth": "2007-08-16",
      "expectedFootballPosition": "forward",
      "legacySportsMonksId": "37667163",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/paniagua-moises/1424737",
        "catalogClub": "Wydad Casablanca",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Exact international player name, Wydad and Always Ready career, Bolivian nationality and birth year; fresh Wydad API squad and October 2 observation agree on ID 1424737. The one-day DOB discrepancy is explicitly left unchanged.",
        "disputed": [
          "Provider DOB 15 versus catalog 16 August 2007",
          "Shirt 40 versus legacy 20; provider role differs from fixed Fantasy position"
        ]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "0615ab0f-2a4c-4b29-9000-b5097c429680",
      "fantasyPlayerId": "c99c399d-a3b7-4089-ac1b-325c24f0f65e",
      "apiPlayerId": "1170665",
      "expectedFullName": "Nadir Lougmani",
      "expectedDateOfBirth": "2002-08-26",
      "expectedFootballPosition": "forward",
      "legacySportsMonksId": "37614007",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/nadir-lougmani/1170665",
        "catalogClub": "Kawkab Marrakech",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Exact full name and legacy shirt 77; provider Kawkab-to-FAR history; fresh FAR squad and October 2 observation; provider ID also occurs as a confirmed unused player in FAR–Temara. Identity accepted despite disputed DOB; no birth date is corrected.",
        "disputed": [
          "DOB 22 versus 26 August 2002",
          "Legacy club and Fantasy position differ from current registration"
        ]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "712fce4e-a1b0-402c-bca7-841917c6f827",
      "fantasyPlayerId": "273ce0d4-41c3-4915-a4a6-03b612348151",
      "apiPlayerId": "1004433",
      "expectedFullName": "Reda Slim",
      "expectedDateOfBirth": "1999-10-25",
      "expectedFootballPosition": "midfielder",
      "legacySportsMonksId": "37308670",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/slim-reda/1004433",
        "catalogClub": "FAR Rabat",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Exact non-placeholder birth date and full-name identity in the legacy catalog and provider profile, with compatible role and corroborating club career/transfer history. Current registration is evaluated separately.",
        "disputed": ["Legacy club/registration requires separate review"]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "3d79ba5e-0e25-4b78-9a2f-38d29ffc02d5",
      "fantasyPlayerId": "5524935c-b3d1-493d-aa61-edca38b74281",
      "apiPlayerId": "2077076",
      "expectedFullName": "Takha Majni",
      "expectedDateOfBirth": null,
      "expectedFootballPosition": "defender",
      "legacySportsMonksId": "37950002",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/taha-majni/2077076",
        "catalogClub": "UTS Rabat",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Takha/Taha spelling variant explicitly adjudicated using the unique surname, Union Touarga history in the provider profile and Crystal Palace official signing notice of 7 September 2026. No catalog birth date is invented.",
        "disputed": [
          "Takha/Taha spelling",
          "Legacy UTS eligibility differs from current Palace U21 registration"
        ],
        "additionalSources": [
          "https://www.cpfc.co.uk/news/announcement/crystal-palace-academy-sign-taha-majni/"
        ]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "ec266d59-7cd5-4273-8bd9-1a715e5c357a",
      "fantasyPlayerId": "a9c91df5-dee5-4ceb-a423-de1e31253afa",
      "apiPlayerId": "919551",
      "expectedFullName": "Yahia El Filali",
      "expectedDateOfBirth": "1989-11-13",
      "expectedFootballPosition": "goalkeeper",
      "legacySportsMonksId": "16457402",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/fr/football/player/yahia-el-filali/919551",
        "catalogClub": "Moghreb Tétouan",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Exact non-placeholder birth date and full-name identity in the legacy catalog and provider profile, with compatible role and corroborating club career/transfer history. Current registration is evaluated separately.",
        "disputed": ["Legacy club/registration requires separate review"]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "ec1146d5-833c-44c6-b473-eb4f76f5a188",
      "fantasyPlayerId": "7aadc3e9-0166-49c1-8646-262b302358e3",
      "apiPlayerId": "1140915",
      "expectedFullName": "Yassine Belfada",
      "expectedDateOfBirth": "2000-01-01",
      "expectedFootballPosition": "midfielder",
      "legacySportsMonksId": null,
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/yassine-belfadla/1140915",
        "catalogClub": "Widad Témara",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Belfada/Belfadla transliteration variant explicitly adjudicated using the rare full name, Widad Temara history and the reported September move from Temara to Rapide Oued Zem, matching the provider timeline. January 1 is no DOB signal. Identity is separate from current eligibility.",
        "disputed": [
          "Belfada/Belfadla spelling",
          "Catalog January 1 DOB placeholder",
          "Legacy midfielder versus current forward; departed Temara"
        ],
        "additionalSources": [
          "https://www.golsport.net/2026/09/15/سريع-وادي-زم-يعلن-تعاقده-مع-عناصر-جديدة/"
        ]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "affe30bc-ad7d-4f52-a03e-1cd33b4c99f9",
      "fantasyPlayerId": "73ef8da7-7af7-4f29-b8f7-9c17c08fc3dd",
      "apiPlayerId": "1919273",
      "expectedFullName": "Yassine Fatine",
      "expectedDateOfBirth": "1996-12-05",
      "expectedFootballPosition": "defender",
      "legacySportsMonksId": "37772648",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/yassine-fatine/1919273",
        "catalogClub": "Difaâ El Jadida",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Exact non-placeholder birth date and full-name identity in the legacy catalog and provider profile, with compatible role and corroborating club career/transfer history. Current registration is evaluated separately.",
        "disputed": ["Legacy club/registration requires separate review"]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "194eb9e4-1f82-41e0-89c9-1d15d5fbb698",
      "fantasyPlayerId": "fdea9c0e-1080-4951-883c-ea3b77460904",
      "apiPlayerId": "1525362",
      "expectedFullName": "Youssef Lahouizi",
      "expectedDateOfBirth": null,
      "expectedFootballPosition": "goalkeeper",
      "legacySportsMonksId": null,
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/youssef-lahouizi/1525362",
        "catalogClub": "Amal Tiznit",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Exact full name and goalkeeper identity; provider profile DOB 16 July 1995, height 187 and documented Amal history corroborate the legacy Amal goalkeeper. No alternative same-name candidate was found. Current no-team header is a registration issue; catalog has no DOB signal.",
        "disputed": [
          "Catalog has no provider ID or DOB",
          "Current profile header has no team; legacy club eligibility remains held"
        ]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "ba1a16ad-9324-40a5-9abc-c5b0a662a944",
      "fantasyPlayerId": "1520dc2c-a2dd-40a8-b336-0370975ca89d",
      "apiPlayerId": "1009758",
      "expectedFullName": "Youssef Limouri",
      "expectedDateOfBirth": "1999-02-20",
      "expectedFootballPosition": "defender",
      "legacySportsMonksId": "37308651",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/youssef-limouri/1009758",
        "catalogClub": "CODM Meknès",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Exact non-placeholder birth date and full-name identity in the legacy catalog and provider profile, with compatible role and corroborating club career/transfer history. Current registration is evaluated separately.",
        "disputed": ["Legacy club/registration requires separate review"]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    },
    {
      "footballPlayerId": "bb102ca6-e285-4905-aee1-e44990bb8a9e",
      "fantasyPlayerId": "3865df67-3c53-4b46-9396-43e5289c51ca",
      "apiPlayerId": "1525336",
      "expectedFullName": "Youssef Tafay",
      "expectedDateOfBirth": null,
      "expectedFootballPosition": "goalkeeper",
      "legacySportsMonksId": "37352753",
      "evidence": {
        "provider": "sofascore",
        "profile": "https://www.sofascore.com/football/player/youssef-tafay/1525336",
        "catalogClub": "Amal Tiznit",
        "audit": "docs/backend/LEGACY_SELECTION_IDENTITY_AUDIT_20261019.md",
        "basis": "Exact full name, goalkeeper role and Amal squad context across the legacy catalog, fresh authorized API squad and actual Wydad–Amal match participant ID 1525336 (confirmed unused). This match evidence resolves identity independently of a conflicting current profile header.",
        "disputed": [
          "Missing shirt in the API squad",
          "Current profile and squad registration disagree"
        ]
      },
      "holdReason": "One-time identity repair restores scoring; current club, shirt and fixed Fantasy position listing remain under separate catalog review. Preserve existing ownership and prevent new purchases."
    }
  ]
}
$legacy_manifest$);
create temporary table repair_rows on commit drop as select x.*from legacy_manifest m cross join lateral jsonb_to_recordset(m.data->'repairs')x(
 "footballPlayerId" uuid,"fantasyPlayerId" uuid,"apiPlayerId"text,"expectedFullName"text,"expectedDateOfBirth"text,
 "expectedFootballPosition"text,"legacySportsMonksId"text,evidence jsonb,"holdReason"text);
do $$declare m jsonb;begin
 if exists(select 1 from app_private.fantasy_automation_settings where lifecycle_tick_enabled or lifecycle_worker_enabled)
 or exists(select 1 from app_private.notification_email_settings where football_live_refresh_enabled or mode<>'off')
 or exists(select 1 from app_private.fantasy_worker_lease where released_at is null and expires_at>statement_timestamp())
 or exists(select 1 from net.http_request_queue)then raise exception 'legacy_identity_writers_not_drained';end if;
 if exists(select 1 from app_private.account_deletion_settings where enabled)
 or exists(select 1 from app_private.manager_card_settings where compute_enabled)
 or exists(select 1 from app_private.rivals_settings where enabled)
 or exists(select 1 from app_private.trophy_settings where enabled)
 or exists(select 1 from app.account_deletion_requests where status='processing')then raise exception 'legacy_identity_dependent_writer_active';end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261019194059'and encode(extensions.digest(statements[1],'sha256'),'hex')='77b5d042cee91705691423a6c869baad95ed4389cb5c9fd06c5ad8837172cea5')then raise exception 'legacy_identity_controls_missing';end if;
 select data into m from legacy_manifest;
 if encode(extensions.digest((select source_text from legacy_manifest),'sha256'),'hex')<>'323a2d23882d8dc8e8616811107157c9b17a5906284d11298eeec5e8e4b21128'
 or m->>'seasonId'<>'5ada3e98-2929-405a-a3f1-a26de8e51933'
 or(select count(*)from repair_rows)<>21 or(select count(distinct "apiPlayerId")from repair_rows)<>21
 or not exists(select 1 from app_private.fantasy_api_rating_seasons where season_id=(m->>'seasonId')::uuid and from_gameweek=4)
 then raise exception 'legacy_identity_manifest_scope_changed';end if;
 if exists(select 1 from repair_rows r left join app.players p on p.id=r."footballPlayerId"
 left join app.fantasy_players fp on fp.id=r."fantasyPlayerId"
 where p.id is null or fp.id is null or fp.football_player_id is distinct from p.id or fp.fantasy_season_id is distinct from(m->>'seasonId')::uuid
 or p.full_name is distinct from r."expectedFullName"or p.date_of_birth::text is distinct from r."expectedDateOfBirth"
 or p.position::text is distinct from r."expectedFootballPosition")then raise exception 'legacy_identity_catalog_baseline_changed';end if;
 if exists(select 1 from repair_rows r where(select p.external_id from app_private.football_provider_mappings p
 where p.provider_name='sportsmonks'and p.entity_type='player'and p.internal_entity_id=r."footballPlayerId")is distinct from r."legacySportsMonksId")then raise exception 'legacy_identity_legacy_provider_changed';end if;
 if exists(select 1 from repair_rows r join app_private.football_provider_mappings p on p.provider_name='sofascore'and p.entity_type='player'
 and(p.internal_entity_id=r."footballPlayerId"or p.external_id=r."apiPlayerId"))
 or exists(select 1 from repair_rows r join app_private.sofascore_player_aliases a on a.player_id=r."footballPlayerId"or a.sofascore_player_id=r."apiPlayerId")
 or exists(select 1 from repair_rows r join app_private.fantasy_legacy_identity_repairs a on a.fantasy_player_id=r."fantasyPlayerId")
 then raise exception 'legacy_identity_existing_mapping_alias_or_repair';end if;
 if(select count(*)from app.fantasy_squad_memberships s join repair_rows r on r."fantasyPlayerId"=s.fantasy_player_id where s.sold_at is null)<>(m->>'expectedOwnedSlots')::integer
 or(select count(distinct s.fantasy_team_id)from app.fantasy_squad_memberships s join repair_rows r on r."fantasyPlayerId"=s.fantasy_player_id where s.sold_at is null)<>(m->>'expectedOwningTeams')::integer then raise exception 'legacy_identity_ownership_scope_changed';end if;
 perform g.id from app.fantasy_gameweeks g where g.fantasy_season_id=(m->>'seasonId')::uuid order by g.id for update;
 if exists(select 1 from app.fantasy_gameweeks where fantasy_season_id=(m->>'seasonId')::uuid and status='finalizing')then raise exception 'legacy_identity_finalization_active';end if;
end $$;
create temporary table legacy_before on commit drop as select 'players' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.players t
union all select 'catalog' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_players t
union all select 'teams' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_teams t
union all select 'squads' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_squad_memberships t
union all select 'lineups' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_lineups t
union all select 'lineup_players' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by lineup_id,fantasy_player_id),''))digest from app.fantasy_lineup_players t
union all select 'transfers' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_transfer_batches t
union all select 'results' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_team_gameweek_results t
union all select 'points' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by gameweek_id,fantasy_player_id),''))digest from app.fantasy_player_gameweek_points t
union all select 'seals' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by gameweek_id,calculation_version),''))digest from app_private.fantasy_scoring_snapshots t
union all select 'aliases' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app_private.sofascore_player_aliases t
union all select 'publications' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app_private.fantasy_rating_publications t
union all select 'sources' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app_private.fantasy_api_rating_sources t
union all select 'original_mappings',md5(coalesce(jsonb_agg(to_jsonb(t)order by id)::text,''))from app_private.football_provider_mappings t
union all select 'gameweek_state',md5(coalesce(jsonb_agg(to_jsonb(t)-'scoring_input_version'-'updated_at'order by id)::text,''))from app.fantasy_gameweeks t;
create temporary table legacy_week_versions on commit drop as select id,scoring_input_version,
 (fantasy_season_id='5ada3e98-2929-405a-a3f1-a26de8e51933'and sequence_number>=4
 and status in('scheduled','open','locked','live','provisional'))as should_bump from app.fantasy_gameweeks;
insert into app_private.football_provider_mappings(provider_name,entity_type,external_id,internal_entity_id,source_version,last_seen_at,active)
select 'sofascore','player',"apiPlayerId","footballPlayerId",'reviewed-legacy-identity-20261019',statement_timestamp(),true from repair_rows;
insert into app_private.fantasy_legacy_identity_repairs(fantasy_player_id,football_player_id,api_player_id,owner_approval,identity_evidence,catalog_before,hold_reason)
select r."fantasyPlayerId",r."footballPlayerId",r."apiPlayerId",m.data->>'ownerApproval',r.evidence,to_jsonb(fp),r."holdReason"
from repair_rows r join app.fantasy_players fp on fp.id=r."fantasyPlayerId"cross join legacy_manifest m;
-- Mapping inserts have no input-version trigger. Explicitly invalidate every
-- unfinished native week; preserve all historical sealed inputs and results.
update app.fantasy_gameweeks g set scoring_input_version=greatest(0,g.scoring_input_version)+1
where g.fantasy_season_id='5ada3e98-2929-405a-a3f1-a26de8e51933'and g.sequence_number>=4
and g.status in('scheduled','open','locked','live','provisional');
do $$begin
 if exists(select 1 from legacy_week_versions b join app.fantasy_gameweeks g on g.id=b.id
 where g.scoring_input_version is distinct from case when b.should_bump then greatest(0,b.scoring_input_version)+1 else b.scoring_input_version end)then raise exception 'legacy_identity_input_version_scope_changed';end if;
 if exists(select 1 from legacy_before b full join(select 'players' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.players t
union all select 'catalog' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_players t
union all select 'teams' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_teams t
union all select 'squads' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_squad_memberships t
union all select 'lineups' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_lineups t
union all select 'lineup_players' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by lineup_id,fantasy_player_id),''))digest from app.fantasy_lineup_players t
union all select 'transfers' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_transfer_batches t
union all select 'results' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app.fantasy_team_gameweek_results t
union all select 'points' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by gameweek_id,fantasy_player_id),''))digest from app.fantasy_player_gameweek_points t
union all select 'seals' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by gameweek_id,calculation_version),''))digest from app_private.fantasy_scoring_snapshots t
union all select 'aliases' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app_private.sofascore_player_aliases t
union all select 'publications' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app_private.fantasy_rating_publications t
union all select 'sources' name,md5(coalesce(string_agg(md5(to_jsonb(t)::text),''order by id),''))digest from app_private.fantasy_api_rating_sources t
 union all select 'original_mappings',md5(coalesce(jsonb_agg(to_jsonb(t)order by id)::text,''))from app_private.football_provider_mappings t
 where not(t.provider_name='sofascore'and t.entity_type='player'and t.internal_entity_id in(select "footballPlayerId"from repair_rows))
 union all select 'gameweek_state',md5(coalesce(jsonb_agg(to_jsonb(t)-'scoring_input_version'-'updated_at'order by id)::text,''))from app.fantasy_gameweeks t
 )a using(name)where a.digest is distinct from b.digest)then raise exception 'legacy_identity_unexpected_state_change';end if;
 if(select count(*)from app_private.fantasy_legacy_identity_repairs x join repair_rows r on r."fantasyPlayerId"=x.fantasy_player_id and r."apiPlayerId"=x.api_player_id)<>21
 or exists(select 1 from repair_rows r where app_private.fantasy_native_player_selectable(r."fantasyPlayerId"))then raise exception 'legacy_identity_new_purchase_hold_missing';end if;
 if current_setting('bg.legacy_identity_repair_mode')='rehearsal'then raise exception 'LEGACY_IDENTITY_REPAIR_REHEARSAL_PASSED: 21 identities, ownership/prices/lineups/seals preserved; all changes rolled back';end if;
 if current_setting('bg.legacy_identity_repair_mode')<>'apply'then raise exception 'legacy_identity_repair_invalid_mode';end if;
end $$;
commit;
select count(*)as repaired_identities,count(*)filter(where released_at is null)as purchase_holds from app_private.fantasy_legacy_identity_repairs;
