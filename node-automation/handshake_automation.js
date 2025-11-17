import "dotenv/config";
import { chromium } from "@playwright/test";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

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

  const payload = { jobDescription, jobTitle, companyName, outputPath };

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

// --------------- GraphQL fetch ----------------
async function fetchJobsGraphQL(cookie, first = 25, after = null) {
  const GRAPHQL_URL = "https://ucsc.joinhandshake.com/hs/graphql";

  const query = `
    query JobSearchQuery($first: Int, $after: String, $input: JobSearchInput) {
      jobSearch(first: $first, after: $after, input: $input) {
        totalCount
        edges {
          node {
            job {
              id
              title
              description
              employer { name }
              remote
              onSite
              hybrid
              locations { city state country }
              salaryRange { min max currency paySchedule { friendlyName } }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;

  const variables = {
    first,
    after,
    input: { filter: {}, sort: { direction: "ASC", field: "RELEVANCE" } },
  };

  const headers = {
    "Content-Type": "application/json",
    Cookie: cookie,
  };

  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: headers,
    body: JSON.stringify({ query, variables }),
  });

  const text = await res.clone().text(); // clone to read body separately
  const json = await res.json();

  // const text = await res.text();
  console.log("Response status:", res.status);
  console.log("Response text snippet:", text.slice(0, 500)); // just the first 500 chars

  const data = await res.json();
  return data.data.jobSearch;
}

async function main() {
  console.log("Opening Handshake...");

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
  const isLoginUrl = (url) =>
    /login|sso|shibboleth|duosecurity|saml/i.test(url);
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

  await page.addInitScript(() => {
    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);

      try {
        const cloned = response.clone();
        const json = await cloned.json();

        if (json?.data?.jobSearch) {
          console.log("🔥 Intercepted Job Search Results:");
          console.log(json.data.jobSearch);

          const jobs = json.data.jobSearch.edges.map((e) => ({
            title: e.node.job.title,
            company: e.node.job.employer.name,
            description: e.node.job.description,
            id: e.node.job.id,
          }));

          // Print all jobs as a JSON string for full visibility
          console.log("Parsed jobs:", JSON.stringify(jobs, null, 2));

          // Or print each job individually
          // jobs.forEach(job => console.log(job));

          window.latestJobs = jobs;
        }
      } catch (err) {
        console.error("Error parsing fetch response:", err);
      }

      return response;
    };
  });

  await page.goto(HANDSHAKE_JOBS_URL);
}

main();
