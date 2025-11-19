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

// Log every request
page.on("request", async (request) => {
  try {
    const url = request.url();
    const method = request.method();
    const postData = request.postData() || "";

    const log = `
===== REQUEST =====
URL: ${url}
METHOD: ${method}
BODY: ${postData}
===================`;

    fs.appendFileSync("temp.txt", log + "\n");
  } catch (err) {}
});

// page.on("response", async (response) => {
//   try {
//     const url = response.url();

//     // Always read raw body
//     const buffer = await response.body();

//     // Try to decode as utf-8 text
//     let bodyText;
//     try {
//       bodyText = buffer.toString("utf8");
//     } catch {
//       bodyText = "<binary>";
//     }

//     const log = `
// ===== RESPONSE =====
// URL: ${url}
// BODY: ${bodyText}
// ====================
// `;

//     fs.appendFileSync("temp.txt", log);
//   } catch (err) {}
// });
page.on("response", async (response) => {
  try {
    const url = response.url();
    const headers = response.headers();
    const encoding = headers["content-encoding"] || "";

    const buffer = await response.body(); // always raw bytes

    let decompressed;

    if (encoding.includes("br")) {
      // Brotli
      decompressed = zlib.brotliDecompressSync(buffer);
    } else if (encoding.includes("gzip")) {
      decompressed = zlib.gunzipSync(buffer);
    } else if (encoding.includes("deflate")) {
      decompressed = zlib.inflateSync(buffer);
    } else {
      decompressed = buffer; // plain text
    }

    let bodyText = decompressed.toString("utf8");

    const log = `
===== RESPONSE =====
URL: ${url}
BODY: ${bodyText}
====================
`;

    fs.appendFileSync("temp.txt", log);
  } catch (err) {
    console.error("Error reading response:", err);
  }
});
