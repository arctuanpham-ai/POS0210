const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  await p.goto('http://localhost:8765/index.html', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
  await p.screenshot({ path: 'guide-out/spot1.png' });
  const gaps = await p.evaluate(() => [...document.querySelectorAll('#fab-stack .chat-fab')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), Math.round(innerWidth - r.right)]; }));
  console.log(JSON.stringify(gaps));
  await p.mouse.click(60, 300); await p.waitForTimeout(400);
  console.log(await p.evaluate(() => [document.body.classList.contains('fab-spot'), localStorage.getItem('oo-fab-tip')].join()));
  await p.screenshot({ path: 'guide-out/spot2.png' });
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
  console.log('after reload spot:', await p.evaluate(() => document.body.classList.contains('fab-spot')));
  await b.close();
})();
