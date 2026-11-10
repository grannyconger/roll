// Tiles the side by side pairs into contact sheets for a quick visual pass.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");
const per = Number(process.argv[2] || 6);
const pairs = fs.readdirSync(path.join(OUT, "pairs")).filter(f => f.endsWith(".png")).sort();
fs.mkdirSync(path.join(OUT, "sheets"), { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1800, height: 800 } });
for (const view of ["display", "student"]) {
  const list = pairs.filter(f => f.startsWith(view + "-"));
  for (let i = 0; i < list.length; i += per) {
    const chunk = list.slice(i, i + per);
    const tiles = chunk.map(f => `<figure style="margin:0"><figcaption style="color:#fff;font:15px sans-serif">${f.replace(".png", "")}</figcaption><img style="width:100%" src="data:image/png;base64,${fs.readFileSync(path.join(OUT, "pairs", f)).toString("base64")}"></figure>`).join("");
    await page.setContent(`<body style="margin:0;background:#333"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px;align-items:start">${tiles}</div></body>`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, "sheets", `${view}-${String(i / per + 1).padStart(2, "0")}.png`), fullPage: true });
  }
}
await browser.close();
