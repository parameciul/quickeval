# Visit counts (Rybbit)

MQGrader counts visits with a self-hosted [Rybbit](https://rybbit.com/docs/self-hosting): no cookies, no third party.

- Dashboard: https://stats.mqgrader.ro (sign-up is off; the first account is the administrator).
- The five public pages load the script (`index.html`, `guide/`, `marking-scheme/`, `about/`, `pricing/`), in their `<head>`, after `theme.js`.
- The student pages (`u/index.html`) and the Quick Try pages (`try/index.html`) load it too. Their addresses hold tokens, so:
  - `data-mask-patterns` sends a pattern in place of each path with a token: `/u/*` (the test link), `/u/result/*` and `/u/rezultat/*` (the result link), `/try/*` and `/try/*/phone`. The first pattern that matches wins, and a catch-all at the end (`/u/**`, `/try/**`) covers any other path.
  - `<meta name="referrer" content="no-referrer">`: the next page never learns the address with the token.
  - Rybbit masks the path only. The query string, the page title and the referrer go as they are, so no page puts a token in a query string or in its title. `src/ui/visits.test.ts` checks all of it with Rybbit's own matching rule.
- The teacher app loads it only while the login screen shows (`loadTeacherCounter` in `src/ui/visits.ts`, in the built site only). It skips every teacher path but `/teacher/` and `/teacher/#new-account` (the email links hold a token after `#`). After a login, a tab that loaded it starts again, so the counter never sees a logged-in teacher's page. A signed-out deep link (`/teacher/tests/...`) is not counted. The button "Cere un cont de profesor" does not change the address, so `#new-account` counts only the visitors who came from the landing page's link.
- Two events: `account-request-sent` (a sent sign-up) and `quick-try-sent` (a Quick Try whose files were sent), with no name, email or token.
- The released Rybbit (updated 2026-11-18) has no "Track URL fragments" setting: its script drops the `#` part of an address (it keeps only `#/` routes), so `/teacher/#new-account` counts as `/teacher/`. The sign-ups still count, as the `account-request-sent` event. The masks also match the form with the `#` part, for the day the setting comes.
- The dashboard settings of the site (Settings, Tracking): "Session Replay" off, "SPA Navigation" on, "URL Parameters" on (campaign tags), "Initial Page View" on, "Outbound Links" on (it sends the outside link only), "Error Tracking" off (an error message may hold text of the page), "Button Clicks" off (it sends the text of the button, and the student page has a button with each student's name), "Copy Events" off, "Form Interactions" off. "Track URL fragments" on once a release has it. Session Replay records the full address, token included, and what the page shows: it must stay off while the student pages share the site. To record the public pages one day, give the private pages a Rybbit site of their own first.
- `public/_headers` allows `https://stats.mqgrader.ro` in `script-src` (the script) and `connect-src` (the events it sends). Nothing else is allowed from there.

## The server

- Oracle Cloud, Always Free: `VM.Standard.A1.Flex` (ARM, 1 OCPU, 6 GB), region `eu-frankfurt-1`, Ubuntu 24.04, public IP `92.5.124.164`, user `ubuntu`. Network: VCN `rybbit-vcn`, its public subnet, the internet gateway `rybbit-igw` and a route `0.0.0.0/0` to it; the security list lets in 22, 80 and 443.
- DNS: Cloudflare, an `A` record `stats` → `92.5.124.164`, **DNS only** (grey cloud). Caddy, inside Rybbit, gets the Let's Encrypt certificate itself.
- Oracle's Ubuntu image has its own firewall that refuses everything but SSH. Ports 80 and 443 are opened in `/etc/iptables/rules.v4` (before the `REJECT` line). Do not run `netfilter-persistent save` while Docker runs: it would save Docker's own rules into that file.
- Rybbit lives in `~/rybbit` (the GitHub repository, with Caddy: `docker compose --profile with-webserver up -d`). Its settings are in `~/rybbit/.env` (mode 600): the domain, random database passwords, `DISABLE_SIGNUP=true`, `DISABLE_TELEMETRY=true`, `CLUSTER_WORKERS=1`. Postgres, ClickHouse, Redis and the backend listen on 127.0.0.1 only.
- Update: `cd ~/rybbit && ./update.sh`. It stashes local edits to tracked files, so keep every setting in `.env`.
- Logs: `cd ~/rybbit && docker compose logs -f backend`.
- Keep the dashboard out of search. The Search Console property `mqgrader.ro` covers every subdomain, and Google found odd addresses of the dashboard (`/month`, `/$`, `/&`). Rybbit sends no noindex, and its `/robots.txt` answers with the app's page.
  - Fix: in `~/rybbit/Caddyfile`, put `header X-Robots-Tag "noindex, nofollow"` as the first line inside the site's block, then `docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`.
  - Check: `curl -sI https://stats.mqgrader.ro/ | grep -i x-robots-tag`. If the header is missing after the reload, the editor replaced the file, and the container still sees the old one (it mounts that single file): run `docker compose --profile with-webserver up -d --force-recreate caddy`.
  - Do not close the host in a `robots.txt`: Google would then never see the noindex of the addresses it already has.
  - `./update.sh` stashes that line (the Caddyfile is a tracked file): after every update, run the check, and add the line again if it is gone.
- Oracle may reclaim an Always Free instance that stays almost idle for 7 days; a Pay-As-You-Go account stops that and keeps the free tier.
