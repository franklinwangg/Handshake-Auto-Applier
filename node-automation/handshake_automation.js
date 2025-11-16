import "dotenv/config";
import { chromium } from "@playwright/test";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HANDSHAKE_JOBS_URL = process.env.HANDSHAKE_JOBS_URL;
const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE;
const PYTHON_RESUME_SCRIPT = process.env.PYTHON_RESUME_SCRIPT;
const RESUME_OUTPUT_DIR = process.env.RESUME_OUTPUT_DIR;

async function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function generateTailoredResume(jobDescription, jobTitle, companyName) {
  const filename = `${jobTitle.replace(
    /[^a-z0-9]/gi,
    "_"
  )}_${companyName.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.docx`;

  const outputPath = path.resolve(__dirname, RESUME_OUTPUT_DIR, filename);

  const payload = {
    jobDescription,
    jobTitle,
    companyName,
    outputPath,
  };

  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_EXECUTABLE, [PYTHON_RESUME_SCRIPT], {
      cwd: path.resolve(__dirname, "../python-resume"),
      stdio: ["pipe", "pipe", "inherit"],
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();

    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));

    child.on("close", () => {
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed.docxPath);
      } catch (err) {
        reject(err);
      }
    });
  });
}

// async function main() {
//   console.log("Opening Handshake...");

//   // USE STORAGE STATE IF IT EXISTS
//   const statePath = path.resolve(__dirname, "handshake_state.json");
//   const fs = await import("fs");

//   const context = await chromium.launchPersistentContext(
//     __dirname + "/chrome-data",
//     {
//       headless: false,
//     }
//   );

//   const page = await context.newPage();

//   // FIRST NAVIGATION — you'll probably hit login
//   await page.goto(HANDSHAKE_JOBS_URL).catch(() => {});

//   // Wait a bit
//   await sleep(2000);

//   // CHECK IF YOU ARE ON LOGIN PAGE
//   const url = page.url();
//   if (
//     url.includes("login") ||
//     url.includes("sso") ||
//     url.includes("shibboleth")
//   ) {
//     console.log("⚠️  You need to log in manually inside this window.");
//     console.log("   After logging in, DO NOT CLOSE THE WINDOW.");
//     console.log("   Just wait until you land on your job search page.");

// await page.waitForURL(
//   (u) => {
//     const url = u.toString();
//     return !(
//       url.includes("login") ||
//       url.includes("sso") ||
//       url.includes("shibboleth") ||
//       url.includes("duosecurity") ||
//       url.includes("saml")
//     );
//   },
//   { timeout: 0 }
// );

//     console.log("✅ Logged in!");
//   }

//   // Save session
//   await context.storageState({ path: "handshake_state.json" });

//   console.log("🔁 Reloading jobs page...");
//   await page.goto(HANDSHAKE_JOBS_URL, { waitUntil: "networkidle" });

//   console.log("✨ Logged in and ready — scraping jobs...");

//   // Now scrape job links safely
//   const jobLinks = await page.$$eval('a[href*="/stu/jobs/"]', (anchors) =>
//     Array.from(new Set(anchors.map((a) => a.href)))
//   );

//   console.log("Found jobs:", jobLinks.length);

//   // (rest of your automation goes here…)
// }

async function main() {
  console.log("Opening Handshake...");

  // Persistent profile: remembers cookies between runs via chrome-data
  const context = await chromium.launchPersistentContext(
    path.join(__dirname, "chrome-data"),
    {
      headless: false,
    }
  );

  const page = await context.newPage();

  // 1️⃣ Go to the jobs page once
  await page.goto(HANDSHAKE_JOBS_URL);

  // Small pause just so you can see what's happening
  await sleep(1000);

  const currentUrl = page.url();
  console.log("Current URL:", currentUrl);

  // Helper: what counts as a "login-ish" URL
  const isLoginUrl = (url) => {
    const u = url.toLowerCase();
    return (
      u.includes("login") ||
      u.includes("sso") ||
      u.includes("shibboleth") ||
      u.includes("duosecurity") ||
      u.includes("saml")
    );
  };

  // Helper: what counts as a "job page" URL (i.e., you're actually in Handshake)
  const isJobPageUrl = (url) => {
    const u = url.toLowerCase();
    return (
      u.includes("joinhandshake.com") &&
      (u.includes("/job-search") || u.includes("/stu/jobs"))
    );
  };

  // 2️⃣ If we're on a login-related page, wait for you to finish auth
  if (isLoginUrl(currentUrl)) {
    console.log("⚠️  You need to log in manually in this window.");
    console.log("   Use UCSC SSO + Duo. Don’t close the browser.");
    console.log(
      "   Once you land on your Handshake job search page, the script will continue."
    );

    // Wait until you're actually on a Handshake jobs page
    await page.waitForURL(
      (u) => {
        const url = u.toString();
        return isJobPageUrl(url);
      },
      { timeout: 0 } // wait as long as needed
    );

    console.log("✅ Detected Handshake jobs page after login.");
  } else {
    console.log("✅ Already on a jobs page, no login needed.");
  }

  // Make sure the page is fully loaded
  await page.waitForLoadState("networkidle");

  console.log("✨ Logged in — waiting for jobs to load...");

  // await page.waitForTimeout(3000);
  // await page.pause();

  // Wait for job cards to appear
  await page.waitForSelector('a[href*="/job-search/"]', { timeout: 15000 });

  console.log("✨ Jobs loaded — scraping...");

  const jobLinks = await page.$$eval('a[href*="/job-search/"]', (anchors) =>
    Array.from(new Set(anchors.map((a) => a.href)))
  );

  // Convert relative -> absolute
  const fullLinks = jobLinks.map((link) =>
    link.startsWith("http") ? link : "https://ucsc.joinhandshake.com" + link
  );

  console.log("Found jobs:", fullLinks.length);
  console.log(fullLinks);

  // ... here is where you'd loop over jobLinks and generate resumes
}

main();
