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
- The Rybbit installed on 2026-11-18 is too old for "Track URL fragments": its script drops the `#` part, so `/teacher/#new-account` counts as `/teacher/`. Update it first (`cd ~/rybbit && ./update.sh`, below), then check that the served `https://stats.mqgrader.ro/api/script.js` still reads `re:` patterns and adds the `#` part to the path.
- The dashboard settings of the site: "Track URL fragments" on (for `#new-account`), "URL Parameters" on (campaign tags), "Session Replay" off. Session Replay records the full address, token included, and what the page shows: it must stay off while the student pages share the site. To record the public pages one day, give the private pages a Rybbit site of their own first.
- `public/_headers` allows `https://stats.mqgrader.ro` in `script-src` (the script) and `connect-src` (the events it sends). Nothing else is allowed from there.

## The server

- Oracle Cloud, Always Free: `VM.Standard.A1.Flex` (ARM, 1 OCPU, 6 GB), region `eu-frankfurt-1`, Ubuntu 24.04, public IP `92.5.124.164`, user `ubuntu`. Network: VCN `rybbit-vcn`, its public subnet, the internet gateway `rybbit-igw` and a route `0.0.0.0/0` to it; the security list lets in 22, 80 and 443.
- DNS: Cloudflare, an `A` record `stats` → `92.5.124.164`, **DNS only** (grey cloud). Caddy, inside Rybbit, gets the Let's Encrypt certificate itself.
- Oracle's Ubuntu image has its own firewall that refuses everything but SSH. Ports 80 and 443 are opened in `/etc/iptables/rules.v4` (before the `REJECT` line). Do not run `netfilter-persistent save` while Docker runs: it would save Docker's own rules into that file.
- Rybbit lives in `~/rybbit` (the GitHub repository, with Caddy: `docker compose --profile with-webserver up -d`). Its settings are in `~/rybbit/.env` (mode 600): the domain, random database passwords, `DISABLE_SIGNUP=true`, `DISABLE_TELEMETRY=true`, `CLUSTER_WORKERS=1`. Postgres, ClickHouse, Redis and the backend listen on 127.0.0.1 only.
- Update: `cd ~/rybbit && ./update.sh`. It stashes local edits to tracked files, so keep every setting in `.env`.
- Logs: `cd ~/rybbit && docker compose logs -f backend`.
- Oracle may reclaim an Always Free instance that stays almost idle for 7 days; a Pay-As-You-Go account stops that and keeps the free tier.
