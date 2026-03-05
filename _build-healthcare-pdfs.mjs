#!/usr/bin/env node
// Builds PDFs for all healthcare slide decks and 2-pager briefs.
// Usage: node _build-healthcare-pdfs.mjs

import puppeteer from 'puppeteer';
import { join } from 'path';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SLIDE_DECKS = [
  { src: 'vc.html',   pdf: 'True-North-Healthcare-Investor-Deck.pdf' },
  { src: 'cio.html',  pdf: 'True-North-CIO-Deck.pdf' },
  { src: 'cmio.html', pdf: 'True-North-CMIO-Deck.pdf' },
  { src: 'bd.html',   pdf: 'True-North-BD-Deck.pdf' },
];

const BRIEFS = [
  { src: 'vc.html',   pdf: 'True-North-Healthcare-Investor-Brief.pdf' },
  { src: 'cio.html',  pdf: 'True-North-CIO-Brief.pdf' },
  { src: 'cmio.html', pdf: 'True-North-CMIO-Brief.pdf' },
  { src: 'bd.html',   pdf: 'True-North-BD-Brief.pdf' },
];

const SLIDE_SRC = '/home/marcus/code/new/writings/research/topics/enterprise-health/process/wave-6-render';
const BRIEF_SRC = '/home/marcus/code/new/writings/research/topics/enterprise-health/process/wave-4-design';
const OUTPUT_DIR = join(__dirname, 'docs', 'healthcare');

const WIDTH = 1920;
const HEIGHT = 1080;

async function buildSlidePDF(browser, srcPath, pdfPath) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.goto(`file://${srcPath}`, { waitUntil: 'networkidle0', timeout: 30000 });

  // Kill transitions, hide nav
  await page.addStyleTag({ content: `
    *, *::before, *::after { transition: none !important; animation: none !important; }
    .nav-dots, .slide-counter { display: none !important; }
  `});
  await new Promise(r => setTimeout(r, 300));

  const slideCount = await page.evaluate(() => document.querySelectorAll('.slide').length);
  console.log(`  ${slideCount} slides`);

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
      const counter = document.getElementById('slideCounter');
      if (counter) counter.textContent = `${idx + 1} / ${total}`;
    }, i, slideCount);
    await new Promise(r => setTimeout(r, 200));
    const p = join(__dirname, `_tmp_slide_${i}.jpg`);
    await page.screenshot({ path: p, type: 'jpeg', quality: 88 });
    tmpFiles.push(p);
  }

  // Build PDF from screenshots
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
    path: pdfPath,
    width: '1920px',
    height: '1080px',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  // Cleanup
  for (const f of [...tmpFiles, pdfHtmlPath]) {
    try { unlinkSync(f); } catch {}
  }
  await pdfPage.close();
  await page.close();
}

async function buildBriefPDF(browser, srcPath, pdfPath) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
  await page.goto(`file://${srcPath}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 500));

  await page.pdf({
    path: pdfPath,
    format: 'Letter',
    printBackground: true,
    margin: { top: '0.3in', right: '0.3in', bottom: '0.3in', left: '0.3in' },
  });

  await page.close();
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files'],
  });

  // Slide decks
  for (const deck of SLIDE_DECKS) {
    const src = join(SLIDE_SRC, deck.src);
    const out = join(OUTPUT_DIR, 'slides', deck.pdf);
    console.log(`Building slide PDF: ${deck.pdf}`);
    await buildSlidePDF(browser, src, out);
    console.log(`  → ${out}`);
  }

  // Briefs
  for (const brief of BRIEFS) {
    const src = join(BRIEF_SRC, brief.src);
    const out = join(OUTPUT_DIR, 'briefs', brief.pdf);
    console.log(`Building brief PDF: ${brief.pdf}`);
    await buildBriefPDF(browser, src, out);
    console.log(`  → ${out}`);
  }

  await browser.close();
  console.log('\nAll PDFs built.');
}

main().catch(err => { console.error(err); process.exit(1); });
