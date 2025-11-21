import fs from "fs";

// Step 1: Read the file and parse the outer array
let text = fs.readFileSync("temp.txt", "utf-8");
let arrayOfStrings = JSON.parse(text); // now you have an array of JSON strings

// Step 2: Parse each string into a real object
let arrayOfObjects = arrayOfStrings.map((str) => JSON.parse(str));

// Step 3: Pretty-print all objects into a new file
fs.writeFileSync(
  "temp-pretty.txt",
  JSON.stringify(arrayOfObjects, null, 2),
  "utf-8"
);

console.log("Parsed and pretty-printed JSON array saved to temp-pretty.txt");
