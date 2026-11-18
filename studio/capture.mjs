// usage: node capture.mjs <outDir> [frame,frame,...]  (no list = all frames)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(0);
const port = server.address().port;

const [outDir, list] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 560 }, deviceScaleFactor: 1 });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/scene.html`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
const total = await page.evaluate(() => window.FRAMES);
const frames = list ? list.split(',').map(Number) : [...Array(total).keys()];
const el = await page.$('#frame');
const t0 = Date.now();
for (const f of frames) {
  await page.evaluate((f) => window.renderAt(f / window.FRAMES), f);
  await el.screenshot({ path: path.join(outDir, `f${String(f).padStart(4, '0')}.png`), omitBackground: true });
  if (f % 25 === 0) console.log('frame', f, ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
await browser.close();
server.close();
