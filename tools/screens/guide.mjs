// Renders the teacher guide to a print PDF with headless Chrome.
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(HERE, "../../docs/teacher-guide.pdf");
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.goto("file://" + path.join(HERE, "../guide/teacher-guide.html"), { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: out, format: "Letter", printBackground: true, preferCSSPageSize: true,
  displayHeaderFooter: true, headerTemplate: "<span></span>",
  footerTemplate: '<div style="width:100%;font:8pt Verdana,sans-serif;color:#4A4F59;padding:0 0.65in;display:flex;justify-content:space-between"><span>Roll with the Market teacher guide</span><span><span class="pageNumber"></span> of <span class="totalPages"></span></span></div>' });
await browser.close();
console.log(out);
