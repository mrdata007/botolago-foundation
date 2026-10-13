# BotolaGO project overview

## Overview

BotolaGO is a mobile-first French and Arabic platform for Moroccan football. It
combines Botola Pro news, live and historical match information, and a
season-long fantasy game in one consumer experience, with a separate secured
staff control plane. Guests can discover public content and evaluate the
Fantasy experience; authenticated users can persist profile, follow, saved
content, team, transfer, points, and league data. The production product must
use authoritative V2 data and fail closed when required data or permissions are
not available.

## Product actors

| Actor                 | Needs                                                  | Access boundary                                                |
| --------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| Anonymous visitor     | Understand BotolaGO and choose French or Arabic        | Public entry, news, matches, and selected Fantasy discovery    |
| Guest                 | Explore the product before registering                 | Deterministic guest state; no private cloud reads or writes    |
| Authenticated manager | Follow football and play Fantasy across devices        | Supabase Auth, owned data, RLS, and authoritative mutations    |
| Staff member          | Operate approved security and administration workflows | Explicit permission, MFA/AAL2, recent-auth, and audit controls |
| Release operator      | Promote reviewed changes and inspect evidence          | Protected GitHub environments and exact-SHA workflows          |

## Goals

1. Provide a complete French LTR and Arabic RTL journey for news, matches, and
   Fantasy at mobile, tablet, and desktop widths.
2. Let an authenticated manager create one valid 15-player team, manage the
   lineup and captaincy, preview and confirm transfers, inspect authoritative
   points, and participate in leagues without cross-account data leakage.
3. Keep live football, news, and Fantasy facts attributable to approved
   providers or server-owned calculations; never present mock, stale, or
   inferred values as live facts.
4. Make security enforceable at every layer through RLS, permission checks,
   idempotency, version checks, protected operational workflows, and sanitized
   evidence.
5. Produce a launch candidate that passes application, database, bilingual
   browser, staging, provider-readiness, capacity, and release-verification
   gates before production activation.

## Core consumer flow

1. The visitor opens BotolaGO and receives SSR-safe initial content.
2. On first launch, the visitor chooses French or Arabic; direction and
   typography update and persist on the device.
3. The visitor browses the home feed, news, matches, standings, and public
   Fantasy research.
4. When a private Fantasy action is required, BotolaGO requests authentication
   while preserving a sanitized same-application return route.
5. The user registers or signs in, verifies the account when required, and
   completes the profile and favourite-club setup.
6. A new manager names a team, selects the required squad within the active
   budget, position, and club rules, chooses a valid lineup, captain, and vice
   captain, reviews the result, and submits it.
7. Success appears only after the owned-team repository returns an authoritative
   persisted snapshot.
8. During the season the manager picks a team, previews and confirms transfers,
   inspects gameweek points and history, researches players and fixtures, and
   creates or joins leagues.
9. BotolaGO shows explicit loading, unavailable, empty, conflict, locked, live,
   provisional, final, corrected, and cancelled states as applicable.

## Staff flow

1. A staff user authenticates and enters the Admin route.
2. The server resolves staff identity, permissions, MFA/AAL2, and recent-auth
   state before returning bounded route access.
3. Authorized staff inspect or perform the permitted action.
4. Sensitive role changes use dual control where required.
5. Security-relevant actions and session revocations produce append-only audit
   evidence.

## Features

### Football and editorial

- Home feed with match, news, Fantasy, and followed-club context
- News categories, club filtering, follows, saves, sharing, article detail, and
  related stories
- Match calendar, live and completed fixtures, standings, timeline, lineups,
  statistics, head-to-head, and related news
- Provider-normalized team, competition, season, venue, player, and availability
  data

### Fantasy

- State-aware Fantasy hub and gameweek context
- Guided, resumable team creation with pitch and list representations
- Active rule, budget, position, club, formation, and deadline validation
- Captaincy, vice captaincy, bench order, chips, and version-safe lineup saves
- Transfer preview, free-transfer and point-hit calculation, confirmation, and
  conflict recovery
- Points, history, players, fixture difficulty, top players, rankings, leagues,
  and rules
- Owner- and source-scoped caches to prevent account-switch flashes

### Identity and profile

- Email/password account lifecycle, verification, recovery, and supported OAuth
- Sanitized return destinations
- Profile, favourite club, avatar, language, and notification preferences
- Deterministic mock authentication only in isolated demo/development modes

### Administration and operations

- Staff, roles, approvals, security, audit, and revocation controls
- Protected provider probes, ingestion, migration, activation, canary, capacity,
  and cleanup workflows
- Sanitized and bounded CI/runtime evidence

## Delivery status model

The repository uses one canonical lifecycle:

1. Proposed
2. Approved
3. In progress
4. Implemented
5. CI verified
6. Merged

Track Active, Blocked, Superseded, or Cancelled as a separate disposition.
Track preview deployment, preview certification, preview sharing, staging
execution, production migration, production Supabase API platform configuration,
production application deployment, production Identity configuration,
production Admin bootstrap/activation, bounded production data mutation,
production current-season initialization, production Fantasy catalog staging,
production Fantasy registration opening, production data/content provider
activation, production notification-delivery activation, production worker
activation, production schedule activation, post-launch verification, and
rollback as independent environment evidence. None advances or follows
automatically from the delivery lifecycle. Only a named human decision owner can
approve a unit or authorize an environment action. Current cross-project status
is indexed in progress-tracker.md; unit specs, PR checks, and
protected-environment records remain authoritative evidence.

## Scope

### In scope for the current launch program

- Responsive web application and server rendering
- French and Arabic, including RTL behavior
- Public football/news discovery and authenticated user state
- Fantasy creation, team, transfers, points, rankings, leagues, research, and
  rules
- Supabase Production V2 schema, auth, storage, RLS, API/RPC contracts, Edge
  Functions, and operational gates
- Deterministic, visibly labelled, no-index mock demo that cannot reach live
  systems
- Staff security console and governed activation workflows
- Browser, application, database, staging, provider, capacity, and release
  verification

### Explicitly out of scope unless separately specified

- Native iOS or Android applications
- Crypto, cards, scarcity, auctions, or marketplace mechanics
- Unlicensed player portraits, provider images, or copied third-party assets
- Invented form, ownership, expected-points, probability, or news facts
- Automatic squad selection without an approved backend contract
- Transfer-history UI without an approved read contract
- Shareable/exported team cards without an approved persistence and privacy
  design
- Consumer billing, subscription, prize, and reward mechanics not yet represented
  by an approved repository spec
- Editorial, competition, and Fantasy CMS expansion beyond the current
  permissioned security Admin surface
- Any mutation of Legacy Supabase
- Treating the isolated demo as a live product or promoting it to the production
  domain

## Success criteria

1. Every supported route has deterministic French and Arabic content, correct
   direction, accessible focus order, and explicit loading/error/empty states.
2. Guest users never start private cloud reads and return to the intended safe
   route after authentication.
3. Two authenticated staging users can complete the core Fantasy journey without
   seeing or modifying each other's data.
4. Live builds require exact Supabase-backed modes; mock or mixed mode cannot
   compile or run as a production profile.
5. All mutations enforce authorization, ownership, active rules, deadlines,
   idempotency where retryable, and optimistic version checks where concurrent.
6. Application quality, database quality, browser acceptance, staging
   acceptance, migration parity, current-season provider readiness and staging
   synchronization, identity delivery, launch obligations, capacity, soak,
   deployment-SHA, and rollback checks pass for the release candidate.
7. Every production migration, Supabase API platform configuration, application
   deployment, Identity configuration, Admin bootstrap/activation, data mutation,
   current-season initialization, Fantasy catalog staging, Fantasy registration
   opening, data/content provider activation, notification-delivery activation,
   worker activation, schedule activation, post-launch verification, and rollback
   occurs only through its separately authorized protected action for the
   reviewed exact commit and produces sanitized evidence.
