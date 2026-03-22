// =============================================================================
// EMP CLOUD — OpenAPI / Swagger Documentation
// =============================================================================

import { Request, Response } from "express";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "EMP Cloud API",
    version: "1.0.0",
    description:
      "Master identity, subscription, and gateway platform for the EMP HRMS ecosystem. Serves as the OAuth2/OIDC authorization server and module registry for all sub-modules.",
  },
  servers: [{ url: "http://localhost:3000", description: "Local development" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http" as const,
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      ApiResponse: {
        type: "object" as const,
        properties: {
          success: { type: "boolean" },
          data: { type: "object" },
        },
      },
      PaginatedResponse: {
        type: "object" as const,
        properties: {
          success: { type: "boolean" },
          data: { type: "array", items: { type: "object" } },
          meta: {
            type: "object",
            properties: {
              page: { type: "integer" },
              per_page: { type: "integer" },
              total: { type: "integer" },
            },
          },
        },
      },
      Error: {
        type: "object" as const,
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
      User: {
        type: "object" as const,
        properties: {
          id: { type: "integer" },
          organization_id: { type: "integer" },
          email: { type: "string" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          role: { type: "string", enum: ["super_admin", "org_admin", "hr_manager", "manager", "employee"] },
          is_active: { type: "boolean" },
        },
      },
      Organization: {
        type: "object" as const,
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          legal_name: { type: "string" },
          country: { type: "string" },
          timezone: { type: "string" },
        },
      },
    },
  },
  paths: {
    // =========================================================================
    // AUTH
    // =========================================================================
    "/api/v1/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new organization and admin user",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["org_name", "email", "password", "first_name", "last_name"],
                properties: {
                  org_name: { type: "string" },
                  org_legal_name: { type: "string" },
                  org_country: { type: "string" },
                  org_state: { type: "string" },
                  org_timezone: { type: "string" },
                  org_email: { type: "string" },
                  first_name: { type: "string" },
                  last_name: { type: "string" },
                  email: { type: "string" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Organization and user created" },
          "400": { description: "Validation error" },
        },
      },
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login with email and password",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Login successful, returns tokens" },
          "401": { description: "Invalid credentials" },
        },
      },
    },
    "/api/v1/auth/change-password": {
      post: {
        tags: ["Auth"],
        summary: "Change current user password",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["current_password", "new_password"],
                properties: {
                  current_password: { type: "string" },
                  new_password: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Password changed" } },
      },
    },
    "/api/v1/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Request a password reset email",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { email: { type: "string" } } } } },
        },
        responses: { "200": { description: "Reset email sent if account exists" } },
      },
    },
    "/api/v1/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Reset password with token",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token", "password"],
                properties: { token: { type: "string" }, password: { type: "string" } },
              },
            },
          },
        },
        responses: { "200": { description: "Password reset successful" } },
      },
    },

    // =========================================================================
    // OAUTH
    // =========================================================================
    "/.well-known/openid-configuration": {
      get: {
        tags: ["OAuth"],
        summary: "OIDC Discovery document",
        security: [],
        responses: { "200": { description: "OpenID Configuration" } },
      },
    },
    "/oauth/jwks": {
      get: {
        tags: ["OAuth"],
        summary: "JSON Web Key Set",
        security: [],
        responses: { "200": { description: "JWKS" } },
      },
    },
    "/oauth/authorize": {
      get: {
        tags: ["OAuth"],
        summary: "OAuth2 Authorization endpoint",
        parameters: [
          { name: "client_id", in: "query", required: true, schema: { type: "string" } },
          { name: "redirect_uri", in: "query", required: true, schema: { type: "string" } },
          { name: "response_type", in: "query", required: true, schema: { type: "string" } },
          { name: "scope", in: "query", schema: { type: "string" } },
          { name: "state", in: "query", required: true, schema: { type: "string" } },
          { name: "code_challenge", in: "query", schema: { type: "string" } },
          { name: "code_challenge_method", in: "query", schema: { type: "string" } },
          { name: "nonce", in: "query", schema: { type: "string" } },
        ],
        responses: { "302": { description: "Redirect with authorization code" } },
      },
    },
    "/oauth/token": {
      post: {
        tags: ["OAuth"],
        summary: "Exchange authorization code or refresh token for tokens",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  grant_type: { type: "string", enum: ["authorization_code", "refresh_token", "client_credentials"] },
                  client_id: { type: "string" },
                  client_secret: { type: "string" },
                  code: { type: "string" },
                  redirect_uri: { type: "string" },
                  code_verifier: { type: "string" },
                  refresh_token: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Token response" } },
      },
    },
    "/oauth/revoke": {
      post: {
        tags: ["OAuth"],
        summary: "Revoke a token (RFC 7009)",
        security: [],
        responses: { "200": { description: "Token revoked" } },
      },
    },
    "/oauth/introspect": {
      post: {
        tags: ["OAuth"],
        summary: "Introspect a token (RFC 7662)",
        security: [],
        responses: { "200": { description: "Token introspection result" } },
      },
    },
    "/oauth/userinfo": {
      get: {
        tags: ["OAuth"],
        summary: "OIDC UserInfo endpoint",
        responses: { "200": { description: "User info" } },
      },
    },

    // =========================================================================
    // ORGANIZATIONS
    // =========================================================================
    "/api/v1/organizations/me": {
      get: {
        tags: ["Organizations"],
        summary: "Get current organization details",
        responses: { "200": { description: "Organization data" } },
      },
      put: {
        tags: ["Organizations"],
        summary: "Update current organization",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: { "200": { description: "Updated organization" } },
      },
    },
    "/api/v1/organizations/me/stats": {
      get: { tags: ["Organizations"], summary: "Get organization statistics", responses: { "200": { description: "Org stats" } } },
    },
    "/api/v1/organizations/me/departments": {
      get: { tags: ["Organizations"], summary: "List departments", responses: { "200": { description: "List of departments" } } },
      post: {
        tags: ["Organizations"],
        summary: "Create a department",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" } } } } } },
        responses: { "201": { description: "Department created" } },
      },
    },
    "/api/v1/organizations/me/departments/{id}": {
      delete: {
        tags: ["Organizations"],
        summary: "Delete a department",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Department deleted" } },
      },
    },
    "/api/v1/organizations/me/locations": {
      get: { tags: ["Organizations"], summary: "List locations", responses: { "200": { description: "List of locations" } } },
      post: {
        tags: ["Organizations"],
        summary: "Create a location",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "201": { description: "Location created" } },
      },
    },

    // =========================================================================
    // USERS
    // =========================================================================
    "/api/v1/users": {
      get: {
        tags: ["Users"],
        summary: "List users (paginated)",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "per_page", in: "query", schema: { type: "integer", default: 20 } },
          { name: "search", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Paginated user list" } },
      },
      post: {
        tags: ["Users"],
        summary: "Create a user (admin)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "201": { description: "User created" } },
      },
    },
    "/api/v1/users/{id}": {
      get: {
        tags: ["Users"],
        summary: "Get user by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "User data" } },
      },
      put: {
        tags: ["Users"],
        summary: "Update user",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "200": { description: "Updated user" } },
      },
      delete: {
        tags: ["Users"],
        summary: "Deactivate user",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "User deactivated" } },
      },
    },
    "/api/v1/users/invite": {
      post: {
        tags: ["Users"],
        summary: "Invite a user by email",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { email: { type: "string" }, role: { type: "string" } } } } } },
        responses: { "201": { description: "Invitation sent" } },
      },
    },
    "/api/v1/users/accept-invitation": {
      post: {
        tags: ["Users"],
        summary: "Accept an invitation with token",
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "201": { description: "User created from invitation" } },
      },
    },
    "/api/v1/users/org-chart": {
      get: { tags: ["Users"], summary: "Get organization chart tree", responses: { "200": { description: "Org chart data" } } },
    },
    "/api/v1/users/import": {
      post: {
        tags: ["Users"],
        summary: "Upload CSV for import preview",
        requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } } } },
        responses: { "200": { description: "Import preview" } },
      },
    },
    "/api/v1/users/import/execute": {
      post: {
        tags: ["Users"],
        summary: "Execute user import from CSV",
        requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } } } },
        responses: { "201": { description: "Import executed" } },
      },
    },

    // =========================================================================
    // EMPLOYEES
    // =========================================================================
    "/api/v1/employees/directory": {
      get: {
        tags: ["Employees"],
        summary: "Employee directory (paginated, searchable)",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "per_page", in: "query", schema: { type: "integer" } },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "department_id", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Paginated employee directory" } },
      },
    },
    "/api/v1/employees/birthdays": {
      get: { tags: ["Employees"], summary: "Get upcoming birthdays", responses: { "200": { description: "Birthday list" } } },
    },
    "/api/v1/employees/anniversaries": {
      get: { tags: ["Employees"], summary: "Get upcoming work anniversaries", responses: { "200": { description: "Anniversary list" } } },
    },
    "/api/v1/employees/headcount": {
      get: { tags: ["Employees"], summary: "Get headcount breakdown (HR only)", responses: { "200": { description: "Headcount data" } } },
    },
    "/api/v1/employees/{id}/profile": {
      get: {
        tags: ["Employees"],
        summary: "Get employee profile",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Employee profile" } },
      },
      put: {
        tags: ["Employees"],
        summary: "Update employee profile",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "200": { description: "Updated profile" } },
      },
    },
    "/api/v1/employees/{id}/addresses": {
      get: {
        tags: ["Employees"],
        summary: "List employee addresses",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Address list" } },
      },
      post: {
        tags: ["Employees"],
        summary: "Add employee address",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "201": { description: "Address created" } },
      },
    },
    "/api/v1/employees/{id}/education": {
      get: {
        tags: ["Employees"],
        summary: "List employee education records",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Education list" } },
      },
      post: {
        tags: ["Employees"],
        summary: "Add education record",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "201": { description: "Education record created" } },
      },
    },
    "/api/v1/employees/{id}/experience": {
      get: {
        tags: ["Employees"],
        summary: "List employee work experience",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Experience list" } },
      },
      post: {
        tags: ["Employees"],
        summary: "Add work experience",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "201": { description: "Experience record created" } },
      },
    },
    "/api/v1/employees/{id}/dependents": {
      get: {
        tags: ["Employees"],
        summary: "List employee dependents",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Dependent list" } },
      },
      post: {
        tags: ["Employees"],
        summary: "Add dependent",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "201": { description: "Dependent created" } },
      },
    },

    // =========================================================================
    // ATTENDANCE
    // =========================================================================
    "/api/v1/attendance/shifts": {
      get: { tags: ["Attendance"], summary: "List shifts", responses: { "200": { description: "Shift list" } } },
      post: {
        tags: ["Attendance"],
        summary: "Create a shift (HR)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "201": { description: "Shift created" } },
      },
    },
    "/api/v1/attendance/shifts/{id}": {
      put: {
        tags: ["Attendance"],
        summary: "Update a shift",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Shift updated" } },
      },
      delete: {
        tags: ["Attendance"],
        summary: "Deactivate a shift",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Shift deactivated" } },
      },
    },
    "/api/v1/attendance/shifts/assign": {
      post: { tags: ["Attendance"], summary: "Assign shift to employee (HR)", responses: { "201": { description: "Shift assigned" } } },
    },
    "/api/v1/attendance/shifts/assignments": {
      get: { tags: ["Attendance"], summary: "List shift assignments (HR)", responses: { "200": { description: "Assignment list" } } },
    },
    "/api/v1/attendance/geo-fences": {
      get: { tags: ["Attendance"], summary: "List geo-fences", responses: { "200": { description: "Geo-fence list" } } },
      post: { tags: ["Attendance"], summary: "Create geo-fence (HR)", responses: { "201": { description: "Geo-fence created" } } },
    },
    "/api/v1/attendance/geo-fences/{id}": {
      put: {
        tags: ["Attendance"],
        summary: "Update geo-fence",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Geo-fence updated" } },
      },
      delete: {
        tags: ["Attendance"],
        summary: "Deactivate geo-fence",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Geo-fence deactivated" } },
      },
    },
    "/api/v1/attendance/check-in": {
      post: { tags: ["Attendance"], summary: "Check in", responses: { "201": { description: "Checked in" } } },
    },
    "/api/v1/attendance/check-out": {
      post: { tags: ["Attendance"], summary: "Check out", responses: { "200": { description: "Checked out" } } },
    },
    "/api/v1/attendance/me/today": {
      get: { tags: ["Attendance"], summary: "Get today's attendance record", responses: { "200": { description: "Today's record" } } },
    },
    "/api/v1/attendance/me/history": {
      get: {
        tags: ["Attendance"],
        summary: "Get attendance history",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "per_page", in: "query", schema: { type: "integer" } },
          { name: "month", in: "query", schema: { type: "integer" } },
          { name: "year", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Paginated history" } },
      },
    },
    "/api/v1/attendance/records": {
      get: { tags: ["Attendance"], summary: "List all attendance records (HR)", responses: { "200": { description: "Paginated records" } } },
    },
    "/api/v1/attendance/dashboard": {
      get: { tags: ["Attendance"], summary: "Attendance dashboard stats (HR)", responses: { "200": { description: "Dashboard stats" } } },
    },
    "/api/v1/attendance/monthly-report": {
      get: { tags: ["Attendance"], summary: "Monthly attendance report (HR)", responses: { "200": { description: "Monthly report" } } },
    },
    "/api/v1/attendance/regularizations": {
      get: { tags: ["Attendance"], summary: "List regularization requests (HR)", responses: { "200": { description: "Paginated regularizations" } } },
      post: { tags: ["Attendance"], summary: "Submit regularization request", responses: { "201": { description: "Regularization submitted" } } },
    },
    "/api/v1/attendance/regularizations/me": {
      get: { tags: ["Attendance"], summary: "Get my regularization requests", responses: { "200": { description: "My regularizations" } } },
    },
    "/api/v1/attendance/regularizations/{id}/approve": {
      put: {
        tags: ["Attendance"],
        summary: "Approve or reject regularization (HR)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Regularization processed" } },
      },
    },

    // =========================================================================
    // LEAVE
    // =========================================================================
    "/api/v1/leave/types": {
      get: { tags: ["Leave"], summary: "List leave types", responses: { "200": { description: "Leave types" } } },
      post: { tags: ["Leave"], summary: "Create leave type (HR)", responses: { "201": { description: "Leave type created" } } },
    },
    "/api/v1/leave/types/{id}": {
      get: {
        tags: ["Leave"],
        summary: "Get leave type by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Leave type" } },
      },
      put: {
        tags: ["Leave"],
        summary: "Update leave type (HR)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Leave type updated" } },
      },
      delete: {
        tags: ["Leave"],
        summary: "Deactivate leave type (HR)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Leave type deactivated" } },
      },
    },
    "/api/v1/leave/policies": {
      get: { tags: ["Leave"], summary: "List leave policies", responses: { "200": { description: "Leave policies" } } },
      post: { tags: ["Leave"], summary: "Create leave policy (HR)", responses: { "201": { description: "Leave policy created" } } },
    },
    "/api/v1/leave/policies/{id}": {
      get: {
        tags: ["Leave"],
        summary: "Get leave policy",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Leave policy" } },
      },
      put: {
        tags: ["Leave"],
        summary: "Update leave policy (HR)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Leave policy updated" } },
      },
      delete: {
        tags: ["Leave"],
        summary: "Deactivate leave policy (HR)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Leave policy deactivated" } },
      },
    },
    "/api/v1/leave/balances": {
      get: {
        tags: ["Leave"],
        summary: "Get leave balances",
        parameters: [
          { name: "user_id", in: "query", schema: { type: "integer" } },
          { name: "year", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Leave balances" } },
      },
    },
    "/api/v1/leave/balances/initialize": {
      post: { tags: ["Leave"], summary: "Initialize leave balances for a year (HR)", responses: { "201": { description: "Balances initialized" } } },
    },
    "/api/v1/leave/applications": {
      get: { tags: ["Leave"], summary: "List leave applications", responses: { "200": { description: "Paginated leave applications" } } },
      post: { tags: ["Leave"], summary: "Apply for leave", responses: { "201": { description: "Leave application created" } } },
    },
    "/api/v1/leave/applications/{id}": {
      get: {
        tags: ["Leave"],
        summary: "Get leave application",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Leave application" } },
      },
    },
    "/api/v1/leave/applications/{id}/approve": {
      put: {
        tags: ["Leave"],
        summary: "Approve leave application",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Leave approved" } },
      },
    },
    "/api/v1/leave/applications/{id}/reject": {
      put: {
        tags: ["Leave"],
        summary: "Reject leave application",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Leave rejected" } },
      },
    },
    "/api/v1/leave/applications/{id}/cancel": {
      put: {
        tags: ["Leave"],
        summary: "Cancel leave application",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Leave cancelled" } },
      },
    },
    "/api/v1/leave/calendar": {
      get: {
        tags: ["Leave"],
        summary: "Get leave calendar for a month",
        parameters: [
          { name: "month", in: "query", schema: { type: "integer" } },
          { name: "year", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Leave calendar" } },
      },
    },
    "/api/v1/leave/comp-off": {
      get: { tags: ["Leave"], summary: "List comp-off requests", responses: { "200": { description: "Comp-off list" } } },
      post: { tags: ["Leave"], summary: "Request comp-off", responses: { "201": { description: "Comp-off requested" } } },
    },
    "/api/v1/leave/comp-off/{id}/approve": {
      put: {
        tags: ["Leave"],
        summary: "Approve comp-off",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Comp-off approved" } },
      },
    },
    "/api/v1/leave/comp-off/{id}/reject": {
      put: {
        tags: ["Leave"],
        summary: "Reject comp-off",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Comp-off rejected" } },
      },
    },

    // =========================================================================
    // DOCUMENTS
    // =========================================================================
    "/api/v1/documents": {
      get: {
        tags: ["Documents"],
        summary: "List documents (paginated)",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "per_page", in: "query", schema: { type: "integer" } },
          { name: "user_id", in: "query", schema: { type: "integer" } },
          { name: "category_id", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Paginated documents" } },
      },
    },
    "/api/v1/documents/upload": {
      post: {
        tags: ["Documents"],
        summary: "Upload a document",
        requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", properties: { file: { type: "string", format: "binary" }, category_id: { type: "integer" }, name: { type: "string" } } } } } },
        responses: { "201": { description: "Document uploaded" } },
      },
    },
    "/api/v1/documents/categories": {
      get: { tags: ["Documents"], summary: "List document categories", responses: { "200": { description: "Category list" } } },
      post: { tags: ["Documents"], summary: "Create document category (HR)", responses: { "201": { description: "Category created" } } },
    },
    "/api/v1/documents/categories/{id}": {
      put: {
        tags: ["Documents"],
        summary: "Update document category",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Category updated" } },
      },
    },
    "/api/v1/documents/tracking/mandatory": {
      get: { tags: ["Documents"], summary: "Get mandatory document tracking (HR)", responses: { "200": { description: "Mandatory tracking data" } } },
    },
    "/api/v1/documents/tracking/expiry": {
      get: { tags: ["Documents"], summary: "Get expiring documents (HR)", responses: { "200": { description: "Expiry alerts" } } },
    },
    "/api/v1/documents/{id}": {
      get: {
        tags: ["Documents"],
        summary: "Get document by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Document" } },
      },
      delete: {
        tags: ["Documents"],
        summary: "Delete document (HR)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Document deleted" } },
      },
    },
    "/api/v1/documents/{id}/download": {
      get: {
        tags: ["Documents"],
        summary: "Download document file",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "File download" } },
      },
    },
    "/api/v1/documents/{id}/verify": {
      put: {
        tags: ["Documents"],
        summary: "Verify a document (HR)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Document verified" } },
      },
    },

    // =========================================================================
    // ANNOUNCEMENTS
    // =========================================================================
    "/api/v1/announcements": {
      get: { tags: ["Announcements"], summary: "List announcements (paginated)", responses: { "200": { description: "Paginated announcements" } } },
      post: { tags: ["Announcements"], summary: "Create announcement (HR)", responses: { "201": { description: "Announcement created" } } },
    },
    "/api/v1/announcements/unread-count": {
      get: { tags: ["Announcements"], summary: "Get unread announcement count", responses: { "200": { description: "Unread count" } } },
    },
    "/api/v1/announcements/{id}": {
      put: {
        tags: ["Announcements"],
        summary: "Update announcement (HR)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Announcement updated" } },
      },
      delete: {
        tags: ["Announcements"],
        summary: "Delete announcement (HR)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Announcement deleted" } },
      },
    },
    "/api/v1/announcements/{id}/read": {
      post: {
        tags: ["Announcements"],
        summary: "Mark announcement as read",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Marked as read" } },
      },
    },

    // =========================================================================
    // POLICIES
    // =========================================================================
    "/api/v1/policies": {
      get: { tags: ["Policies"], summary: "List policies (paginated)", responses: { "200": { description: "Paginated policies" } } },
      post: { tags: ["Policies"], summary: "Create policy (HR)", responses: { "201": { description: "Policy created" } } },
    },
    "/api/v1/policies/pending": {
      get: { tags: ["Policies"], summary: "Get policies pending acknowledgment", responses: { "200": { description: "Pending policies" } } },
    },
    "/api/v1/policies/{id}": {
      get: {
        tags: ["Policies"],
        summary: "Get policy by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Policy" } },
      },
      put: {
        tags: ["Policies"],
        summary: "Update policy (HR)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Policy updated" } },
      },
      delete: {
        tags: ["Policies"],
        summary: "Deactivate policy (HR)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Policy deactivated" } },
      },
    },
    "/api/v1/policies/{id}/acknowledge": {
      post: {
        tags: ["Policies"],
        summary: "Acknowledge a policy",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Policy acknowledged" } },
      },
    },
    "/api/v1/policies/{id}/acknowledgments": {
      get: {
        tags: ["Policies"],
        summary: "Get acknowledgment status (HR)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Acknowledgment list" } },
      },
    },

    // =========================================================================
    // MODULES
    // =========================================================================
    "/api/v1/modules": {
      get: { tags: ["Modules"], summary: "List all active modules (marketplace)", responses: { "200": { description: "Module list" } } },
      post: { tags: ["Modules"], summary: "Create module (super admin)", responses: { "201": { description: "Module created" } } },
    },
    "/api/v1/modules/{id}": {
      get: {
        tags: ["Modules"],
        summary: "Get module by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Module" } },
      },
      put: {
        tags: ["Modules"],
        summary: "Update module (super admin)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Module updated" } },
      },
    },
    "/api/v1/modules/{id}/features": {
      get: {
        tags: ["Modules"],
        summary: "Get module features",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Feature list" } },
      },
    },

    // =========================================================================
    // SUBSCRIPTIONS
    // =========================================================================
    "/api/v1/subscriptions": {
      get: { tags: ["Subscriptions"], summary: "List organization subscriptions", responses: { "200": { description: "Subscription list" } } },
      post: { tags: ["Subscriptions"], summary: "Subscribe to a module (admin)", responses: { "201": { description: "Subscription created" } } },
    },
    "/api/v1/subscriptions/billing-summary": {
      get: { tags: ["Subscriptions"], summary: "Get billing summary", responses: { "200": { description: "Billing summary" } } },
    },
    "/api/v1/subscriptions/{id}": {
      get: {
        tags: ["Subscriptions"],
        summary: "Get subscription by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Subscription" } },
      },
      put: {
        tags: ["Subscriptions"],
        summary: "Update subscription (admin)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Subscription updated" } },
      },
      delete: {
        tags: ["Subscriptions"],
        summary: "Cancel subscription (admin)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Subscription cancelled" } },
      },
    },
    "/api/v1/subscriptions/{id}/seats": {
      get: {
        tags: ["Subscriptions"],
        summary: "List seats for a subscription",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Seat list" } },
      },
    },
    "/api/v1/subscriptions/assign-seat": {
      post: { tags: ["Subscriptions"], summary: "Assign a module seat to a user (admin)", responses: { "201": { description: "Seat assigned" } } },
    },
    "/api/v1/subscriptions/revoke-seat": {
      post: { tags: ["Subscriptions"], summary: "Revoke a module seat (admin)", responses: { "200": { description: "Seat revoked" } } },
    },
    "/api/v1/subscriptions/check-access": {
      post: {
        tags: ["Subscriptions"],
        summary: "Check module access for a user (used by sub-modules)",
        security: [],
        responses: { "200": { description: "Access check result" } },
      },
    },

    // =========================================================================
    // AUDIT
    // =========================================================================
    "/api/v1/audit": {
      get: {
        tags: ["Audit"],
        summary: "Get audit logs (admin)",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "per_page", in: "query", schema: { type: "integer" } },
          { name: "action", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Paginated audit logs" } },
      },
    },

    // =========================================================================
    // HEALTH
    // =========================================================================
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        security: [],
        responses: { "200": { description: "Server is healthy" } },
      },
    },
  },
};

export function swaggerUIHandler(_req: Request, res: Response) {
  res.send(`<!DOCTYPE html>
<html><head><title>EMP Cloud API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head><body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/api/docs/openapi.json', dom_id: '#swagger-ui' })</script>
</body></html>`);
}

export function openapiHandler(_req: Request, res: Response) {
  res.json(spec);
}
