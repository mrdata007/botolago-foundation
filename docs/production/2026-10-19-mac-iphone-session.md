# Mac and iPhone staging session ($0)

Status: launcher prepared; owner device session pending. Wait for the operator's
ready message before signing in or changing staging data. Automated staging
drills own their exclusive database windows. This uses the existing TanStack SSR website,
with public-key access and the same protected APIs as the website.

Owner device: **iPhone 17 Pro, iOS 27**. Local operator verification on 19 October:
HTTPS login returned 200; French LTR and Arabic RTL hydrated at 393 px without
horizontal overflow or page errors. Chromium 149 used the local certificate's
public-key pin; a separate curl request validated the certificate. Browser
requests outside the local server were blocked during this anonymous rendering
check (none were attempted). This is not authenticated journey or iPhone evidence.

Read-only staging Auth inventory, run
[39238225342](https://github.com/mrdata007/botolago-foundation/actions/runs/39238225342):
custom SMTP absent, email confirmations required, localhost site URL, zero
redirect allowlist entries, Google and Apple providers disabled. Expanded read
39248436124 also found eight-digit codes and a link-only confirmation email,
while the app requires six digits. Staging setup 39249633112 has corrected the
code/template contract and installed the exact trusted Mac callbacks, with a
private baseline in staging Vault. SMTP remains unconfigured; this does not
claim signup/reset delivery. A8 checks the graceful provider-unavailable wording.

The owner confirmed that Safari opens the local login without a certificate
warning. Authenticated cases, language/layout checks and real inbox comparisons
remain pending.

## Prepare the Mac

Use a trusted private Wi-Fi network shared by the Mac and iPhone. Keep the Mac
awake. Install Node 22 or newer, Bun 1.3.14 and mkcert using their official
instructions ([Node](https://nodejs.org/en/download),
[Bun](https://bun.sh/docs/installation),
[mkcert](https://github.com/FiloSottile/mkcert#installation)). These tools have
no hosting charge. Do not provision a paid hosting service or developer account.

Clone the repository and use the exact approved session commit supplied by the
operator, then run `bun install --frozen-lockfile`. Until the QA PR merges, its
source is branch `chore/staging-phone-fixtures`; the session commit will be
recorded after CI. Do not select a moving branch as final release evidence.

In the checkout, find the Wi-Fi IP with `ipconfig getifaddr en0`. If empty, use
System Settings → Wi-Fi → Details → TCP/IP; the Wi-Fi interface can differ.
Create `.env.phone.local` in an editor with:

```dotenv
PHONE_LAN_IP=192.168.1.42
STAGING_PUBLISHABLE_KEY=sb_publishable_REPLACE_LOCALLY
```

Replace the IP with the Mac's actual address. Copy the **publishable** key from
Supabase Staging V2 (`srdrflfrfpwixsllveid`) → Settings → API Keys. No service-role,
Resend, Management or production key is needed. Do not paste keys in chat.

Create the local certificate (replace the example IP):

```sh
mkdir -p .phone.local
chmod 700 .phone.local
chmod 600 .env.phone.local
mkcert -install
mkcert -cert-file .phone.local/cert.pem -key-file .phone.local/key.pem 192.168.1.42 localhost 127.0.0.1
chmod 600 .phone.local/key.pem
node scripts/qa/staging-phone-dev.mjs
```

Allow incoming connections for this Node process on the Mac's private network if
macOS asks. The launcher binds only the supplied LAN IP, port 8443, with TLS. It
ignores inherited app credentials and all `.env` files, explicitly selects the
Supabase data modes, and pins both browser and SSR to Staging V2. The helper's
independent environment loading is disabled too. Local canonical links may
still name the public site; do not follow those into production during testing.

## Trust the certificate on this iPhone

Find mkcert's directory with `mkcert -CAROOT`. AirDrop **only `rootCA.pem` (or its `.cer` copy)** to
the iPhone; never share `rootCA-key.pem` or the server key. On iPhone, install the
downloaded certificate profile in Settings, then enable that certificate under
General → About → Certificate Trust Settings. Open the printed
`https://MAC_IP:8443` URL in Safari. Stop if Safari reports an untrusted certificate.
Do not bypass the warning. This local CA is powerful: keep its private key on
the Mac and remove the iPhone certificate profile after the session.

## Before running the checklist

Record the exact checkout SHA (`git rev-parse HEAD`), iPhone model/iOS, Safari
version, date and actual staging gameweek deadline. On the Mac's browser network
panel, verify Supabase requests use `srdrflfrfpwixsllveid.supabase.co`; none may
use `tkewgajrljbwgwedqsxn.supabase.co`. Check the response `x-botolago-release`
header and `botolago-release` HTML meta agree with the checkout SHA. Verify
French and Arabic/RTL before handing the same URL to the phone.

Run the [real-state checklist](2026-10-16-real-state-test-checklist.md) against
the [prepared P1–P6 states](2026-10-19-phone-fixture-run-sheet.md), recording
pass/fail and screenshots for failures. Use the two existing test accounts.
Do not create the third signup account until the Auth email path is ready.
Check actual 200% text size, focus after closing dialogs, tap targets, saved-list
continuation, both ranking lists, retained historical players and sale values.

Auth signup/reset cases additionally require a verified staging Auth SMTP sender
and this exact HTTPS origin/callback in Supabase Auth's redirect allowlist.
The alert-delivery smoke does not prove Auth mail. Product reminder links also
need the staging Edge `APP_URL` override; defaults currently point at production.
The operator must verify these separately before sending links. A LAN link
works only while this Mac is reachable on the same network.

The protected staging workflow provides `authpreflight` (GET-only),
`authconfigure` and `authcleanup`. Configuration/cleanup require the exact
private HTTPS origin and `UPDATE_STAGING_DATABASE`, saved cron/Rivals flags,
an exclusive window with those writers paused, and verified restoration by
the operator afterward. The script does not pause or restore schedules itself.
It changes no SMTP password or provider credential. Setup saves only its changed
fields privately in Vault, configures six digits, inserts the code into the
existing confirmation template and allowlists the app's exact callbacks.
After the session, cleanup restores the former site/redirect URLs while keeping
the six-digit code/template alignment. The callback allowlist also includes a
query-only glob on the exact trusted callback path, so signup can preserve an
encoded protected-page `next` value. Other hosts, ports and paths stay excluded.
The source upgrade from four entries to five passed strict staging readback in
run 39265408129 at 14:03 UTC. Signup/reset delivery remains unproven.
Any generating AI job, claimed delivery or processing deletion blocks this
action even if its lease expired or no database session is active. Inspect
the corresponding Edge invocation logs and finish its reviewed recovery before
clearing a residual job; disabling cron or waiting out a lease is insufficient.
An unexpected configuration change is refused. This is a guarded one-time repair of the observed initial baseline;
do not force it against another environment or changed baseline.

Safari proves website and in-app notification behavior. Native iPhone push uses
APNs and requires an installed native build, permission/token registration and
actual receipt; HTTPS Safari does not prove it. Android and screen-reader checks
also keep their separate requirements. This development session does not replace
the production-build CI checks or the failed capacity gate.

Stop with Ctrl-C, remove the iPhone certificate profile, and keep certificate
keys and local settings out of commits. The operator will retire fixture-owned
staging data after preserving the results in a separate writer window.
