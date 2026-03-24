// =============================================================================
// MIGRATION 015 — Biometric Attendance
// =============================================================================

import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ---- Face Enrollments ----
  if (!(await knex.schema.hasTable("face_enrollments"))) {
    await knex.schema.createTable("face_enrollments", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.specificType("face_encoding", "LONGBLOB").nullable();
      t.string("thumbnail_path", 512).nullable();
      t.enum("enrollment_method", ["webcam", "upload", "device"]).notNullable().defaultTo("upload");
      t.decimal("quality_score", 5, 2).nullable();
      t.boolean("is_active").notNullable().defaultTo(true);
      t.bigInteger("enrolled_by")
        .unsigned()
        .nullable()
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "user_id"]);
      t.index(["organization_id", "is_active"]);
    });
  }

  // ---- Biometric Devices ----
  if (!(await knex.schema.hasTable("biometric_devices"))) {
    await knex.schema.createTable("biometric_devices", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.string("name", 100).notNullable();
      t.enum("type", ["face_terminal", "fingerprint_reader", "qr_scanner", "multi"]).notNullable();
      t.string("serial_number", 100).notNullable();
      t.string("ip_address", 45).nullable();
      t.bigInteger("location_id").unsigned().nullable();
      t.string("location_name", 200).nullable();
      t.enum("status", ["online", "offline", "maintenance"]).notNullable().defaultTo("offline");
      t.timestamp("last_heartbeat").nullable();
      t.string("api_key_hash", 255).notNullable();
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "is_active"]);
      t.index(["organization_id", "status"]);
    });
  }

  // ---- QR Codes ----
  if (!(await knex.schema.hasTable("qr_codes"))) {
    await knex.schema.createTable("qr_codes", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.string("code", 128).notNullable().unique();
      t.enum("type", ["static", "rotating"]).notNullable().defaultTo("rotating");
      t.timestamp("valid_from").notNullable();
      t.timestamp("valid_until").nullable();
      t.integer("rotation_interval_minutes").unsigned().nullable();
      t.boolean("is_active").notNullable().defaultTo(true);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "user_id"]);
      t.index(["code"]);
    });
  }

  // ---- Biometric Attendance Logs ----
  if (!(await knex.schema.hasTable("biometric_attendance_logs"))) {
    await knex.schema.createTable("biometric_attendance_logs", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE");
      t.bigInteger("user_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      t.enum("method", ["face", "fingerprint", "qr", "selfie"]).notNullable();
      t.bigInteger("device_id").unsigned().nullable();
      t.decimal("confidence_score", 5, 4).nullable();
      t.boolean("liveness_passed").nullable();
      t.decimal("latitude", 10, 7).nullable();
      t.decimal("longitude", 10, 7).nullable();
      t.string("image_path", 512).nullable();
      t.enum("scan_type", ["check_in", "check_out"]).notNullable();
      t.enum("result", ["success", "failed", "spoofing_detected", "no_match"]).notNullable();
      t.boolean("synced_to_attendance").notNullable().defaultTo(false);
      t.bigInteger("attendance_record_id").unsigned().nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.index(["organization_id", "user_id"]);
      t.index(["organization_id", "created_at"]);
      t.index(["device_id"]);
    });
  }

  // ---- Biometric Settings ----
  if (!(await knex.schema.hasTable("biometric_settings"))) {
    await knex.schema.createTable("biometric_settings", (t) => {
      t.bigIncrements("id").unsigned().primary();
      t.bigInteger("organization_id")
        .unsigned()
        .notNullable()
        .references("id")
        .inTable("organizations")
        .onDelete("CASCADE")
        .unique();
      t.decimal("face_match_threshold", 5, 4).notNullable().defaultTo(0.75);
      t.boolean("liveness_required").notNullable().defaultTo(true);
      t.boolean("selfie_geo_required").notNullable().defaultTo(true);
      t.integer("geo_radius_meters").unsigned().notNullable().defaultTo(200);
      t.enum("qr_type", ["static", "rotating"]).notNullable().defaultTo("rotating");
      t.integer("qr_rotation_minutes").unsigned().notNullable().defaultTo(5);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("biometric_settings");
  await knex.schema.dropTableIfExists("biometric_attendance_logs");
  await knex.schema.dropTableIfExists("qr_codes");
  await knex.schema.dropTableIfExists("biometric_devices");
  await knex.schema.dropTableIfExists("face_enrollments");
}
