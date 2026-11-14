# Visit counts (Rybbit)

MQGrader counts visits with a self-hosted [Rybbit](https://rybbit.com/docs/self-hosting): no cookies, no third party.

- Dashboard: https://stats.mqgrader.ro (sign-up is off; the first account is the administrator).
- Only the five public pages load the script (`index.html`, `ghid/`, `barem/`, `despre/`, `preturi/`), in their `<head>`, after `theme.js`. The teacher, student and Quick Try pages never load it: their addresses hold tokens and ids, and students use them. `src/landing/pages.test.ts` checks both.
- `public/_headers` allows `https://stats.mqgrader.ro` in `script-src` (the script) and `connect-src` (the events it sends). Nothing else is allowed from there.

## The server

- Oracle Cloud, Always Free: `VM.Standard.A1.Flex` (ARM, 1 OCPU, 6 GB), region `eu-frankfurt-1`, Ubuntu 24.04, public IP `92.5.124.164`, user `ubuntu`. Network: VCN `rybbit-vcn`, its public subnet, the internet gateway `rybbit-igw` and a route `0.0.0.0/0` to it; the security list lets in 22, 80 and 443.
- DNS: Cloudflare, an `A` record `stats` → `92.5.124.164`, **DNS only** (grey cloud). Caddy, inside Rybbit, gets the Let's Encrypt certificate itself.
- Oracle's Ubuntu image has its own firewall that refuses everything but SSH. Ports 80 and 443 are opened in `/etc/iptables/rules.v4` (before the `REJECT` line). Do not run `netfilter-persistent save` while Docker runs: it would save Docker's own rules into that file.
- Rybbit lives in `~/rybbit` (the GitHub repository, with Caddy: `docker compose --profile with-webserver up -d`). Its settings are in `~/rybbit/.env` (mode 600): the domain, random database passwords, `DISABLE_SIGNUP=true`, `DISABLE_TELEMETRY=true`, `CLUSTER_WORKERS=1`. Postgres, ClickHouse, Redis and the backend listen on 127.0.0.1 only.
- Update: `cd ~/rybbit && ./update.sh`. It stashes local edits to tracked files, so keep every setting in `.env`.
- Logs: `cd ~/rybbit && docker compose logs -f backend`.
- Oracle may reclaim an Always Free instance that stays almost idle for 7 days; a Pay-As-You-Go account stops that and keeps the free tier.
