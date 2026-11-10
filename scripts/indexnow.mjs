// Asks IndexNow (Bing, Yandex and the other engines that use it) to look again
// at the public pages. Google does not read IndexNow; its sitemap does the job.
//
//   npm run indexnow
//
// The addresses come from public/sitemap.xml, so a page added there is
// announced too. The key is the name of the one 32-to-64 hex characters file in
// public/, served at the site root; this script and the browsers read the same
// file, so there is one place to change the key.
//
// Run it after a deploy, once mqgrader.ro serves the new pages.
import { readdir, readFile } from 'node:fs/promises';

const HOST = 'mqgrader.ro';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const sitemap = await readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
const urls = Array.from(sitemap.matchAll(/<loc>(.*?)<\/loc>/g), (m) => m[1]);
if (urls.length === 0) throw new Error('public/sitemap.xml lists no address');

const files = await readdir(new URL('../public/', import.meta.url));
const keys = files.filter((name) => /^[0-9a-f]{32,64}\.txt$/.test(name));
if (keys.length !== 1) throw new Error(`public/ must hold one IndexNow key file, found ${keys.length}`);
const keyFile = keys[0];
const key = keyFile.replace(/\.txt$/, '');

const body = {
  host: HOST,
  key,
  keyLocation: `https://${HOST}/${keyFile}`,
  urlList: urls,
};
const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});
// IndexNow answers 200 or 202 when it takes the list.
if (!res.ok) throw new Error(`IndexNow answered ${res.status}: ${await res.text()}`);
console.log(`IndexNow: ${urls.length} addresses announced (${res.status})`);
