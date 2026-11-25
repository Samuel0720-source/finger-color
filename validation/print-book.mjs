// Prints the pilot book HTML to a PDF (landscape letter). Usage: node validation/print-book.mjs <index.html> <out.pdf>
import { chromium } from 'playwright';
import path from 'node:path';
const [src, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + path.resolve(src), { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: out, width: '11in', height: '8.5in', printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log('Wrote ' + out);
