// Must run from packages/server dir
const path = require("path");
process.chdir(path.resolve(__dirname, "../packages/server"));

// Manually load dotenv the same way the app does
try {
  require("dotenv").config();
} catch(e) {
  // dotenv v17 auto-injects
}

console.log("CWD:", process.cwd());
console.log("ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY ? "SET (" + process.env.ANTHROPIC_API_KEY.substring(0, 15) + "...)" : "NOT SET");
console.log("config would read:", process.env.ANTHROPIC_API_KEY || "(empty string)");

// Now check if it evaluates to truthy
const key = process.env.ANTHROPIC_API_KEY || "";
console.log("Truthy check:", !!key, "Length:", key.length);
