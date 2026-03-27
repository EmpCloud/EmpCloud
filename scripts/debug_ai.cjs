// Debug: check what the config actually loads
process.chdir("/home/empcloud-development/empcloud-projects/empcloud/packages/server");
require("dotenv").config();

console.log("ANTHROPIC_API_KEY from process.env:", process.env.ANTHROPIC_API_KEY ? "SET (" + process.env.ANTHROPIC_API_KEY.substring(0, 20) + "...)" : "NOT SET");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "SET" : "NOT SET");
console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "SET" : "NOT SET");
console.log("NODE_ENV:", process.env.NODE_ENV);

// Check which .env dotenv loaded
const fs = require("fs");
const envPath = require("path").resolve(".env");
console.log("\n.env path:", envPath);
console.log(".env exists:", fs.existsSync(envPath));
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  const hasKey = content.includes("ANTHROPIC_API_KEY");
  console.log(".env has ANTHROPIC_API_KEY:", hasKey);
}
