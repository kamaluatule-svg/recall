import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startStack } from '../backend/test/helpers.js';

// Browser end-to-end check: real frontend + real API, with Firebase's SDK and Supabase stubbed.
// Run:  cd e2e && npm install && npx playwright install chromium && npm run e2e

const here = fileURLToPath(new URL('.', import.meta.url));
const OUT = join(here, 'out');
await mkdir(OUT, { recursive: true });
const FE = join(here, '../frontend'), FE_PORT = 5599, API_PORT = 8099;
const origin = `http://127.0.0.1:${FE_PORT}`;
const stack = await startStack({ corsOrigins: [origin], port: API_PORT });
const token = stack.tokenFor('e2e-user', { name: 'Ada Lovelace', email: 'ada@example.com' });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/json' };
const fe = createServer(async (req, res) => {
  let p = new URL(req.url, origin).pathname; if (p === '/') p = '/index.html';
  try {
    let body = await readFile(join(FE, p));
    if (p === '/config.js') body = `window.RECALL_CONFIG={apiUrl:'http://127.0.0.1:${API_PORT}',firebase:{apiKey:'k',authDomain:'x',projectId:'recall-test',appId:'a'}};`;
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'text/plain' }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(FE_PORT, '127.0.0.1');

// Stub Firebase compat SDK: popup sign-in yields a user whose ID token is a really-signed JWT.
const fakeFirebase = `
window.firebase = (() => {
  let current = null, listeners = [];
  const notify = () => listeners.forEach(cb => cb(current));
  const auth = {
    get currentUser() { return current; },
    onAuthStateChanged(cb) { listeners.push(cb); setTimeout(() => cb(current), 0); },
    async signInWithPopup() { current = { uid:'e2e-user', email:'ada@example.com', displayName:'Ada Lovelace', photoURL:null, getIdToken: async () => '${token}' }; notify(); },
    async signOut() { current = null; notify(); },
  };
  const fn = () => auth; fn.GoogleAuthProvider = function(){ this.setCustomParameters=()=>{}; };
  return { apps: [1], initializeApp(){}, auth: fn };
})();`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
await page.route(/gstatic\.com\/firebasejs/, r => r.fulfill({ contentType: 'text/javascript', body: r.request().url().includes('app-compat') ? fakeFirebase : '' }));
await page.route(/unpkg\.com\/lucide/, r => r.fulfill({ contentType: 'text/javascript', body: 'window.lucide={createIcons(){}}' }));
await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());

const step = (m) => console.log('•', m);
const assert = (c, m) => { if (!c) throw new Error('FAILED: ' + m); };

await page.goto(origin + '/');
await page.waitForSelector('[data-signin]');
step('landing page rendered');
const loginText = async () => { await page.click('.landing-actions [data-signin]'); await page.waitForSelector('#googleSignIn'); return page.textContent('.modal, #modalRoot'); };
const modal = await loginText();
assert(!(await page.$('#authForm')), 'email form should be gone');
assert(/Continue with Google/.test(modal), 'google button present');
step('login modal is Google-only');

await page.click('#googleSignIn');
await page.waitForSelector('#appSidebar:not([hidden])', { timeout: 10000 });
assert((await page.textContent('#profileName')) === 'Ada Lovelace', 'profile name from Google');
step('signed in with Google -> bootstrap loaded');

// create deck
await page.evaluate(() => openDeckModal());
await page.fill('#deckName', 'Cell Biology'); await page.fill('#deckSubject', 'Biology');
await page.click('#deckForm .primary-button');
await page.waitForFunction(() => document.getElementById('navDeckCount').textContent === '1');
// add card
await page.click('.side-deck');
await page.waitForSelector('[data-action="new-card"]');
await page.click('[data-action="new-card"]');
await page.fill('#cardQuestion', 'Powerhouse of the cell?'); await page.fill('#cardAnswer', 'Mitochondria');
await page.click('#cardForm .primary-button');
await page.waitForTimeout(600);
const dbDecks = stack.pg.tables.decks, dbCards = stack.pg.tables.cards;
assert(dbDecks.length === 1 && dbDecks[0].name === 'Cell Biology' && dbDecks[0].user_id === 'e2e-user', 'deck persisted in DB');
assert(dbCards.length === 1 && dbCards[0].question === 'Powerhouse of the cell?', 'card persisted in DB');
step('deck + card written through API to Supabase (fake)');

// study: reveal, got it
await page.click('[data-action="study-deck"]');
await page.waitForSelector('[data-action="reveal"], #revealAnswer, button:has-text("Show answer")', { timeout: 5000 }).catch(()=>{});
const showBtn = await page.$('button:has-text("Show answer"), button:has-text("Reveal")');
if (showBtn) await showBtn.click(); else await page.keyboard.press('Space');
await page.click('[data-action="rate"][data-correct="true"]');
await page.waitForTimeout(800);
assert(stack.pg.tables.cards[0].interval_days === 1 && stack.pg.tables.cards[0].seen_count === 1, 'server applied review schedule');
assert(stack.pg.tables.study_sessions.length === 1 && stack.pg.tables.study_sessions[0].reviewed === 1, 'session recorded');
step('review scheduled server-side (interval 1d) + session saved');
await page.screenshot({ path: OUT + '/study-done.png' });

// reload page: data comes back from server
await page.goto(origin + '/');
await page.waitForSelector('#appSidebar:not([hidden])', { timeout: 10000 }).catch(async()=>{ await page.click('[data-signin]'); await page.click('#googleSignIn'); await page.waitForSelector('#appSidebar:not([hidden])'); });
assert((await page.textContent('#navDeckCount')) === '1', 'deck restored after reload');
step('state restored from API after fresh page load');
await page.screenshot({ path: OUT + '/dashboard.png' });

// sign out
await page.click('#sessionButton');
await page.waitForSelector('[data-signin]');
step('sign out returns to landing');

console.log(errors.length ? 'JS ERRORS:\n' + errors.join('\n') : 'no JS errors');
await browser.close(); fe.close(); stack.stop();
process.exit(errors.length ? 1 : 0);
