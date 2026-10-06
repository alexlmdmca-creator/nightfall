// Herramienta de verificación: abre la demo en Chrome (headless), recoge errores de consola
// y guarda capturas tras ejecutar pasos definidos en un JSON.
//
//   node tools/shot.mjs <plan.json> [--headful] [--port 5199]
//
// plan.json: { "out": "dir", "url": "?autostart=1", "width": 1280, "height": 720,
//              "steps": [ { "name": "a", "eval": "__game.teleport(0,60,0,0)", "wait": 800, "shot": true } ] }
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const planPath = args.find((a) => !a.startsWith('--'));
const headful = args.includes('--headful');
const portIdx = args.indexOf('--port');
const PORT = portIdx >= 0 ? Number(args[portIdx + 1]) : 5199;
if (!planPath) { console.error('Falta el plan JSON'); process.exit(2); }

const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const outDir = resolve(plan.out || join(ROOT, 'tools', 'out'));
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, [join(ROOT, 'server.js'), String(PORT)], { stdio: 'ignore' });
await sleep(500);

let exitCode = 0;
const browser = await puppeteer.launch({
  executablePath: plan.chrome || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: !headful,
  args: [
    `--window-size=${plan.width || 1280},${(plan.height || 720) + (headful ? 90 : 0)}`,
    '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--no-first-run', '--disable-extensions',
    ...(plan.args || []),
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ],
  defaultViewport: { width: plan.width || 1280, height: plan.height || 720 },
});

try {
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warn' || plan.verbose) logs.push(`[${t}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e.message}`));
  page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });

  await page.goto(`http://127.0.0.1:${PORT}/${plan.url || '?autostart=1'}`, { waitUntil: 'load', timeout: 60000 });
  try {
    await page.waitForFunction('window.__game && window.__game.ready === true', { timeout: plan.readyTimeout || 90000 });
  } catch {
    logs.push('[shot] La demo no llegó a estado "ready" a tiempo');
    exitCode = 1;
  }

  for (const step of plan.steps || []) {
    try {
      if (step.eval) {
        const res = await page.evaluate(step.eval);
        if (step.print) console.log(`> ${step.name || step.eval}:`, typeof res === 'string' ? res : JSON.stringify(res));
      }
      if (step.click) await page.click(step.click);
      if (step.key) await page.keyboard.press(step.key);
      if (step.wait) await sleep(step.wait);
      if (step.shot) {
        const file = join(outDir, `${step.name}.jpg`);
        await page.screenshot({ path: file, type: 'jpeg', quality: step.quality || 86 });
        console.log('captura:', file);
      }
    } catch (e) {
      logs.push(`[step ${step.name}] ${e.message}`);
      exitCode = 1;
    }
  }

  if (logs.length) {
    console.log(`--- consola (${logs.length}) ---`);
    console.log([...new Set(logs)].slice(0, 60).join('\n'));
    if (logs.some((l) => l.startsWith('[pageerror]') || l.startsWith('[error]'))) exitCode = 1;
  } else {
    console.log('--- consola limpia ---');
  }
} finally {
  await browser.close();
  server.kill();
}
process.exit(exitCode);
