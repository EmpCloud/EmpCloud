require("dotenv").config();
const knex = require("knex");
const bcrypt = require("bcryptjs");

async function run() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const firstName = process.env.SUPER_ADMIN_FIRST_NAME || "Super";
  const lastName = process.env.SUPER_ADMIN_LAST_NAME || "Admin";
  const reset = process.env.SUPER_ADMIN_RESET === "1";
  if (!email || !password) throw new Error("Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD");
  if (password.length < 10) throw new Error("Password must be >= 10 chars");

  const db = knex({
    client: "mysql2",
    connection: {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || "empcloud",
    },
  });

  try {
    const hashed = await bcrypt.hash(password, 12);

    const existingUser = await db("users").where({ email }).first();
    if (existingUser) {
      if (!reset) {
        console.log("User " + email + " exists (id=" + existingUser.id + "). Pass SUPER_ADMIN_RESET=1 to reset.");
        return;
      }
      await db("users").where({ id: existingUser.id }).update({
        password: hashed,
        role: "super_admin",
        status: 1,
        updated_at: new Date(),
      });
      console.log("Reset password for " + email + " (id=" + existingUser.id + ")");
      return;
    }

    let platformOrgId;
    const existingOrg = await db("organizations")
      .where({ name: "EMP Cloud Platform" })
      .orWhere({ email: "admin@empcloud.com" })
      .first();
    if (existingOrg) {
      platformOrgId = existingOrg.id;
      console.log("Using platform org id=" + platformOrgId + " (" + existingOrg.name + ")");
    } else {
      const [insertedId] = await db("organizations").insert({
        name: "EMP Cloud Platform",
        email,
        timezone: "Asia/Kolkata",
        country: "IN",
        language: "en",
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });
      platformOrgId = insertedId;
      console.log("Created platform org id=" + platformOrgId);
    }

    await db("users").insert({
      organization_id: platformOrgId,
      first_name: firstName,
      last_name: lastName,
      email,
      password: hashed,
      role: "super_admin",
      designation: "Platform Administrator",
      status: 1,
      date_of_joining: "2025-01-01",
      created_at: new Date(),
      updated_at: new Date(),
    });
    console.log("super_admin created: " + email + " (org_id=" + platformOrgId + ")");
  } finally {
    await db.destroy();
  }
}

run().catch((err) => { console.error("Failed:", err.message || err); process.exit(1); });
