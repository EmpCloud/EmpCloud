# EMP Cloud Ecosystem — Project Progress

## Last Updated: 2026-03-23

## Overview
EMP Cloud is a comprehensive HRMS ecosystem with a central platform (EMP Cloud) and modular add-ons. Each module is a separate repo with its own database, server, and client — connected via OAuth2/OIDC SSO.

---

## Architecture Decisions

- **EMP Cloud = Core HRMS** — not a separate module. Attendance, leave, profiles, docs, announcements, policies are built into the platform. Free with subscription.
- **EMP Billing = Internal billing engine** — handles subscription billing for EMP Cloud. NOT a sellable module. NOT in the marketplace.
- **EMP Attendance = Part of Core HRMS** — NOT a separate module. Built into EMP Cloud.
- **EMP Field & EMP Biometrics = Already built** by another team. Not in our build scope.
- **EMP Projects = Already built** by another team. Not in our build scope.
- **9 sellable modules** in the marketplace: Payroll, Monitor, Recruit, Field, Biometrics, Projects, Rewards, Performance, Exit

## SSO Flow
EMP Cloud dashboard → user clicks "Launch" on a module → URL opens with `?sso_token=<JWT>` → module's client extracts token → calls `POST /auth/sso` → server decodes EMP Cloud RS256 JWT, validates user in empcloud DB, issues module-specific HS256 JWT → user is auto-authenticated.

---

## Modules Built

### 1. EMP Cloud + Core HRMS
- **Repo**: c:\Users\Admin\empcloud-projects\empcloud\
- **GitHub**: https://github.com/EmpCloud/EmpCloud
- **Ports**: Server 3000, Client 5173
- **Database**: empcloud
- **What's built**:
  - OAuth2/OIDC authorization server (RS256 JWT)
  - Organization & user management with RBAC
  - Module marketplace with seat-based subscriptions
  - Audit logging (SOC 2)
  - Employee extended profiles (education, experience, dependents, addresses)
  - Attendance management (shifts, geo-fencing, check-in/out, regularization)
  - Leave management (custom types, policies, multi-level approval, calendar)
  - Document management (categories, upload, verification, expiry alerts)
  - Announcements (targeted by dept/role, read tracking)
  - Company policies (versioning, acknowledgment tracking)
  - Org chart visualization
  - Notification center
  - Bulk employee import
  - Employee self-service dashboard
  - Unified dashboard widgets (pulls data from all module APIs)
  - API documentation (Swagger UI at /api/docs)
- **Tables**: 40+ across 11 migrations
- **Tests**: 45 API + 13 Playwright E2E

### 2. EMP Recruit (ATS)
- **Repo**: c:\Users\Admin\empcloud-projects\emp-recruit\
- **GitHub**: https://github.com/EmpCloud/emp-recruit
- **Ports**: Server 4500, Client 5179
- **Database**: emp_recruit
- **Ngrok**: unliterary-acronically-sharee.ngrok-free.dev
- **What's built**:
  - Job postings with status management
  - Candidate management with resume upload
  - ATS Kanban pipeline (Applied → Screened → Interview → Offer → Hired)
  - Interview scheduling with Jitsi Meet video conferencing
  - Google Calendar / Outlook / Office 365 integration
  - Interview recording upload + transcript generation
  - Structured feedback scorecards
  - Offer management with multi-level approval
  - Offer letter PDF generation from Handlebars templates
  - Onboarding checklists with template system
  - Employee referral tracking
  - Public career page (no auth required)
  - Candidate portal (magic link auth, application tracking)
  - AI resume scoring (skill matching, auto-scoring 0-100, rankings)
  - Custom pipeline stages per org
  - Candidate comparison (side-by-side)
  - Email templates with Handlebars
  - Recruitment analytics (pipeline funnel, time-to-hire, source effectiveness)
  - SSO from EMP Cloud
  - API documentation
- **Tables**: 22+ across 5 migrations
- **Tests**: 115 (55 API E2E + 33 interview E2E + 6 SSO unit + 21 Playwright)

### 3. EMP Performance
- **Repo**: c:\Users\Admin\empcloud-projects\emp-performance\
- **GitHub**: https://github.com/EmpCloud/emp-performance
- **Ports**: Server 4300, Client 5177
- **Database**: emp_performance
- **What's built**:
  - Competency frameworks with weighted competencies
  - Review cycles (quarterly/annual/360/probation)
  - Self, manager, and peer reviews with competency ratings
  - Goals & OKR tracking with key results and check-ins
  - Goal alignment tree (company → dept → team → individual cascade)
  - Performance Improvement Plans (PIPs) with objectives
  - Career paths with level-based progression
  - 1-on-1 meeting scheduling with agenda items
  - Continuous feedback / kudos wall
  - 9-Box Grid (Performance vs Potential matrix)
  - Succession planning with candidate readiness
  - Performance letter generation (appraisal, increment, promotion)
  - Skills gap analysis with learning recommendations
  - Automated email reminders (BullMQ: review deadlines, PIP check-ins, meeting reminders, goal deadlines)
  - Bell curve analytics, trends, team comparisons
  - Peer review nominations
  - SSO from EMP Cloud
  - API documentation
- **Tables**: 25+ across 4 migrations
- **Pages**: 30+

### 4. EMP Rewards
- **Repo**: c:\Users\Admin\empcloud-projects\emp-rewards\
- **GitHub**: https://github.com/EmpCloud/emp-rewards
- **Ports**: Server 4600, Client 5180
- **Database**: emp_rewards
- **What's built**:
  - Peer kudos with reactions (like/clap/heart) and comments
  - Points system with transparent ledger
  - Badges (auto-awarded + manual) with criteria evaluation
  - Reward catalog with point-based redemption
  - Redemption approval workflow
  - Nomination programs (Employee of the Month, etc.)
  - Leaderboards (weekly/monthly/quarterly/yearly)
  - Budget management per manager/department
  - Celebrations feed (auto-detect birthdays & anniversaries)
  - Slack integration (webhook notifications, slash commands)
  - Team challenges with progress tracking
  - Automated milestone rewards (anniversary, kudos count milestones)
  - Manager recognition dashboard
  - Analytics (trends, categories, department participation)
  - SSO from EMP Cloud
  - API documentation
- **Tables**: 21+ across 4 migrations
- **Pages**: 22+

### 5. EMP Exit
- **Repo**: c:\Users\Admin\empcloud-projects\emp-exit\
- **GitHub**: https://github.com/EmpCloud/emp-exit
- **Ports**: Server 4400, Client 5178
- **Database**: emp_exit
- **What's built**:
  - Exit request management (resignation/termination/retirement/etc.)
  - Configurable exit checklists with templates
  - Multi-department clearance workflow
  - Structured exit interviews with question templates
  - Full & Final settlement calculator (salary, leave encashment, gratuity, deductions)
  - Asset return tracking
  - Knowledge transfer management with successor assignment
  - Letter generation (experience, relieving, service certificate) with Handlebars templates
  - Alumni network directory
  - Predictive attrition dashboard (flight risk scoring 0-100)
  - Notice period buyout calculator with F&F integration
  - Exit stage email notifications
  - Rehire workflow (alumni → screening → re-onboard)
  - Exit survey NPS (Net Promoter Score)
  - Attrition analytics (rate, reasons, department trends, tenure distribution)
  - SSO from EMP Cloud
  - API documentation
- **Tables**: 24+ across 5 migrations
- **Pages**: 25+

### 6. EMP Payroll (pre-existing, built separately)
- **Repo**: c:\Users\Admin\empcloud-projects\emp-payroll\
- **GitHub**: https://github.com/EmpCloud/emp-payroll
- **Ports**: Server 4000, Client 5175
- **Database**: emp_payroll
- **192 source files, 38 services, 18 routes, 35 pages, 24 test files**

---

## Infrastructure

### Ngrok Tunnels
- **EMP Cloud**: rapturously-tracheidal-cadence.ngrok-free.dev (authtoken: 3BAf1mJou1zUVsptbBOmrHA0xkT_Hs5ogvqmzgWQPNmgmUoE)
- **EMP Recruit**: unliterary-acronically-sharee.ngrok-free.dev (authtoken: 3BAfPGVelN9NvW2pscfqYimJWe1_5ZqNKyPQbntWCyLkkZ6YF)

### Docker Services (shared)
- MySQL 8.0 on port 3306 (all databases on same instance)
- Redis 7 on port 6379
- Mailpit on port 1025 (SMTP) / 8025 (UI)

### SSH Deploy Keys
- empcloud: ~/.ssh/github-deploy-empcloud
- emp-recruit: ~/.ssh/github-deploy-recruit
- emp-performance: ~/.ssh/github-deploy-performance
- emp-rewards: ~/.ssh/github-deploy-rewards
- emp-exit: ~/.ssh/github-deploy-exit
- emp-payroll: ~/.ssh/github-deploy
- emp-billing: ~/.ssh/github-deploy-billing

### Databases
- empcloud, emp_recruit, emp_performance, emp_rewards, emp_exit, emp_payroll, emp_billing

---

## Working Rules
- Never start building without explicit user confirmation on the plan
- Always show plans/READMEs before executing
- Always deploy to ngrok before asking user to test
- Never commit .pem, .key, .env files — always verify .gitignore
- Never use `git add .` — add specific files by name
- User only tests via ngrok URLs

---

## What's Currently Building (7 agents in parallel)
1. Cloud: Org Chart + Notification Center + Bulk Import + Self-Service Dashboard
2. Recruit: Offer Letter PDF + Candidate Comparison + Custom Pipeline Stages
3. Performance: Goal Alignment Tree + Performance Letters + Skills Gap Analysis
4. Rewards: Team Challenges + Automated Milestones + Manager Dashboard
5. Exit: Exit Stage Emails + Rehire Workflow + Exit Survey NPS
6. Cross-Module: API Documentation (Swagger) for all 5 modules
7. Cloud: Unified Dashboard Widgets (pulls data from all module APIs)
