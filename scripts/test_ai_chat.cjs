const http = require("http");

function req(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : "";
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    if (body) headers["Content-Length"] = Buffer.byteLength(body);
    const r = http.request({ hostname: "localhost", port: 3000, path, method, headers, timeout: 30000 }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, body: d }));
    });
    r.on("error", reject);
    r.on("timeout", () => { r.destroy(); reject(new Error("timeout")); });
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  // Login as regular user
  const login = await req("POST", "/api/v1/auth/login", {
    email: "ananya@technova.in",
    password: "Welcome@123",
  });
  const token = JSON.parse(login.body).data.tokens.access_token;
  console.log("Logged in as ananya");

  // Check AI status
  const status = await req("GET", "/api/v1/chatbot/ai-status", null, token);
  console.log("AI Status:", status.body.substring(0, 100));

  // Create conversation
  const conv = await req("POST", "/api/v1/chatbot/conversations", {}, token);
  const convId = JSON.parse(conv.body).data?.id;
  console.log("Conversation:", convId);

  if (!convId) {
    console.log("Failed to create conversation:", conv.body.substring(0, 200));
    process.exit(1);
  }

  // Send message
  console.log("Sending message...");
  const msg = await req("POST", "/api/v1/chatbot/conversations/" + convId + "/send", { message: "How many employees do we have?" }, token);
  console.log("Status:", msg.status);

  const parsed = JSON.parse(msg.body);
  if (parsed.success) {
    const content = parsed.data.assistantMessage.content;
    const metadata = parsed.data.assistantMessage.metadata;
    console.log("Engine:", metadata);
    console.log("Response:", content.substring(0, 300));
  } else {
    console.log("Error:", msg.body.substring(0, 300));
  }
})().catch((e) => console.error("Fatal:", e.message));
