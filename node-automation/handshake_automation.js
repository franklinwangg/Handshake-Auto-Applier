import fs from "fs";
import zlib from "zlib";

import "dotenv/config";
import { chromium } from "@playwright/test";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HANDSHAKE_JOBS_URL = process.env.HANDSHAKE_JOBS_URL;

async function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
// Clear temp file at start
fs.writeFileSync("temp.txt", "");

const context = await chromium.launchPersistentContext(
  path.join(__dirname, "chrome-data"),
  { headless: false }
);

const page = await context.newPage();
page.on("console", (msg) => {
  console.log("BROWSER LOG:", msg.text());
});

// 1️⃣ Patch fetch in the browser
await page.addInitScript(() => {
  const origFetch = window.fetch;
  window.__GRAPHQL_RESPONSES__ = [];

  window.fetch = async (...args) => {
    const res = await origFetch(...args);
    const clone = res.clone();

    clone
      .json()
      .then((data) => {
        window.__GRAPHQL_RESPONSES__.push(JSON.stringify(data));
      })
      .catch(() => {});

    return res;
  };
});

await page.goto(HANDSHAKE_JOBS_URL);
await sleep(1000);

const currentUrl = page.url();
const isLoginUrl = (url) => /login|sso|shibboleth|duosecurity|saml/i.test(url);
const isJobPageUrl = (url) =>
  url.includes("joinhandshake.com") &&
  (url.includes("/job-search") || url.includes("/stu/jobs"));

if (isLoginUrl(currentUrl)) {
  console.log("⚠️ Please log in manually in this window.");
  await page.waitForURL((u) => isJobPageUrl(u.toString()), { timeout: 0 });
  console.log("✅ Detected Handshake jobs page after login.");
} else {
  console.log("✅ Already on jobs page, no login needed.");
}

// 2️⃣ Let the page make requests (user logs in, page loads jobs, etc.)
// ...

await page.waitForTimeout(5000); // wait 5 seconds

// 3️⃣ Pull the intercepted responses from the browser
const responses = await page.evaluate(() => {
  console.log(
    "Init script running, window.__GRAPHQL_RESPONSES__ =",
    window.__GRAPHQL_RESPONSES__
  );

  return window.__GRAPHQL_RESPONSES__;
});

// Step 1: Write JSON literals to temp.txt
fs.writeFileSync("temp.txt", JSON.stringify(responses, null, 2));

console.log("Saved scraped data to temp.txt");

// Step 2: Read temp.txt and parse it
let text = fs.readFileSync("temp.txt", "utf-8");

// If your scraped data was double-escaped strings, use:
// let data = JSON.parse(JSON.parse(text));
let data = JSON.parse(text); // regular JSON parse

if (data?.data?.jobSearch?.edges) {
  for (const edge of data.data.jobSearch.edges) {
    const job = edge.node.job;
    console.log(job.id, job.title, job.employer.name);
  }
} else {
  console.log(
    "No jobSearch edges found. Current top-level keys:",
    Object.keys(data.data)
  );
}

// Step 3: Write parsed JSON to temp-json.txt
fs.writeFileSync("temp-json.txt", JSON.stringify(data, null, 2), "utf-8");
console.log("Saved parsed data to temp-json.txt");
