#!/usr/bin/env node
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Accept CLI arg: "business" or "consumer" (default)
const deckArg = (process.argv[2] || 'consumer').toLowerCase();
const isBusiness = deckArg === 'business';
const htmlFile = isBusiness ? 'business.html' : 'investor.html';
const pdfName = isBusiness ? 'True-North-Business-Deck.pdf' : 'True-North-Pitch-Deck.pdf';

const htmlPath = join(__dirname, htmlFile);
const outputPath = join(__dirname, pdfName);

const WIDTH = 1920;
const HEIGHT = 1080;

// CSS-only replacement for the heavy dark-sea-bg.png (2.1 MB → 0 bytes)
// Creates a dark ocean + starfield + bright star effect using pure CSS/SVG
const BG_OVERRIDE_CSS = `
  /* ── SVG starfield encoded inline ── */
  .slide,
  .slide.slide-title-bg {
    background-image: none !important;
    background-color: #080e1a !important;
  }
  .slide::before,
  .slide::after {
    content: '';
    position: absolute;
    inset: 0;
    width: auto !important;
    height: auto !important;
    top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
    pointer-events: none;
    z-index: 0;
    opacity: 1 !important;
  }
  /* Ocean gradient + horizon glow */
  .slide::before {
    background:
      /* Star point */
      radial-gradient(1px 1px at 50% 22%, rgba(255,255,255,0.95) 0%, transparent 100%),
      /* Star glow halo */
      radial-gradient(12px 12px at 50% 22%, rgba(200,220,255,0.35) 0%, transparent 100%),
      /* Horizon reflection on water */
      radial-gradient(ellipse 40% 15% at 50% 68%, rgba(160,185,220,0.12) 0%, transparent 100%),
      /* Sky-to-ocean gradient */
      linear-gradient(
        to bottom,
        #080e1a 0%,
        #0b1424 20%,
        #0d1830 38%,
        #0f1c34 48%,
        #0a1528 55%,
        #07101e 70%,
        #050c16 100%
      );
  }
  /* Scattered star dots via SVG data URI */
  .slide::after {
    opacity: 0.7;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='450'%3E%3Cdefs%3E%3CradialGradient id='s'%3E%3Cstop offset='0' stop-color='%23fff'/%3E%3Cstop offset='1' stop-color='%23fff' stop-opacity='0'/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect fill='none' width='800' height='450'/%3E%3Ccircle cx='120' cy='45' r='0.6' fill='%23c8daf0' opacity='0.8'/%3E%3Ccircle cx='230' cy='78' r='0.5' fill='%23fff' opacity='0.6'/%3E%3Ccircle cx='340' cy='30' r='0.7' fill='%23d0e0f0' opacity='0.7'/%3E%3Ccircle cx='480' cy='65' r='0.4' fill='%23fff' opacity='0.5'/%3E%3Ccircle cx='560' cy='25' r='0.6' fill='%23c0d4e8' opacity='0.65'/%3E%3Ccircle cx='670' cy='55' r='0.5' fill='%23fff' opacity='0.55'/%3E%3Ccircle cx='750' cy='90' r='0.4' fill='%23d8e8f8' opacity='0.5'/%3E%3Ccircle cx='85' cy='120' r='0.5' fill='%23fff' opacity='0.45'/%3E%3Ccircle cx='195' cy='140' r='0.6' fill='%23c8d8f0' opacity='0.6'/%3E%3Ccircle cx='310' cy='110' r='0.4' fill='%23fff' opacity='0.5'/%3E%3Ccircle cx='445' cy='135' r='0.7' fill='%23d0e4f4' opacity='0.55'/%3E%3Ccircle cx='580' cy='100' r='0.5' fill='%23fff' opacity='0.6'/%3E%3Ccircle cx='700' cy='130' r='0.6' fill='%23c4d8ec' opacity='0.5'/%3E%3Ccircle cx='55' cy='180' r='0.4' fill='%23fff' opacity='0.4'/%3E%3Ccircle cx='165' cy='200' r='0.5' fill='%23d4e2f2' opacity='0.45'/%3E%3Ccircle cx='390' cy='170' r='0.6' fill='%23fff' opacity='0.5'/%3E%3Ccircle cx='520' cy='195' r='0.4' fill='%23c8dcf0' opacity='0.4'/%3E%3Ccircle cx='640' cy='180' r='0.5' fill='%23fff' opacity='0.5'/%3E%3Ccircle cx='760' cy='160' r='0.4' fill='%23d0d8e8' opacity='0.35'/%3E%3Ccircle cx='275' cy='50' r='0.3' fill='%23fff' opacity='0.4'/%3E%3Ccircle cx='615' cy='40' r='0.35' fill='%23e0ecf8' opacity='0.45'/%3E%3Ccircle cx='150' cy='88' r='0.3' fill='%23fff' opacity='0.35'/%3E%3Ccircle cx='720' cy='72' r='0.4' fill='%23c8d4e4' opacity='0.4'/%3E%3Ccircle cx='420' cy='15' r='0.5' fill='%23fff' opacity='0.55'/%3E%3Ccircle cx='35' cy='60' r='0.35' fill='%23d8e4f0' opacity='0.4'/%3E%3C/svg%3E");
    background-size: 100% 50%;
    background-repeat: no-repeat;
    background-position: center top;
  }
  /* Ensure slide content stays above the pseudo-elements */
  .slide > * {
    position: relative;
    z-index: 1;
  }
  /* Title slides: brighter star, more visible horizon */
  .slide.slide-title-bg::before {
    background:
      radial-gradient(2px 2px at 50% 22%, rgba(255,255,255,1) 0%, transparent 100%),
      radial-gradient(20px 20px at 50% 22%, rgba(200,220,255,0.5) 0%, transparent 100%),
      radial-gradient(ellipse 45% 20% at 50% 68%, rgba(160,185,220,0.18) 0%, transparent 100%),
      linear-gradient(
        to bottom,
        #0a1020 0%,
        #0d1828 20%,
        #101e38 38%,
        #12223e 48%,
        #0c1830 55%,
        #081222 70%,
        #050e18 100%
      );
  }
`;

async function main() {
  console.log(`Building PDF for: ${htmlFile} → ${pdfName}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0', timeout: 30000 });

  // Inject CSS: replace heavy PNG background + hide nav UI + kill transitions
  const PDF_CSS = BG_OVERRIDE_CSS + `
    /* Kill all transitions so slide switches are instant */
    *, *::before, *::after {
      transition: none !important;
      animation: none !important;
    }
    /* Match body bg to slide bg so no seam on edges */
    html, body { background: #080e1a !important; }
    /* Hide navigation dots */
    .nav-dots { display: none !important; }
    .slide-disclaimer { left: 20px !important; right: auto !important; }
  `;
  await page.addStyleTag({ content: PDF_CSS });
  await new Promise(r => setTimeout(r, 300));

  const slideCount = await page.evaluate(() => document.querySelectorAll('.slide').length);
  console.log(`Found ${slideCount} slides`);

  // Save individual slide screenshots as JPEG (much smaller than PNG for these slides)
  const tmpFiles = [];
  for (let i = 0; i < slideCount; i++) {
    await page.evaluate((idx, total) => {
      document.querySelectorAll('.slide').forEach((s, j) => {
        if (j === idx) {
          s.classList.add('active');
          s.style.opacity = '1';
          s.style.visibility = 'visible';
          s.querySelectorAll('.animate-in').forEach(el => {
            el.style.opacity = '1';
            el.style.transform = 'none';
            el.style.animation = 'none';
          });
        } else {
          s.classList.remove('active');
          s.style.opacity = '0';
          s.style.visibility = 'hidden';
        }
      });
      // Update slide counter
      const counter = document.getElementById('slideCounter');
      if (counter) counter.textContent = `${idx + 1} / ${total}`;
    }, i, slideCount);
    await new Promise(r => setTimeout(r, 200));
    const p = join(__dirname, `_tmp_slide_${i}.jpg`);
    await page.screenshot({ path: p, type: 'jpeg', quality: 88 });
    tmpFiles.push(p);
    console.log(`  Captured slide ${i + 1}/${slideCount}`);
  }

  // Build PDF from captured slides
  const imgTags = tmpFiles.map(f => {
    const b64 = readFileSync(f).toString('base64');
    return `<div class="page"><img src="data:image/jpeg;base64,${b64}" /></div>`;
  }).join('\n');

  const pdfHtmlPath = join(__dirname, '_tmp_pdf.html');
  writeFileSync(pdfHtmlPath, `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; }
  @page { size: 1920px 1080px; margin: 0; }
  body { margin: 0; }
  .page { width: 1920px; height: 1080px; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .page img { width: 1920px; height: 1080px; display: block; }
</style></head><body>${imgTags}</body></html>`);

  const pdfPage = await browser.newPage();
  await pdfPage.goto(`file://${pdfHtmlPath}`, { waitUntil: 'networkidle0', timeout: 60000 });

  await pdfPage.pdf({
    path: outputPath,
    width: '1920px',
    height: '1080px',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  console.log(`\nPDF saved to: ${outputPath}`);

  // Clean up
  for (const f of [...tmpFiles, pdfHtmlPath]) {
    try { unlinkSync(f); } catch {}
  }

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
