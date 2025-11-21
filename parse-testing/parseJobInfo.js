import util from "util";
import fs from "fs";
import readline from "readline";

util.inspect.defaultOptions.depth = null;

// ---- CONFIG ----
const filePath = "temp-pretty.txt"; // replace with your JSON or JSONL file

// ---- HELPER FUNCTION ----
function printJobInfo(jobNode) {
  if (!jobNode?.job) return;

  const job = jobNode.job;
  const employer = job.employer;
  const locations = job.locations || [];
  const salaryRange = job.salaryRange;

  console.log("====== JOB INFO ======");
  console.log("Job ID:", job.id);
  console.log("Title:", job.title);
  console.log("Job Type:", job.jobType?.name);
  console.log("Employment Type:", job.employmentType?.name);
  console.log("Duration:", job.duration);
  console.log("Remote:", job.remote);
  console.log("On-site:", job.onSite);
  console.log("Hybrid:", job.hybrid);
  console.log("Work Location Type:", job.workLocationType);
  console.log("Apply Start:", job.applyStart);
  console.log("Employer:", employer?.name);
  console.log("Employer ID:", employer?.id);

  if (locations.length > 0) {
    console.log("Locations:");
    locations.forEach((loc, i) => {
      console.log(`  [${i + 1}] ${loc.city}, ${loc.state}, ${loc.country}`);
    });
  }

  if (salaryRange) {
    console.log(
      "Salary Range:",
      `${salaryRange.min / 100} - ${salaryRange.max / 100} ${
        salaryRange.currency
      } (${salaryRange.paySchedule?.friendlyName})`
    );
  }

  console.log("Additional Benefits:", job.additionalBenefitsLink || "N/A");
  console.log("=================================\n");
}

// ---- PROCESS JSONL FILE ----
if (filePath.endsWith(".jsonl")) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  rl.on("line", (line, index) => {
    try {
      const obj = JSON.parse(line);
      if (obj?.data?.jobSearch?.edges) {
        obj.data.jobSearch.edges.forEach((edge) => printJobInfo(edge.node));
      }
    } catch (err) {
      // ignore invalid lines
    }
  });
} else {
  // JSON file
  const content = fs.readFileSync(filePath, "utf-8");
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    console.error("Failed to parse JSON:", err);
    process.exit(1);
  }

  // console.log("parsed : ", parsed);

  const output = fs.createWriteStream("parse-results.txt", { flags: "a" });
  function log(...args) {
    output.write(args.map((a) => util.format(a)).join(" ") + "\n");
  }

  log("parsed:", parsed);

  parsed.forEach((obj) => {
    const edges = obj?.data?.jobSearch?.edges || [];
    edges.forEach((edge) => printJobInfo(edge.node));
  });

  // const edges =
  //   parsed?.data?.jobSearch?.edges || (Array.isArray(parsed) ? parsed : []);
  // edges.forEach((edge) => printJobInfo(edge.node));
}
