import "dotenv/config";
import { chromium } from "@playwright/test";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// __dirname workaround for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HANDSHAKE_JOBS_URL = process.env.HANDSHAKE_JOBS_URL;
const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE || "python";
const PYTHON_RESUME_SCRIPT = process.env.PYTHON_RESUME_SCRIPT;
const RESUME_OUTPUT_DIR =
  process.env.RESUME_OUTPUT_DIR || "../python-resume/generated";

if (!HANDSHAKE_JOBS_URL || !PYTHON_RESUME_SCRIPT) {
  console.error("Missing HANDSHAKE_JOBS_URL or PYTHON_RESUME_SCRIPT in .env");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ----- Python -> Resume generator -----
async function generateTailoredResume(jobDescription, jobTitle, companyName) {
  const safeTitle = jobTitle.replace(/[^a-z0-9]/gi, "_");
  const safeCompany = companyName.replace(/[^a-z0-9]/gi, "_");
  const filename = `${safeTitle}_${safeCompany}_${Date.now()}.docx`;

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

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error("Python script exited with code " + code));
      }

      try {
        const data = JSON.parse(stdout);
        if (data.error) return reject(new Error(data.error));
        resolve(data.docxPath);
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Opening Handshake...");
  await page.goto(HANDSHAKE_JOBS_URL, { waitUntil: "networkidle" });

  // Scroll to load jobs
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 2000);
    await sleep(randomInt(800, 1500));
  }

  // Collect job links
  const links = await page.$$eval('a[href*="/stu/jobs/"]', (anchors) =>
    Array.from(new Set(anchors.map((a) => a.href)))
  );

  console.log("Found jobs:", links.length);

  for (const link of links) {
    console.log("\n=== Opening job:", link);
    const jobPage = await context.newPage();
    await jobPage.goto(link, { waitUntil: "networkidle" });

    await jobPage.mouse.move(200, 200, { steps: 10 });
    await sleep(randomInt(800, 1500));
    await jobPage.mouse.wheel(0, 1200);

    // Extract data
    const jobTitle =
      (await jobPage.textContent("h1"))?.trim() || "Software Engineer";
    const companyName =
      (await jobPage.textContent('a[href*="/stu/employers/"]'))?.trim() ||
      "Company";

    const jobDescription =
      (await jobPage.textContent('[data-testid="job-description"]')) ||
      (await jobPage.textContent("main")) ||
      "";

    if (!jobDescription) {
      console.log("No job description found, skipping.");
      await jobPage.close();
      continue;
    }

    console.log(`Job: ${jobTitle} @ ${companyName}`);

    // Click Apply
    const applyButton = await jobPage.$('button:has-text("Apply")');
    if (!applyButton) {
      console.log("No Apply button. Skipping.");
      await jobPage.close();
      continue;
    }

    await applyButton.click();
    await sleep(randomInt(1500, 3000));

    const resumeInput = await jobPage.$('input[type="file"]');
    if (!resumeInput) {
      console.log("No resume field found. Skipping.");
      await jobPage.close();
      continue;
    }

    console.log("Generating tailored resume...");

    let resumePath;
    try {
      resumePath = await generateTailoredResume(
        jobDescription,
        jobTitle,
        companyName
      );
    } catch (err) {
      console.error("Resume generation failed:", err);
      await jobPage.close();
      continue;
    }

    console.log("Uploading:", resumePath);

    try {
      await resumeInput.setInputFiles(resumePath);
    } catch (err) {
      console.error("Failed to attach resume:", err);
    }

    console.log("⚠ Waiting for you to manually click Submit...");
    await sleep(randomInt(15000, 30000)); // 15-30 seconds

    await jobPage.close();
  }

  console.log("Done.");
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
