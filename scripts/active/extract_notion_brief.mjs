#!/usr/bin/env node

// Reads a Notion page for the brief maker using a PERSISTENT, logged-in Chrome
// profile (real Chrome via channel:"chrome"). Sign into Notion ONCE in the window
// that appears the first time; the session is saved to BRIEF_CHROME_PROFILE and
// reused headlessly after that. This lets it read PRIVATE Notion pages you have
// access to (app.notion.com / workspace pages), not just public ones.
//
// It uses its OWN profile dir (not your everyday Chrome profile), so it never
// conflicts with a Chrome you already have open.

import { chromium } from "playwright";
import os from "os";
import path from "path";

const url = process.argv[2];
// Visible fallback is ON by default so the one-time Notion login can happen.
const allowVisibleFallback = !["0", "false", "no", "off"].includes(
  String(process.env.SHOW_BRIEF_BROWSER || "").toLowerCase()
);
const PROFILE_DIR =
  process.env.BRIEF_CHROME_PROFILE ||
  path.join(os.homedir(), ".config/google-credentials/brief-chrome-profile");
const LOGIN_WAIT_MS = Number(process.env.BRIEF_LOGIN_WAIT_MS || 180000); // time to log in once

if (!url) {
  console.error("Notion URL is required.");
  process.exit(1);
}

function looksLikeLogin(href, text) {
  const u = String(href || "").toLowerCase();
  if (/notion\.(so|com)\/login|\/signin|\/login/.test(u)) return true;
  const t = String(text || "");
  if (t.length < 400 && /(log in|sign in|continue with|verify your)/i.test(t)) return true;
  return false;
}

async function extractWithMode(headless) {
  // Real Chrome + persistent profile = the logged-in session survives between runs.
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless,
    viewport: { width: 1440, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  try {
    const page = context.pages()[0] || (await context.newPage());
    page.setDefaultTimeout(60000);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);

    // If we hit a login wall: headless -> bail so the visible window can take over;
    // visible -> wait for the human to sign in (once), polling until real content loads.
    let href = page.url();
    let text = await page.evaluate(() => document.body?.innerText || "");
    if (looksLikeLogin(href, text)) {
      if (headless) {
        throw new Error("LOGIN_REQUIRED");
      }
      const deadline = Date.now() + LOGIN_WAIT_MS;
      while (Date.now() < deadline) {
        await page.waitForTimeout(3000);
        href = page.url();
        text = await page.evaluate(() => document.body?.innerText || "");
        if (!looksLikeLogin(href, text)) break;
      }
      // make sure we are on the requested page after login
      if (!page.url().startsWith(url.split("?")[0])) {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(4000);
      }
    }

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

      return { title, lines: lines.slice(0, 1200), links };
    });

    // Guard: do not return a login page as if it were the brief.
    if (looksLikeLogin(page.url(), (result.lines || []).join("\n"))) {
      throw new Error("LOGIN_REQUIRED");
    }
    return result;
  } finally {
    await context.close();
  }
}

let lastError = null;
// Headless first (fast, windowless once logged in); then a visible window so a
// first-time / expired login can be completed by hand.
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
