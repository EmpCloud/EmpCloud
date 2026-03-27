const http = require("http");

function req(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : "";
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    if (body) headers["Content-Length"] = Buffer.byteLength(body);
    const r = http.request({ hostname: "localhost", port: 3000, path, method, headers }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, body: d }));
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  // Login as super admin
  const login = await req("POST", "/api/v1/auth/login", {
    email: "admin@empcloud.com",
    password: "SuperAdmin@2026",
  });
  const token = JSON.parse(login.body).data.tokens.access_token;
  console.log("Logged in as super admin");

  // Set Anthropic API key
  const r1 = await req(
    "PUT",
    "/api/v1/admin/ai-config/anthropic_api_key",
    { value: "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" },
    token
  );
  console.log("Set API key:", r1.status, JSON.parse(r1.body).success ? "OK" : r1.body.substring(0, 100));

  // Set model
  const r2 = await req("PUT", "/api/v1/admin/ai-config/ai_model", { value: "claude-sonnet-4-20250514" }, token);
  console.log("Set model:", r2.status, JSON.parse(r2.body).success ? "OK" : r2.body.substring(0, 100));

  // Set active provider
  const r3 = await req("PUT", "/api/v1/admin/ai-config/active_provider", { value: "anthropic" }, token);
  console.log("Set provider:", r3.status, JSON.parse(r3.body).success ? "OK" : r3.body.substring(0, 100));

  // Set max tokens
  const r4 = await req("PUT", "/api/v1/admin/ai-config/ai_max_tokens", { value: "4096" }, token);
  console.log("Set max tokens:", r4.status, JSON.parse(r4.body).success ? "OK" : r4.body.substring(0, 100));

  // Test connection
  const r5 = await req(
    "POST",
    "/api/v1/admin/ai-config/test",
    {
      provider: "anthropic",
      api_key: "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",
      model: "claude-sonnet-4-20250514",
    },
    token
  );
  console.log("Test connection:", r5.status, r5.body.substring(0, 200));

  // Check status
  const r6 = await req("GET", "/api/v1/admin/ai-config/status", null, token);
  console.log("AI Status:", r6.body.substring(0, 200));

  // Test chatbot with a real question
  const r7 = await req("POST", "/api/v1/chatbot/conversations", {}, token);
  const convId = JSON.parse(r7.body).data?.id;
  console.log("\nConversation:", convId);

  if (convId) {
    const r8 = await req(
      "POST",
      "/api/v1/chatbot/conversations/" + convId + "/send",
      { message: "How many employees do we have?" },
      token
    );
    console.log("AI Response:", r8.body.substring(0, 500));
  }
})().catch((e) => console.error("Error:", e.message));
