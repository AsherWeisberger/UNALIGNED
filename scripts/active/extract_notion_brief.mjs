#!/usr/bin/env node

import { chromium } from "playwright";

const url = process.argv[2];
const allowVisibleFallback = ["1", "true", "yes", "on"].includes(String(process.env.SHOW_BRIEF_BROWSER || "").toLowerCase());

if (!url) {
  console.error("Notion URL is required.");
  process.exit(1);
}

async function extractWithMode(headless) {
  const browser = await chromium.launch({
    headless,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);

    let stableReads = 0;
    let lastLength = 0;
    for (let i = 0; i < 24; i += 1) {
      await page.mouse.wheel(0, 2600);
      await page.waitForTimeout(900);
      const currentLength = await page.evaluate(() => (document.body?.innerText || "").length);
      if (currentLength <= lastLength + 40) {
        stableReads += 1;
      } else {
        stableReads = 0;
      }
      lastLength = currentLength;
      if (stableReads >= 3) break;
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
      const visible = (node) => {
        if (!node) return false;
        const style = window.getComputedStyle(node);
        return style && style.display !== "none" && style.visibility !== "hidden";
      };

      const lines = (document.body?.innerText || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const title =
        Array.from(document.querySelectorAll("h1"))
          .map((node) => node.textContent?.trim())
          .find(Boolean) ||
        lines.find(Boolean) ||
        document.title ||
        "Robert Brief";

      const links = Array.from(document.querySelectorAll("a"))
        .filter(visible)
        .map((node) => ({
          text: (node.textContent || "").trim(),
          href: node.href || "",
        }))
        .filter((item) => item.href && /^https?:/i.test(item.href))
        .slice(0, 40);

      return {
        title,
        lines: lines.slice(0, 1200),
        links,
      };
    });

    return result;
  } finally {
    await browser.close();
  }
}

let lastError = null;
const launchModes = allowVisibleFallback ? [true, false] : [true];
for (const headless of launchModes) {
  try {
    const result = await extractWithMode(headless);
    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    lastError = error;
  }
}

console.error(lastError?.stack || String(lastError || "Unknown Notion extraction error."));
process.exit(1);
