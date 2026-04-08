const bcrypt = require("bcryptjs");
const knex = require("knex")({
  client: "mysql2",
  connection: { host: "localhost", port: 3306, user: "empcloud", password: process.env.DB_PASSWORD || "", database: "empcloud" }
});

async function main() {
  const hash = bcrypt.hashSync(process.env.TEST_USER_PASSWORD || "Welcome@123", 12);

  const companies = [
    { name: "GlobalTech Inc.", legal_name: "GlobalTech Inc.", email: "admin@globaltech.com", country: "US", timezone: "America/New_York", admin_first: "John", admin_last: "Smith", admin_email: "john@globaltech.com", depts: ["Engineering", "Marketing", "Sales", "Finance"] },
    { name: "Berlin Digital GmbH", legal_name: "Berlin Digital GmbH", email: "info@berlindigital.de", country: "DE", timezone: "Europe/Berlin", admin_first: "Anna", admin_last: "Mueller", admin_email: "anna@berlindigital.de", depts: ["Product", "Design", "Development", "Operations"] },
    { name: "Tokyo Systems K.K.", legal_name: "Tokyo Systems K.K.", email: "contact@tokyosystems.jp", country: "JP", timezone: "Asia/Tokyo", admin_first: "Yuki", admin_last: "Tanaka", admin_email: "yuki@tokyosystems.jp", depts: ["R&D", "QA", "DevOps", "Support"] },
    { name: "Cape Analytics Pty Ltd", legal_name: "Cape Analytics Pty Ltd", email: "hello@capeanalytics.co.za", country: "ZA", timezone: "Africa/Johannesburg", admin_first: "Thabo", admin_last: "Mokoena", admin_email: "thabo@capeanalytics.co.za", depts: ["Data Science", "Analytics", "Client Services"] },
    { name: "Dubai Commerce LLC", legal_name: "Dubai Commerce LLC", email: "info@dubaicommerce.ae", country: "AE", timezone: "Asia/Dubai", admin_first: "Fatima", admin_last: "Al-Hassan", admin_email: "fatima@dubaicommerce.ae", depts: ["Trade", "Logistics", "Compliance", "HR"] },
  ];

  for (const co of companies) {
    const existing = await knex("organizations").where({ email: co.email }).first();
    if (existing) { console.log("SKIP:", co.name, "(exists)"); continue; }

    const [orgId] = await knex("organizations").insert({
      name: co.name, legal_name: co.legal_name, email: co.email,
      country: co.country, timezone: co.timezone, language: "en",
      current_user_count: co.depts.length + 4, total_allowed_user_count: 50,
      is_active: true, created_at: new Date(), updated_at: new Date()
    });

    for (const dept of co.depts) {
      await knex("organization_departments").insert({
        organization_id: orgId, name: dept,
        created_at: new Date(), updated_at: new Date()
      });
    }

    // Admin user
    await knex("users").insert({
      organization_id: orgId, first_name: co.admin_first, last_name: co.admin_last,
      email: co.admin_email, password: hash, role: "org_admin",
      designation: "Administrator", status: 1, date_of_joining: "2025-06-01",
      created_at: new Date(), updated_at: new Date()
    });

    // 3 more employees
    const domain = co.email.split("@")[1];
    const emps = [
      { first: "Dev", last: "Engineer", role: "employee", desig: "Software Engineer", email: "dev@" + domain },
      { first: "Sarah", last: "HR", role: "hr_admin", desig: "HR Manager", email: "hr@" + domain },
      { first: "Mike", last: "Lead", role: "manager", desig: "Team Lead", email: "lead@" + domain },
    ];
    for (const emp of emps) {
      await knex("users").insert({
        organization_id: orgId, first_name: emp.first, last_name: emp.last,
        email: emp.email, password: hash, role: emp.role,
        designation: emp.desig, status: 1, date_of_joining: "2025-07-01",
        created_at: new Date(), updated_at: new Date()
      });
    }

    console.log("CREATED:", co.name, "(orgId:", orgId + ") -", co.depts.length, "depts + 4 users");
  }

  // Summary
  const orgs = await knex("organizations").select("id", "name", "email", "country");
  console.log("\nAll organizations:");
  for (const o of orgs) console.log("  " + o.id + " " + o.name + " - " + o.email + " (" + o.country + ")");

  const userCount = await knex("users").count("* as c").first();
  console.log("Total users:", userCount.c);

  await knex.destroy();
}

main().catch(e => { console.error(e.message); process.exit(1); });
