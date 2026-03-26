Perfect! Now I have all the information I need. Let me create comprehensive API documentation for mobile app developers. Let me compile this into a well-structured document:

## EMP Cloud - Comprehensive API Documentation for Mobile App Developers

### API Base URL
```
https://api.empcloud.com/api/v1
```

### Authentication
All endpoints (except registration, login, forgot-password, and reset-password) require Bearer token authentication:

```
Authorization: Bearer <access_token>
```

Token obtained via `/api/v1/auth/login` endpoint.

---

## 1. AUTHENTICATION & SSO

### 1.1 User Registration
**POST** `/api/v1/auth/register`
- **Auth Required:** No
- **Role Required:** None
- **Request Body:**
  - `org_name` (string, required) - Organization name
  - `org_legal_name` (string, required) - Legal entity name
  - `org_country` (string, required) - Country code
  - `org_state` (string, optional) - State/province
  - `org_timezone` (string, required) - IANA timezone (e.g., "Asia/Kolkata")
  - `org_email` (string, required) - Organization email
  - `first_name` (string, required) - Admin first name
  - `last_name` (string, required) - Admin last name
  - `email` (string, required) - Admin email
  - `password` (string, required) - Password (min 8 chars)
- **Response:** Organization, user, and tokens
- **Status Codes:** 201 (Created), 400 (Validation Error), 409 (Conflict)

### 1.2 User Login
**POST** `/api/v1/auth/login`
- **Auth Required:** No
- **Request Body:**
  - `email` (string, required) - User email
  - `password` (string, required) - User password
- **Response:** 
  ```json
  {
    "user": { "id", "email", "role", "org_id", ... },
    "org": { "id", "name", "timezone", ... },
    "access_token": "jwt_token",
    "refresh_token": "jwt_token"
  }
  ```
- **Status Codes:** 200 (Success), 401 (Invalid credentials), 400 (Validation Error)

### 1.3 Change Password
**POST** `/api/v1/auth/change-password`
- **Auth Required:** Yes (JWT token)
- **Request Body:**
  - `current_password` (string, required) - Current password
  - `new_password` (string, required) - New password (min 8 chars)
- **Response:** `{ "message": "Password changed successfully" }`
- **Status Codes:** 200 (Success), 400 (Validation Error), 401 (Unauthorized)

### 1.4 Forgot Password
**POST** `/api/v1/auth/forgot-password`
- **Auth Required:** No
- **Request Body:**
  - `email` (string, required) - User email
- **Response:** `{ "message": "If the email exists, a reset link has been sent" }` (always returns 200 for security)
- **Status Codes:** 200 (Always, to prevent email enumeration)

### 1.5 Reset Password
**POST** `/api/v1/auth/reset-password`
- **Auth Required:** No
- **Request Body:**
  - `token` (string, required) - Password reset token (from email link)
  - `password` (string, required) - New password
- **Response:** `{ "message": "Password reset successfully" }`
- **Status Codes:** 200 (Success), 400 (Invalid/Expired Token)

### 1.6 OAuth Token Exchange
**POST** `/oauth/token`
- **Auth Required:** No (client credentials required)
- **Request Body:**
  - `grant_type` (string, required) - "authorization_code" or "refresh_token"
  - `client_id` (string, required)
  - `client_secret` (string, conditional - required for confidential clients)
  - `code` (string, conditional - required for authorization_code flow)
  - `redirect_uri` (string, conditional - required for authorization_code flow)
  - `code_verifier` (string, optional - required if PKCE was used)
  - `refresh_token` (string, conditional - required for refresh_token flow)
- **Response:**
  ```json
  {
    "access_token": "jwt_token",
    "token_type": "Bearer",
    "expires_in": 3600,
    "refresh_token": "jwt_token",
    "id_token": "jwt_token"
  }
  ```

### 1.7 OAuth Authorization
**GET** `/oauth/authorize`
- **Auth Required:** Yes
- **Query Parameters:**
  - `client_id` (string, required)
  - `redirect_uri` (string, required)
  - `response_type` (string, required) - "code"
  - `scope` (string, optional)
  - `state` (string, required) - CSRF protection
  - `code_challenge` (string, required for public clients) - PKCE
  - `code_challenge_method` (string, optional) - "S256" or "plain"
  - `nonce` (string, optional) - For OpenID Connect
- **Response:** Redirects to redirect_uri with `code` and `state`
- **OIDC Discovery:** GET `/.well-known/openid-configuration`
- **JWKS Endpoint:** GET `/oauth/jwks`

### 1.8 OAuth Token Revocation
**POST** `/oauth/revoke`
- **Request Body:**
  - `token` (string, required)
  - `token_type_hint` (string, optional) - "access_token" or "refresh_token"
  - `client_id` (string, required)
  - `client_secret` (string, required)
- **Response:** 200 (always, per RFC 7009)

### 1.9 UserInfo (OIDC)
**GET** `/oauth/userinfo`
- **Auth Required:** Yes
- **Response:**
  ```json
  {
    "sub": "user_id",
    "email": "user@example.com",
    "name": "Full Name",
    "given_name": "First",
    "family_name": "Last",
    "org_id": "org_id",
    "org_name": "Organization",
    "role": "employee"
  }
  ```

---

## 2. EMPLOYEE PROFILE

### 2.1 Get My Profile
**GET** `/api/v1/employees/{userId}/profile`
- **Auth Required:** Yes
- **Permissions:** Own profile (or HR role)
- **Response:** 
  ```json
  {
    "id": "user_id",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "gender": "male",
    "date_of_birth": "1990-01-15",
    "phone": "+91-9999999999",
    "mobile": "+91-9999999999",
    "pan": "AAAPA1234A",
    "aadhar": "123456789012",
    "blood_group": "O+",
    "designation": "Senior Engineer",
    "department": "Engineering",
    "joining_date": "2020-01-15",
    "employment_type": "Full-time",
    "status": "active",
    "profile_picture": "url"
  }
  ```
- **Status Codes:** 200 (Success), 403 (Forbidden), 404 (Not Found)

### 2.2 Update My Profile
**PUT** `/api/v1/employees/{userId}/profile`
- **Auth Required:** Yes
- **Permissions:** Own profile (or HR role)
- **Request Body:** Any profile fields (partial update supported)
  - `first_name`, `last_name`, `gender`, `date_of_birth`, `phone`, `mobile`, `pan`, `aadhar`, `blood_group`, etc.
- **Response:** Updated profile object
- **Status Codes:** 200 (Success), 400 (Validation Error), 403 (Forbidden)

### 2.3 Get Employee Directory
**GET** `/api/v1/employees/directory`
- **Auth Required:** Yes
- **Query Parameters:**
  - `page` (integer, default 1)
  - `per_page` (integer, default 20, max 100)
  - `search` (string, optional) - Search by name/email
  - `department_id` (integer, optional)
  - `designation` (string, optional)
  - `status` (string, optional) - "active", "inactive"
- **Response:** Paginated list of employees
  ```json
  {
    "data": [
      { "id", "email", "first_name", "last_name", "designation", "department", "phone" }
    ],
    "total": 150,
    "page": 1,
    "per_page": 20
  }
  ```

### 2.4 Get Birthdays (This Month)
**GET** `/api/v1/employees/birthdays`
- **Auth Required:** Yes
- **Response:** Array of employees with birthdays this month

### 2.5 Get Work Anniversaries (This Month)
**GET** `/api/v1/employees/anniversaries`
- **Auth Required:** Yes
- **Response:** Array of employees with work anniversaries this month

### 2.6 Get Headcount Analytics
**GET** `/api/v1/employees/headcount`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** Analytics on total employees, by department, by status, etc.

### 2.7 Get Employee Addresses
**GET** `/api/v1/employees/{userId}/addresses`
- **Auth Required:** Yes
- **Permissions:** Own addresses (or HR role)
- **Response:** Array of addresses (current, permanent, etc.)

### 2.8 Add Employee Address
**POST** `/api/v1/employees/{userId}/addresses`
- **Auth Required:** Yes
- **Request Body:**
  - `address_type` (string) - "current", "permanent", etc.
  - `street_address` (string)
  - `city` (string)
  - `state` (string)
  - `postal_code` (string)
  - `country` (string)
  - `is_current` (boolean, optional)
- **Response:** Created address object
- **Status Codes:** 201 (Created)

### 2.9 Update Employee Address
**PUT** `/api/v1/employees/{userId}/addresses/{addressId}`
- **Auth Required:** Yes
- **Request Body:** Any address fields (partial update)
- **Response:** Updated address

### 2.10 Delete Employee Address
**DELETE** `/api/v1/employees/{userId}/addresses/{addressId}`
- **Auth Required:** Yes
- **Response:** `{ "message": "Address deleted" }`

### 2.11 Get Employee Education
**GET** `/api/v1/employees/{userId}/education`
- **Auth Required:** Yes
- **Response:** Array of education records

### 2.12 Add Education Record
**POST** `/api/v1/employees/{userId}/education`
- **Auth Required:** Yes
- **Request Body:**
  - `institution` (string) - School/University name
  - `degree` (string)
  - `field_of_study` (string)
  - `graduation_year` (integer)
  - `grade` (string, optional)
- **Response:** Created education record
- **Status Codes:** 201 (Created)

### 2.13 Update Education Record
**PUT** `/api/v1/employees/{userId}/education/{educationId}`
- **Auth Required:** Yes
- **Request Body:** Any education fields
- **Response:** Updated education record

### 2.14 Delete Education Record
**DELETE** `/api/v1/employees/{userId}/education/{educationId}`
- **Auth Required:** Yes
- **Response:** `{ "message": "Education record deleted" }`

### 2.15 Get Work Experience
**GET** `/api/v1/employees/{userId}/experience`
- **Auth Required:** Yes
- **Response:** Array of work experience records

### 2.16 Add Work Experience
**POST** `/api/v1/employees/{userId}/experience`
- **Auth Required:** Yes
- **Request Body:**
  - `company_name` (string)
  - `designation` (string)
  - `start_date` (date)
  - `end_date` (date, optional - null for current)
  - `description` (string, optional)
  - `industry` (string, optional)
- **Response:** Created experience record
- **Status Codes:** 201 (Created)

### 2.17 Update Work Experience
**PUT** `/api/v1/employees/{userId}/experience/{experienceId}`
- **Auth Required:** Yes
- **Request Body:** Any experience fields
- **Response:** Updated experience record

### 2.18 Delete Work Experience
**DELETE** `/api/v1/employees/{userId}/experience/{experienceId}`
- **Auth Required:** Yes
- **Response:** `{ "message": "Experience record deleted" }`

### 2.19 Get Dependents
**GET** `/api/v1/employees/{userId}/dependents`
- **Auth Required:** Yes
- **Response:** Array of dependent records

### 2.20 Add Dependent
**POST** `/api/v1/employees/{userId}/dependents`
- **Auth Required:** Yes
- **Request Body:**
  - `name` (string)
  - `relationship` (string) - "spouse", "child", "parent", etc.
  - `date_of_birth` (date)
  - `gender` (string, optional)
  - `aadhar` (string, optional)
- **Response:** Created dependent record
- **Status Codes:** 201 (Created)

### 2.21 Update Dependent
**PUT** `/api/v1/employees/{userId}/dependents/{dependentId}`
- **Auth Required:** Yes
- **Request Body:** Any dependent fields
- **Response:** Updated dependent record

### 2.22 Delete Dependent
**DELETE** `/api/v1/employees/{userId}/dependents/{dependentId}`
- **Auth Required:** Yes
- **Response:** `{ "message": "Dependent deleted" }`

---

## 3. ATTENDANCE

### 3.1 Check-In
**POST** `/api/v1/attendance/check-in`
- **Auth Required:** Yes
- **Request Body:**
  - `latitude` (float, optional)
  - `longitude` (float, optional)
  - `ip_address` (string, optional)
  - `notes` (string, optional)
  - `check_in_method` (string, optional) - "biometric", "qr", "manual", "mobile"
- **Response:** Created attendance record
- **Status Codes:** 201 (Created), 400 (Already checked in)

### 3.2 Check-Out
**POST** `/api/v1/attendance/check-out`
- **Auth Required:** Yes
- **Request Body:**
  - `latitude` (float, optional)
  - `longitude` (float, optional)
  - `ip_address` (string, optional)
  - `notes` (string, optional)
  - `check_out_method` (string, optional)
- **Response:** Updated attendance record with duration
- **Status Codes:** 200 (Success), 400 (Not checked in)

### 3.3 Get Today's Attendance
**GET** `/api/v1/attendance/me/today`
- **Auth Required:** Yes
- **Response:**
  ```json
  {
    "id": "attendance_id",
    "user_id": "user_id",
    "date": "2026-03-26",
    "check_in_time": "2026-03-26T09:00:00Z",
    "check_out_time": "2026-03-26T17:30:00Z",
    "duration": 28800,
    "status": "present",
    "latitude_in": 19.0760,
    "longitude_in": 72.8777
  }
  ```
- **Status Codes:** 200 (Success), 404 (No attendance yet)

### 3.4 Get My Attendance History
**GET** `/api/v1/attendance/me/history`
- **Auth Required:** Yes
- **Query Parameters:**
  - `page` (integer, default 1)
  - `per_page` (integer, default 20)
  - `month` (integer, optional) - 1-12
  - `year` (integer, optional) - e.g., 2026
- **Response:** Paginated attendance records
- **Status Codes:** 200 (Success)

### 3.5 Get Shift List
**GET** `/api/v1/attendance/shifts`
- **Auth Required:** Yes
- **Response:** Array of all configured shifts
  ```json
  {
    "id": "shift_id",
    "name": "Morning Shift",
    "start_time": "09:00",
    "end_time": "17:00",
    "break_duration": 60,
    "is_active": true
  }
  ```

### 3.6 Create Shift (HR Only)
**POST** `/api/v1/attendance/shifts`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `name` (string, required)
  - `start_time` (string, required) - "HH:MM"
  - `end_time` (string, required) - "HH:MM"
  - `break_duration` (integer, optional) - minutes
  - `days` (array, optional) - [1-7] for day of week
  - `is_active` (boolean, optional)
- **Response:** Created shift
- **Status Codes:** 201 (Created)

### 3.7 Update Shift (HR Only)
**PUT** `/api/v1/attendance/shifts/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:** Any shift fields
- **Response:** Updated shift

### 3.8 Delete Shift (HR Only)
**DELETE** `/api/v1/attendance/shifts/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** `{ "message": "Shift deactivated" }`

### 3.9 Get My Shift Schedule
**GET** `/api/v1/attendance/shifts/my-schedule`
- **Auth Required:** Yes
- **Response:** Current user's assigned shifts for the week/month

### 3.10 Request Shift Swap
**POST** `/api/v1/attendance/shifts/swap-request`
- **Auth Required:** Yes
- **Request Body:**
  - `from_shift_id` (integer)
  - `to_shift_id` (integer)
  - `swap_with_user_id` (integer, optional)
  - `reason` (string, optional)
- **Response:** Created swap request
- **Status Codes:** 201 (Created)

### 3.11 Get My Shift Swap Requests
**GET** `/api/v1/attendance/shifts/swap-requests`
- **Auth Required:** Yes
- **Role Required:** HR
- **Query Parameters:**
  - `status` (string, optional) - "pending", "approved", "rejected"
- **Response:** Array of swap requests

### 3.12 Approve Shift Swap (HR Only)
**POST** `/api/v1/attendance/shifts/swap-requests/{id}/approve`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** Updated swap request with status "approved"

### 3.13 Reject Shift Swap (HR Only)
**POST** `/api/v1/attendance/shifts/swap-requests/{id}/reject`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** Updated swap request with status "rejected"

### 3.14 Get Geo-Fences
**GET** `/api/v1/attendance/geo-fences`
- **Auth Required:** Yes
- **Response:** Array of configured geo-fences
  ```json
  {
    "id": "fence_id",
    "name": "Office Location",
    "latitude": 19.0760,
    "longitude": 72.8777,
    "radius": 100,
    "is_active": true
  }
  ```

### 3.15 Create Geo-Fence (HR Only)
**POST** `/api/v1/attendance/geo-fences`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `name` (string)
  - `latitude` (float)
  - `longitude` (float)
  - `radius` (float) - meters
  - `is_active` (boolean, optional)
- **Response:** Created geo-fence
- **Status Codes:** 201 (Created)

### 3.16 Update Geo-Fence (HR Only)
**PUT** `/api/v1/attendance/geo-fences/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:** Any geo-fence fields
- **Response:** Updated geo-fence

### 3.17 Delete Geo-Fence (HR Only)
**DELETE** `/api/v1/attendance/geo-fences/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** `{ "message": "Geo-fence deactivated" }`

### 3.18 Submit Attendance Regularization
**POST** `/api/v1/attendance/regularizations`
- **Auth Required:** Yes
- **Request Body:**
  - `date` (date)
  - `check_in_time` (string, optional)
  - `check_out_time` (string, optional)
  - `reason` (string)
  - `supporting_docs` (array, optional)
- **Response:** Created regularization request
- **Status Codes:** 201 (Created)

### 3.19 Get My Regularizations
**GET** `/api/v1/attendance/regularizations/me`
- **Auth Required:** Yes
- **Query Parameters:**
  - `page` (integer, default 1)
  - `per_page` (integer, default 20)
- **Response:** Paginated regularization requests

### 3.20 Approve/Reject Regularization (HR Only)
**PUT** `/api/v1/attendance/regularizations/{id}/approve`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `status` (string) - "approved" or "rejected"
  - `rejection_reason` (string, optional)
- **Response:** Updated regularization with status

### 3.21 Get Attendance Records (HR Only)
**GET** `/api/v1/attendance/records`
- **Auth Required:** Yes
- **Role Required:** HR
- **Query Parameters:**
  - `page` (integer)
  - `per_page` (integer)
  - `month` (integer, optional)
  - `year` (integer, optional)
  - `user_id` (integer, optional)
  - `department_id` (integer, optional)
- **Response:** Paginated all attendance records

### 3.22 Get Attendance Dashboard (HR Only)
**GET** `/api/v1/attendance/dashboard`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** Analytics - present, absent, late, on-leave counts

### 3.23 Get Monthly Attendance Report (HR Only)
**GET** `/api/v1/attendance/monthly-report`
- **Auth Required:** Yes
- **Role Required:** HR
- **Query Parameters:**
  - `month` (integer, optional) - default current month
  - `year` (integer, optional) - default current year
  - `user_id` (integer, optional)
- **Response:** Detailed monthly report per employee

---

## 4. LEAVE MANAGEMENT

### 4.1 Get Leave Types
**GET** `/api/v1/leave/types`
- **Auth Required:** Yes
- **Response:** Array of leave types (Annual, Sick, Casual, etc.)
  ```json
  {
    "id": "type_id",
    "name": "Annual Leave",
    "code": "ANNUAL",
    "max_days_per_year": 20,
    "requires_approval": true,
    "is_active": true
  }
  ```

### 4.2 Create Leave Type (HR Only)
**POST** `/api/v1/leave/types`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `name` (string)
  - `code` (string)
  - `max_days_per_year` (integer)
  - `requires_approval` (boolean, optional)
  - `description` (string, optional)
- **Response:** Created leave type
- **Status Codes:** 201 (Created)

### 4.3 Update Leave Type (HR Only)
**PUT** `/api/v1/leave/types/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:** Any leave type fields
- **Response:** Updated leave type

### 4.4 Get Leave Policies
**GET** `/api/v1/leave/policies`
- **Auth Required:** Yes
- **Response:** Array of leave policies

### 4.5 Create Leave Policy (HR Only)
**POST** `/api/v1/leave/policies`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `name` (string)
  - `description` (string, optional)
  - `applicable_to_all` (boolean)
  - `department_ids` (array, optional)
  - `designation_ids` (array, optional)
  - `leave_type_id` (integer)
  - `days_per_year` (integer)
  - `carryover_days` (integer, optional)
- **Response:** Created policy
- **Status Codes:** 201 (Created)

### 4.6 Get My Leave Balance
**GET** `/api/v1/leave/balances/me`
- **Auth Required:** Yes
- **Query Parameters:**
  - `year` (integer, optional) - default current year
- **Response:**
  ```json
  {
    "balances": [
      {
        "leave_type_id": "type_id",
        "leave_type_name": "Annual Leave",
        "year": 2026,
        "total_allocated": 20,
        "used": 3,
        "balance": 17,
        "pending_approval": 2
      }
    ]
  }
  ```

### 4.7 Get Leave Balance (Any User, HR can get others)
**GET** `/api/v1/leave/balances`
- **Auth Required:** Yes
- **Query Parameters:**
  - `user_id` (integer, optional) - default self
  - `year` (integer, optional)
- **Response:** Same as above

### 4.8 Apply for Leave
**POST** `/api/v1/leave/applications`
- **Auth Required:** Yes
- **Request Body:**
  - `leave_type_id` (integer)
  - `from_date` (date)
  - `to_date` (date)
  - `reason` (string, optional)
  - `half_day` (boolean, optional)
  - `half_day_type` (string, optional) - "first_half", "second_half"
  - `supporting_documents` (array, optional)
- **Response:** Created leave application
  ```json
  {
    "id": "application_id",
    "user_id": "user_id",
    "leave_type_id": "type_id",
    "from_date": "2026-04-01",
    "to_date": "2026-04-05",
    "days": 5,
    "status": "pending",
    "created_at": "2026-03-26T10:00:00Z"
  }
  ```
- **Status Codes:** 201 (Created)

### 4.9 Get My Leave Applications
**GET** `/api/v1/leave/applications/me`
- **Auth Required:** Yes
- **Query Parameters:**
  - `page` (integer, default 1)
  - `per_page` (integer, default 20)
  - `status` (string, optional) - "pending", "approved", "rejected"
  - `leave_type_id` (integer, optional)
- **Response:** Paginated applications

### 4.10 Get All Leave Applications (HR/Manager)
**GET** `/api/v1/leave/applications`
- **Auth Required:** Yes
- **Query Parameters:**
  - `page` (integer)
  - `per_page` (integer)
  - `status` (string, optional)
  - `leave_type_id` (integer, optional)
  - `user_id` (integer, optional) - HR can filter by user
- **Response:** Paginated applications

### 4.11 Get Leave Application Detail
**GET** `/api/v1/leave/applications/{id}`
- **Auth Required:** Yes
- **Response:** Single application with approval history

### 4.12 Approve Leave Application
**PUT** `/api/v1/leave/applications/{id}/approve`
- **Auth Required:** Yes
- **Request Body:**
  - `remarks` (string, optional)
- **Response:** Updated application with status "approved"

### 4.13 Reject Leave Application
**PUT** `/api/v1/leave/applications/{id}/reject`
- **Auth Required:** Yes
- **Request Body:**
  - `remarks` (string, optional)
- **Response:** Updated application with status "rejected"

### 4.14 Cancel Leave Application
**PUT** `/api/v1/leave/applications/{id}/cancel`
- **Auth Required:** Yes
- **Response:** Updated application with status "cancelled"

### 4.15 Get Leave Calendar
**GET** `/api/v1/leave/calendar`
- **Auth Required:** Yes
- **Query Parameters:**
  - `month` (integer, optional) - 1-12
  - `year` (integer, optional)
- **Response:** Calendar view with leave dates and statuses

### 4.16 Request Comp-Off
**POST** `/api/v1/leave/comp-off`
- **Auth Required:** Yes
- **Request Body:**
  - `worked_on_date` (date)
  - `reason` (string, optional)
  - `comp_off_date` (date, optional)
- **Response:** Created comp-off request
- **Status Codes:** 201 (Created)

### 4.17 Get My Comp-Off Requests
**GET** `/api/v1/leave/comp-off/my`
- **Auth Required:** Yes
- **Query Parameters:**
  - `page` (integer)
  - `per_page` (integer)
  - `status` (string, optional)
- **Response:** Paginated comp-off requests

### 4.18 Get My Comp-Off Balance
**GET** `/api/v1/leave/comp-off/balance`
- **Auth Required:** Yes
- **Query Parameters:**
  - `year` (integer, optional)
- **Response:**
  ```json
  {
    "balance": 2,
    "total_allocated": 5,
    "total_used": 3,
    "year": 2026
  }
  ```

### 4.19 Approve Comp-Off
**PUT** `/api/v1/leave/comp-off/{id}/approve`
- **Auth Required:** Yes
- **Response:** Updated comp-off request

### 4.20 Reject Comp-Off
**PUT** `/api/v1/leave/comp-off/{id}/reject`
- **Auth Required:** Yes
- **Request Body:**
  - `reason` (string, optional)
- **Response:** Updated comp-off request

---

## 5. DOCUMENTS

### 5.1 Get Document Categories
**GET** `/api/v1/documents/categories`
- **Auth Required:** Yes
- **Response:** Array of document categories

### 5.2 Create Document Category (HR Only)
**POST** `/api/v1/documents/categories`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `name` (string)
  - `description` (string, optional)
  - `is_mandatory` (boolean, optional)
  - `expiry_days` (integer, optional)
- **Response:** Created category
- **Status Codes:** 201 (Created)

### 5.3 Get My Documents
**GET** `/api/v1/documents/my`
- **Auth Required:** Yes
- **Query Parameters:**
  - `page` (integer)
  - `per_page` (integer)
- **Response:** Paginated documents of current user
  ```json
  {
    "data": [
      {
        "id": "doc_id",
        "name": "Aadhar Card",
        "category_id": "cat_id",
        "file_path": "s3://...",
        "status": "verified",
        "expires_at": "2027-03-26",
        "uploaded_at": "2026-03-26T10:00:00Z"
      }
    ],
    "total": 5
  }
  ```

### 5.4 Upload Document
**POST** `/api/v1/documents/upload`
- **Auth Required:** Yes
- **Content-Type:** multipart/form-data
- **Request Form Data:**
  - `file` (file, required) - Document file
  - `category_id` (integer, required)
  - `name` (string, optional) - Document name
  - `expires_at` (date, optional)
  - `user_id` (integer, optional) - HR can upload for others
- **Response:** Created document
- **Status Codes:** 201 (Created)

### 5.5 Get Document Detail
**GET** `/api/v1/documents/{id}`
- **Auth Required:** Yes
- **Response:** Single document details

### 5.6 Download Document
**GET** `/api/v1/documents/{id}/download`
- **Auth Required:** Yes
- **Response:** File download (Content-Disposition: attachment)

### 5.7 Delete Document (HR Only)
**DELETE** `/api/v1/documents/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** `{ "message": "Document deleted" }`

### 5.8 Verify Document (HR Only)
**PUT** `/api/v1/documents/{id}/verify`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `verified_by_id` (integer)
  - `remarks` (string, optional)
- **Response:** Updated document with status "verified"

### 5.9 Reject Document (HR Only)
**POST** `/api/v1/documents/{id}/reject`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `rejection_reason` (string)
- **Response:** Updated document with status "rejected"

### 5.10 Get Expiring Documents (HR Only)
**GET** `/api/v1/documents/expiring`
- **Auth Required:** Yes
- **Role Required:** HR
- **Query Parameters:**
  - `days` (integer, optional) - default 30
- **Response:** Documents expiring within days

### 5.11 Get Mandatory Document Tracking (HR Only)
**GET** `/api/v1/documents/mandatory-status`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** Employees missing mandatory documents

---

## 6. ANNOUNCEMENTS

### 6.1 Get Announcements
**GET** `/api/v1/announcements`
- **Auth Required:** Yes
- **Query Parameters:**
  - `page` (integer)
  - `per_page` (integer)
- **Response:** Paginated announcements visible to user
  ```json
  {
    "data": [
      {
        "id": "announce_id",
        "title": "Policy Update",
        "content": "New remote work policy...",
        "created_by": "HR Name",
        "created_at": "2026-03-26T10:00:00Z",
        "is_read": false,
        "visibility": "all_employees"
      }
    ],
    "total": 15
  }
  ```

### 6.2 Get Unread Announcement Count
**GET** `/api/v1/announcements/unread-count`
- **Auth Required:** Yes
- **Response:** `{ "count": 3 }`

### 6.3 Create Announcement (HR Only)
**POST** `/api/v1/announcements`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `title` (string)
  - `content` (string)
  - `visibility` (string) - "all_employees", "specific_department", "specific_users"
  - `department_ids` (array, optional)
  - `user_ids` (array, optional)
  - `published_at` (datetime, optional)
- **Response:** Created announcement
- **Status Codes:** 201 (Created)

### 6.4 Update Announcement (HR Only)
**PUT** `/api/v1/announcements/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:** Any announcement fields
- **Response:** Updated announcement

### 6.5 Delete Announcement (HR Only)
**DELETE** `/api/v1/announcements/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** `{ "message": "Announcement deleted" }`

### 6.6 Mark Announcement as Read
**POST** `/api/v1/announcements/{id}/read`
- **Auth Required:** Yes
- **Response:** `{ "message": "Marked as read" }`

---

## 7. POLICIES

### 7.1 Get All Policies
**GET** `/api/v1/policies`
- **Auth Required:** Yes
- **Query Parameters:**
  - `page` (integer)
  - `per_page` (integer)
  - `category` (string, optional)
- **Response:** Paginated policies

### 7.2 Get Policy Detail
**GET** `/api/v1/policies/{id}`
- **Auth Required:** Yes
- **Response:**
  ```json
  {
    "id": "policy_id",
    "title": "Code of Conduct",
    "content": "HTML content...",
    "category": "compliance",
    "requires_acknowledgment": true,
    "published_at": "2026-01-01",
    "my_acknowledgment": {
      "acknowledged_at": "2026-01-05",
      "acknowledged_by_id": "user_id"
    }
  }
  ```

### 7.3 Get Pending Policies (Not Yet Acknowledged)
**GET** `/api/v1/policies/pending`
- **Auth Required:** Yes
- **Response:** Array of policies user hasn't acknowledged yet

### 7.4 Create Policy (HR Only)
**POST** `/api/v1/policies`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `title` (string)
  - `content` (string)
  - `category` (string)
  - `requires_acknowledgment` (boolean)
  - `published_at` (datetime, optional)
- **Response:** Created policy
- **Status Codes:** 201 (Created)

### 7.5 Update Policy (HR Only)
**PUT** `/api/v1/policies/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:** Any policy fields
- **Response:** Updated policy

### 7.6 Delete Policy (HR Only)
**DELETE** `/api/v1/policies/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** `{ "message": "Policy deactivated" }`

### 7.7 Acknowledge Policy
**POST** `/api/v1/policies/{id}/acknowledge`
- **Auth Required:** Yes
- **Response:** Acknowledgment record created

### 7.8 Get Policy Acknowledgments (HR Only)
**GET** `/api/v1/policies/{id}/acknowledgments`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** List of users who acknowledged + pending acknowledgments

---

## 8. NOTIFICATIONS

### 8.1 Get Notifications
**GET** `/api/v1/notifications`
- **Auth Required:** Yes
- **Query Parameters:**
  - `page` (integer)
  - `per_page` (integer)
  - `unread_only` (boolean, optional) - "true" to get only unread
- **Response:** Paginated notifications
  ```json
  {
    "data": [
      {
        "id": "notif_id",
        "type": "leave_approved",
        "title": "Leave Approved",
        "message": "Your leave from Apr 1-5 has been approved",
        "data": { "application_id": "123" },
        "is_read": false,
        "created_at": "2026-03-26T10:00:00Z"
      }
    ],
    "total": 25
  }
  ```

### 8.2 Get Unread Count
**GET** `/api/v1/notifications/unread-count`
- **Auth Required:** Yes
- **Response:** `{ "count": 5 }`

### 8.3 Mark Notification as Read
**PUT** `/api/v1/notifications/{id}/read`
- **Auth Required:** Yes
- **Response:** `{ "message": "Notification marked as read" }`

### 8.4 Mark All as Read
**PUT** `/api/v1/notifications/read-all`
- **Auth Required:** Yes
- **Response:** `{ "marked_count": 5 }`

---

## 9. HELPDESK

### 9.1 Create Support Ticket
**POST** `/api/v1/helpdesk/tickets`
- **Auth Required:** Yes
- **Request Body:**
  - `title` (string)
  - `description` (string)
  - `category` (string)
  - `priority` (string) - "low", "medium", "high", "urgent"
  - `attachments` (array, optional)
- **Response:** Created ticket
  ```json
  {
    "id": "ticket_id",
    "title": "Cannot login",
    "description": "Getting 401 error",
    "status": "open",
    "priority": "high",
    "raised_by_id": "user_id",
    "created_at": "2026-03-26T10:00:00Z",
    "comments_count": 0
  }
  ```
- **Status Codes:** 201 (Created)

### 9.2 Get My Tickets
**GET** `/api/v1/helpdesk/tickets/my`
- **Auth Required:** Yes
- **Query Parameters:**
  - `page` (integer)
  - `per_page` (integer)
  - `status` (string, optional)
  - `category` (string, optional)
- **Response:** Paginated user's tickets

### 9.3 Get All Tickets (HR Can See All)
**GET** `/api/v1/helpdesk/tickets`
- **Auth Required:** Yes
- **Query Parameters:**
  - `page` (integer)
  - `per_page` (integer)
  - `status` (string, optional)
  - `category` (string, optional)
  - `priority` (string, optional)
  - `assigned_to` (integer, optional) - HR only
  - `raised_by` (integer, optional) - HR only
  - `search` (string, optional)
- **Response:** Paginated tickets (HR: all, Employee: own)

### 9.4 Get Ticket Detail with Comments
**GET** `/api/v1/helpdesk/tickets/{id}`
- **Auth Required:** Yes
- **Response:**
  ```json
  {
    "id": "ticket_id",
    "title": "Cannot login",
    "description": "Getting 401 error",
    "status": "open",
    "priority": "high",
    "category": "account",
    "raised_by": { "id", "name", "email" },
    "assigned_to": { "id", "name", "email" },
    "resolution": null,
    "rating": null,
    "created_at": "2026-03-26T10:00:00Z",
    "updated_at": "2026-03-26T11:30:00Z",
    "comments": [
      {
        "id": "comment_id",
        "author": { "id", "name" },
        "comment": "Let me check...",
        "is_internal": false,
        "created_at": "2026-03-26T10:30:00Z"
      }
    ]
  }
  ```

### 9.5 Update Ticket (HR Only)
**PUT** `/api/v1/helpdesk/tickets/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `title`, `description`, `priority`, `category`, `status`
- **Response:** Updated ticket

### 9.6 Assign Ticket (HR Only)
**POST** `/api/v1/helpdesk/tickets/{id}/assign`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `assigned_to` (integer) - User ID
- **Response:** Updated ticket with assignment

### 9.7 Add Comment to Ticket
**POST** `/api/v1/helpdesk/tickets/{id}/comment`
- **Auth Required:** Yes
- **Request Body:**
  - `comment` (string)
  - `is_internal` (boolean, optional) - Only HR can post internal comments
  - `attachments` (array, optional)
- **Response:** Created comment
- **Status Codes:** 201 (Created)

### 9.8 Resolve Ticket (HR Only)
**POST** `/api/v1/helpdesk/tickets/{id}/resolve`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `resolution` (string)
- **Response:** Updated ticket with status "resolved"

### 9.9 Close Ticket
**POST** `/api/v1/helpdesk/tickets/{id}/close`
- **Auth Required:** Yes
- **Response:** Updated ticket with status "closed"

### 9.10 Reopen Ticket
**POST** `/api/v1/helpdesk/tickets/{id}/reopen`
- **Auth Required:** Yes
- **Response:** Updated ticket with status "open"

### 9.11 Rate Resolved Ticket
**POST** `/api/v1/helpdesk/tickets/{id}/rate`
- **Auth Required:** Yes
- **Request Body:**
  - `rating` (integer) - 1-5
  - `comment` (string, optional)
- **Response:** Updated ticket with rating

### 9.12 Get Knowledge Base Articles
**GET** `/api/v1/helpdesk/kb`
- **Auth Required:** Yes
- **Query Parameters:**
  - `page` (integer)
  - `per_page` (integer)
  - `category` (string, optional)
  - `search` (string, optional)
- **Response:** Paginated published KB articles
  ```json
  {
    "data": [
      {
        "id": "article_id",
        "title": "How to Reset Password",
        "slug": "how-to-reset-password",
        "content": "HTML content...",
        "category": "account",
        "views": 150,
        "helpful_count": 45,
        "unhelpful_count": 5,
        "published": true
      }
    ]
  }
  ```

### 9.13 Get KB Article Detail
**GET** `/api/v1/helpdesk/kb/{idOrSlug}`
- **Auth Required:** Yes
- **Response:** Single article (increments view count)

### 9.14 Create KB Article (HR Only)
**POST** `/api/v1/helpdesk/kb`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `title` (string)
  - `slug` (string)
  - `content` (string) - HTML
  - `category` (string)
  - `published` (boolean, optional)
- **Response:** Created article
- **Status Codes:** 201 (Created)

### 9.15 Update KB Article (HR Only)
**PUT** `/api/v1/helpdesk/kb/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:** Any article fields
- **Response:** Updated article

### 9.16 Delete KB Article (HR Only)
**DELETE** `/api/v1/helpdesk/kb/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** `{ "message": "Article unpublished" }`

### 9.17 Rate Article Helpfulness
**POST** `/api/v1/helpdesk/kb/{id}/helpful`
- **Auth Required:** Yes
- **Request Body:**
  - `helpful` (boolean)
- **Response:** Updated article with updated counts

### 9.18 Get Helpdesk Dashboard (HR Only)
**GET** `/api/v1/helpdesk/dashboard`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:**
  ```json
  {
    "open_tickets": 12,
    "resolved_tickets": 89,
    "avg_resolution_time": 180,
    "avg_rating": 4.2,
    "tickets_by_priority": { "low": 2, "medium": 5, "high": 4, "urgent": 1 },
    "tickets_by_category": { "account": 5, "technical": 8, ... }
  }
  ```

---

## 10. EVENTS

### 10.1 Get Upcoming Events
**GET** `/api/v1/events/upcoming`
- **Auth Required:** Yes
- **Response:** Array of upcoming events (next 30 days)

### 10.2 Get My RSVPd Events
**GET** `/api/v1/events/my`
- **Auth Required:** Yes
- **Response:** Events user has RSVP'd to

### 10.3 List All Events
**GET** `/api/v1/events`
- **Auth Required:** Yes
- **Query Parameters:**
  - `page` (integer)
  - `per_page` (integer)
  - `event_type` (string, optional)
  - `status` (string, optional)
  - `start_date` (date, optional)
  - `end_date` (date, optional)
- **Response:** Paginated events
  ```json
  {
    "data": [
      {
        "id": "event_id",
        "title": "Team Outing",
        "description": "Annual team outing...",
        "event_type": "team_outing",
        "start_date": "2026-04-15",
        "start_time": "10:00",
        "end_date": "2026-04-15",
        "end_time": "18:00",
        "location": "Beach Resort",
        "organizer": { "id", "name" },
        "rsvp_count": { "yes": 45, "no": 5, "maybe": 10 },
        "my_rsvp": "yes",
        "status": "published"
      }
    ]
  }
  ```

### 10.4 Get Event Detail
**GET** `/api/v1/events/{id}`
- **Auth Required:** Yes
- **Response:** Single event with attendee list and my RSVP status

### 10.5 Create Event (HR Only)
**POST** `/api/v1/events`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `title` (string)
  - `description` (string)
  - `event_type` (string)
  - `start_date` (date)
  - `start_time` (time, optional)
  - `end_date` (date)
  - `end_time` (time, optional)
  - `location` (string)
  - `max_attendees` (integer, optional)
  - `visibility` (string, optional) - "all", "department", "specific_users"
  - `department_ids` (array, optional)
- **Response:** Created event
- **Status Codes:** 201 (Created)

### 10.6 Update Event (HR Only)
**PUT** `/api/v1/events/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:** Any event fields
- **Response:** Updated event

### 10.7 Delete Event (HR Only)
**DELETE** `/api/v1/events/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** `{ "message": "Event deleted" }`

### 10.8 Cancel Event (HR Only)
**POST** `/api/v1/events/{id}/cancel`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** Updated event with status "cancelled"

### 10.9 RSVP to Event
**POST** `/api/v1/events/{id}/rsvp`
- **Auth Required:** Yes
- **Request Body:**
  - `status` (string) - "yes", "no", "maybe"
- **Response:** Updated RSVP record

### 10.10 Get Event Dashboard (HR Only)
**GET** `/api/v1/events/dashboard`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** Event analytics and attendance stats

---

## 11. WELLNESS

### 11.1 Get My Enrolled Programs
**GET** `/api/v1/wellness/my`
- **Auth Required:** Yes
- **Response:** Array of wellness programs user is enrolled in

### 11.2 Get My Wellness Summary
**GET** `/api/v1/wellness/summary`
- **Auth Required:** Yes
- **Response:**
  ```json
  {
    "enrolled_programs": 3,
    "check_ins_this_month": 8,
    "active_goals": 2,
    "completed_programs": 1,
    "wellness_score": 75
  }
  ```

### 11.3 Daily Wellness Check-In
**POST** `/api/v1/wellness/check-in`
- **Auth Required:** Yes
- **Request Body:**
  - `mood` (integer) - 1-5 scale
  - `energy_level` (integer) - 1-5 scale
  - `stress_level` (integer) - 1-5 scale
  - `notes` (string, optional)
  - `activities` (array, optional) - e.g., ["exercise", "meditation"]
- **Response:** Created check-in record
- **Status Codes:** 201 (Created)

### 11.4 Get My Check-In History
**GET** `/api/v1/wellness/check-ins`
- **Auth Required:** Yes
- **Query Parameters:**
  - `page` (integer)
  - `per_page` (integer)
  - `start_date` (date, optional)
  - `end_date` (date, optional)
- **Response:** Paginated check-ins with trend analysis

### 11.5 Create Wellness Goal
**POST** `/api/v1/wellness/goals`
- **Auth Required:** Yes
- **Request Body:**
  - `title` (string)
  - `description` (string, optional)
  - `goal_type` (string) - "fitness", "mental_health", "nutrition", "sleep", "other"
  - `target_value` (float, optional)
  - `target_unit` (string, optional) - "days", "km", "minutes", etc.
  - `deadline` (date)
- **Response:** Created goal
- **Status Codes:** 201 (Created)

### 11.6 Get My Goals
**GET** `/api/v1/wellness/goals`
- **Auth Required:** Yes
- **Query Parameters:**
  - `status` (string, optional) - "active", "completed", "abandoned"
- **Response:** Array of wellness goals

### 11.7 Update Goal Progress
**PUT** `/api/v1/wellness/goals/{id}`
- **Auth Required:** Yes
- **Request Body:**
  - `current_progress` (float, optional)
  - `status` (string, optional) - "active", "completed", "abandoned"
  - `notes` (string, optional)
- **Response:** Updated goal

### 11.8 List Wellness Programs
**GET** `/api/v1/wellness/programs`
- **Auth Required:** Yes
- **Query Parameters:**
  - `page` (integer)
  - `per_page` (integer)
  - `program_type` (string, optional)
  - `status` (string, optional) - "active", "completed"
- **Response:** Paginated programs
  ```json
  {
    "data": [
      {
        "id": "program_id",
        "title": "6-Week Yoga Challenge",
        "description": "...",
        "program_type": "fitness",
        "duration_weeks": 6,
        "enrollment_count": 45,
        "my_enrollment": {
          "enrolled": true,
          "progress": 50,
          "status": "in_progress"
        }
      }
    ]
  }
  ```

### 11.9 Get Program Detail
**GET** `/api/v1/wellness/programs/{id}`
- **Auth Required:** Yes
- **Response:** Single program with progress tracking

### 11.10 Create Wellness Program (HR Only)
**POST** `/api/v1/wellness/programs`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `title` (string)
  - `description` (string)
  - `program_type` (string)
  - `duration_weeks` (integer)
  - `start_date` (date)
  - `max_enrollments` (integer, optional)
  - `content_url` (string, optional)
- **Response:** Created program
- **Status Codes:** 201 (Created)

### 11.11 Enroll in Program
**POST** `/api/v1/wellness/programs/{id}/enroll`
- **Auth Required:** Yes
- **Response:** Enrollment record
- **Status Codes:** 201 (Created)

### 11.12 Complete Program
**POST** `/api/v1/wellness/programs/{id}/complete`
- **Auth Required:** Yes
- **Response:** Updated enrollment with completion status

### 11.13 Get Wellness Dashboard (HR Only)
**GET** `/api/v1/wellness/dashboard`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** Organization-wide wellness metrics and trends

---

## 12. FEEDBACK (Anonymous)

### 12.1 Submit Anonymous Feedback
**POST** `/api/v1/feedback`
- **Auth Required:** Yes (for audit logging only, identity not tracked)
- **Request Body:**
  - `title` (string)
  - `feedback_text` (string)
  - `category` (string) - "management", "work_culture", "facilities", "benefits", "other"
  - `is_urgent` (boolean, optional)
  - `sentiment` (string, optional) - "positive", "neutral", "negative"
- **Response:** Created feedback (anonymized in response)
  ```json
  {
    "id": "feedback_id",
    "feedback_hash": "hash_for_tracking",
    "title": "Better parking needed",
    "category": "facilities",
    "status": "new",
    "created_at": "2026-03-26T10:00:00Z"
  }
  ```
- **Status Codes:** 201 (Created)
- **Note:** User identity is NOT logged or visible

### 12.2 Get My Feedback (Tracked by Hash)
**GET** `/api/v1/feedback/my`
- **Auth Required:** Yes
- **Query Parameters:**
  - `page` (integer)
  - `per_page` (integer)
- **Response:** Feedback submitted by current user (matched via hash)

### 12.3 Get All Feedback (HR Only, Without User Identity)
**GET** `/api/v1/feedback`
- **Auth Required:** Yes
- **Role Required:** HR
- **Query Parameters:**
  - `page` (integer)
  - `per_page` (integer)
  - `category` (string, optional)
  - `status` (string, optional) - "new", "in_progress", "resolved"
  - `sentiment` (string, optional)
  - `is_urgent` (boolean, optional)
  - `search` (string, optional)
- **Response:** Paginated feedback (anonymized)

### 12.4 Get Feedback Detail (HR Only)
**GET** `/api/v1/feedback/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** Single feedback with responses and status

### 12.5 Respond to Feedback (HR Only)
**POST** `/api/v1/feedback/{id}/respond`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `admin_response` (string) - Response to feedback
- **Response:** Updated feedback with response

### 12.6 Update Feedback Status (HR Only)
**PUT** `/api/v1/feedback/{id}/status`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `status` (string) - "new", "in_progress", "resolved"
- **Response:** Updated feedback

### 12.7 Get Feedback Dashboard (HR Only)
**GET** `/api/v1/feedback/dashboard`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:**
  ```json
  {
    "total_feedback": 45,
    "new": 5,
    "in_progress": 12,
    "resolved": 28,
    "by_category": { "management": 15, "facilities": 20, ... },
    "by_sentiment": { "positive": 5, "neutral": 20, "negative": 20 },
    "avg_resolution_time": 3.5
  }
  ```

---

## 13. SURVEYS

### 13.1 Get Active Surveys (For Employee to Respond)
**GET** `/api/v1/surveys/active`
- **Auth Required:** Yes
- **Response:** Array of active surveys user hasn't responded to yet

### 13.2 List All Surveys
**GET** `/api/v1/surveys`
- **Auth Required:** Yes
- **Query Parameters:**
  - `page` (integer)
  - `per_page` (integer)
  - `status` (string, optional) - "draft", "published", "closed"
  - `type` (string, optional) - "engagement", "satisfaction", "feedback", etc.
- **Response:** Paginated surveys
  ```json
  {
    "data": [
      {
        "id": "survey_id",
        "title": "Employee Engagement Survey 2026",
        "description": "...",
        "survey_type": "engagement",
        "status": "published",
        "questions_count": 25,
        "responses_count": 120,
        "my_response": null,
        "start_date": "2026-03-01",
        "end_date": "2026-03-31"
      }
    ]
  }
  ```

### 13.3 Get Survey Detail
**GET** `/api/v1/surveys/{id}`
- **Auth Required:** Yes
- **Response:** Survey with all questions and options

### 13.4 Submit Survey Response
**POST** `/api/v1/surveys/{id}/respond`
- **Auth Required:** Yes
- **Request Body:**
  - `answers` (array) - Array of { question_id, answer_value } objects
    ```json
    {
      "answers": [
        { "question_id": 1, "answer_value": "5" },
        { "question_id": 2, "answer_value": "Strongly Agree" }
      ]
    }
    ```
- **Response:** Submitted response confirmation
- **Status Codes:** 201 (Created)

### 13.5 Get My Survey Responses
**GET** `/api/v1/surveys/my-responses`
- **Auth Required:** Yes
- **Response:** Array of surveys user has responded to with answers

### 13.6 Create Survey (HR Only)
**POST** `/api/v1/surveys`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `title` (string)
  - `description` (string, optional)
  - `survey_type` (string)
  - `questions` (array) - Array of question objects
    ```json
    {
      "questions": [
        {
          "question_text": "How satisfied are you?",
          "question_type": "rating",
          "scale": 5,
          "options": []
        },
        {
          "question_text": "Which areas need improvement?",
          "question_type": "multiple_choice",
          "options": ["Management", "Work Environment", "Benefits"]
        }
      ]
    }
    ```
  - `visibility` (string) - "all_employees", "specific_department", "specific_users"
  - `start_date` (date)
  - `end_date` (date)
- **Response:** Created survey (draft status)
- **Status Codes:** 201 (Created)

### 13.6 Update Survey (HR Only, Draft Only)
**PUT** `/api/v1/surveys/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:** Any survey fields
- **Response:** Updated survey

### 13.7 Publish Survey (HR Only)
**POST** `/api/v1/surveys/{id}/publish`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** Updated survey with status "published"

### 13.8 Close Survey (HR Only)
**POST** `/api/v1/surveys/{id}/close`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** Updated survey with status "closed"

### 13.9 Delete Survey (HR Only, Draft Only)
**DELETE** `/api/v1/surveys/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** `{ "message": "Survey deleted" }`

### 13.10 Get Survey Results (HR Only)
**GET** `/api/v1/surveys/{id}/results`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:**
  ```json
  {
    "total_responses": 120,
    "response_rate": 75,
    "questions": [
      {
        "question_id": 1,
        "question_text": "How satisfied are you?",
        "answers": {
          "1": 5,
          "2": 10,
          "3": 30,
          "4": 50,
          "5": 25
        },
        "average": 3.8
      }
    ]
  }
  ```

### 13.11 Get Survey Dashboard (HR Only)
**GET** `/api/v1/surveys/dashboard`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** All active surveys, response rates, and trend analysis

---

## 14. BIOMETRICS (Face Recognition, QR Code, Check-In)

### 14.1 Enroll Face (HR Only)
**POST** `/api/v1/biometrics/face/enroll`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `user_id` (integer)
  - `face_encoding` (string) - Base64 or vector representation
  - `thumbnail_path` (string, optional)
  - `enrollment_method` (string) - "mobile_app", "mobile_device", "kiosk"
  - `quality_score` (float, optional) - 0-1
- **Response:** Created face enrollment
- **Status Codes:** 201 (Created)

### 14.2 Get Face Enrollments (HR Only)
**GET** `/api/v1/biometrics/face/enrollments`
- **Auth Required:** Yes
- **Role Required:** HR
- **Query Parameters:**
  - `user_id` (integer, optional)
- **Response:** Array of active face enrollments

### 14.3 Delete Face Enrollment (HR Only)
**DELETE** `/api/v1/biometrics/face/enrollments/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** Decommissioned enrollment

### 14.4 Verify Face (Mobile Check-In)
**POST** `/api/v1/biometrics/face/verify`
- **Auth Required:** Yes
- **Request Body:**
  - `face_encoding` (string) - Captured face encoding
  - `confidence_threshold` (float, optional) - 0-1, default 0.8
  - `timestamp` (datetime, optional)
- **Response:**
  ```json
  {
    "matched": true,
    "user_id": "user_id",
    "confidence": 0.95,
    "message": "Face verified successfully"
  }
  ```

### 14.5 Generate QR Code (HR Only)
**POST** `/api/v1/biometrics/qr/generate`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `user_id` (integer)
- **Response:**
  ```json
  {
    "id": "qr_id",
    "user_id": "user_id",
    "code": "QR_CODE_DATA",
    "qr_image_url": "data:image/png;base64,...",
    "valid_until": "2026-04-26"
  }
  ```
- **Status Codes:** 201 (Created)

### 14.6 Get My QR Code
**GET** `/api/v1/biometrics/qr/my-code`
- **Auth Required:** Yes
- **Response:** Current user's QR code (auto-generates if none exists)

### 14.7 Validate QR Code Scan
**POST** `/api/v1/biometrics/qr/scan`
- **Auth Required:** Yes
- **Request Body:**
  - `code` (string) - Scanned QR code data
- **Response:**
  ```json
  {
    "valid": true,
    "user_id": "user_id",
    "timestamp": "2026-03-26T10:00:00Z"
  }
  ```

### 14.8 Biometric Check-In (Face or QR)
**POST** `/api/v1/biometrics/check-in`
- **Auth Required:** Yes
- **Request Body:**
  - `method` (string) - "face", "qr", "nfc"
  - `device_id` (string, optional)
  - `confidence_score` (float, optional) - For face recognition
  - `liveness_passed` (boolean, optional) - For anti-spoofing
  - `latitude` (float, optional)
  - `longitude` (float, optional)
  - `image_path` (string, optional) - Path to check-in photo
  - `qr_code` (string, optional) - Scanned QR code
- **Response:**
  ```json
  {
    "success": true,
    "biometric_log": {
      "id": "log_id",
      "user_id": "user_id",
      "method": "face",
      "timestamp": "2026-03-26T09:00:00Z",
      "confidence": 0.92,
      "location": { "latitude": 19.0760, "longitude": 72.8777 }
    },
    "attendance": {
      "id": "attendance_id",
      "status": "present",
      "check_in_time": "2026-03-26T09:00:00Z"
    }
  }
  ```
- **Status Codes:** 201 (Created)

### 14.9 Biometric Check-Out
**POST** `/api/v1/biometrics/check-out`
- **Auth Required:** Yes
- **Request Body:** Same as check-in
- **Response:** Similar structure with check-out time and duration

### 14.10 Register Biometric Device (HR Only)
**POST** `/api/v1/biometrics/devices`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:**
  - `name` (string)
  - `device_type` (string) - "facial_recognition", "fingerprint", "iris", "nfc_reader"
  - `location` (string)
  - `ip_address` (string, optional)
  - `api_key` (string) - Device authentication key
  - `is_active` (boolean, optional)
- **Response:** Created device with registration details
- **Status Codes:** 201 (Created)

### 14.11 Get Biometric Devices (HR Only)
**GET** `/api/v1/biometrics/devices`
- **Auth Required:** Yes
- **Role Required:** HR
- **Query Parameters:**
  - `status` (string, optional) - "active", "inactive"
  - `type` (string, optional)
- **Response:** Array of registered devices

### 14.12 Update Biometric Device (HR Only)
**PUT** `/api/v1/biometrics/devices/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:** Any device fields
- **Response:** Updated device

### 14.13 Delete/Decommission Device (HR Only)
**DELETE** `/api/v1/biometrics/devices/{id}`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:** Decommissioned device

### 14.14 Device Heartbeat (Unauthenticated, API Key Auth)
**POST** `/api/v1/biometrics/devices/{id}/heartbeat`
- **Auth Required:** No (Device API Key Required)
- **Headers:** `X-Device-API-Key: <api_key>`
- **Request Body:**
  - `status` (string) - "online", "offline", "error"
  - `battery_level` (float, optional)
  - `last_sync` (datetime, optional)
- **Response:** Acknowledgment
- **Status Codes:** 200 (Success), 401 (Invalid API Key)

### 14.15 Get Biometric Settings (HR Only)
**GET** `/api/v1/biometrics/settings`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:**
  ```json
  {
    "face_recognition_enabled": true,
    "face_confidence_threshold": 0.8,
    "qr_code_enabled": true,
    "qr_validity_days": 30,
    "liveness_detection_enabled": true,
    "location_tracking_enabled": true,
    "photo_storage_enabled": true
  }
  ```

### 14.16 Update Biometric Settings (HR Only)
**PUT** `/api/v1/biometrics/settings`
- **Auth Required:** Yes
- **Role Required:** HR
- **Request Body:** Any settings fields
- **Response:** Updated settings

### 14.17 Get Biometric Logs (HR Only)
**GET** `/api/v1/biometrics/logs`
- **Auth Required:** Yes
- **Role Required:** HR
- **Query Parameters:**
  - `page` (integer)
  - `per_page` (integer)
  - `method` (string, optional) - "face", "qr", "nfc"
  - `user_id` (integer, optional)
  - `result` (string, optional) - "success", "failed"
  - `date_from` (date, optional)
  - `date_to` (date, optional)
- **Response:** Paginated biometric logs

### 14.18 Get Biometric Dashboard (HR Only)
**GET** `/api/v1/biometrics/dashboard`
- **Auth Required:** Yes
- **Role Required:** HR
- **Response:**
  ```json
  {
    "total_enrollments": 150,
    "face_enrollments": 150,
    "qr_codes_active": 148,
    "devices_online": 8,
    "checkins_today": 132,
    "avg_face_confidence": 0.94,
    "false_rejection_rate": 0.02
  }
  ```

---

## 15. CHATBOT (AI-Powered HR Assistant)

### 15.1 Start New Conversation
**POST** `/api/v1/chatbot/conversations`
- **Auth Required:** Yes
- **Response:** Created conversation
  ```json
  {
    "id": "conversation_id",
    "user_id": "user_id",
    "created_at": "2026-03-26T10:00:00Z",
    "status": "active"
  }
  ```
- **Status Codes:** 201 (Created)

### 15.2 Get My Conversations
**GET** `/api/v1/chatbot/conversations`
- **Auth Required:** Yes
- **Response:** Array of user's conversations

### 15.3 Get Conversation Messages
**GET** `/api/v1/chatbot/conversations/{id}`
- **Auth Required:** Yes
- **Response:**
  ```json
  {
    "id": "conversation_id",
    "messages": [
      {
        "id": "msg_id",
        "role": "user",
        "message": "How do I apply for leave?",
        "timestamp": "2026-03-26T10:00:00Z"
      },
      {
        "id": "msg_id",
        "role": "assistant",
        "message": "To apply for leave, go to ...",
        "timestamp": "2026-03-26T10:00:15Z"
      }
    ]
  }
  ```

### 15.4 Send Message to Chatbot
**POST** `/api/v1/chatbot/conversations/{id}/send`
- **Auth Required:** Yes
- **Request Body:**
  - `message` (string) - User's message/question
- **Response:** AI response with bot message
  ```json
  {
    "user_message": {
      "id": "msg_id",
      "message": "What's my leave balance?",
      "role": "user"
    },
    "assistant_message": {
      "id": "msg_id",
      "message": "Your leave balance for 2026 is: ...",
      "role": "assistant",
      "confidence": 0.92
    }
  }
  ```

### 15.5 Delete Conversation
**DELETE** `/api/v1/chatbot/conversations/{id}`
- **Auth Required:** Yes
- **Response:** `{ "message": "Conversation archived" }`

### 15.6 Get Suggested Questions
**GET** `/api/v1/chatbot/suggestions`
- **Auth Required:** Yes
- **Response:**
  ```json
  {
    "suggestions": [
      "How do I apply for leave?",
      "What's my leave balance?",
      "How do I submit expense report?",
      "What are the company policies?",
      "How do I request shift swap?"
    ]
  }
  ```

### 15.7 Check AI Status
**GET** `/api/v1/chatbot/ai-status`
- **Auth Required:** Yes
- **Response:**
  ```json
  {
    "ai_engine_active": true,
    "model": "gpt-4",
    "last_updated": "2026-03-26T08:00:00Z"
  }
  ```

---

## 16. COMMON PATTERNS & BEST PRACTICES

### 16.1 Pagination
Most list endpoints support pagination:
```
GET /api/v1/[resource]?page=1&per_page=20
```

Response includes:
```json
{
  "data": [...],
  "total": 150,
  "page": 1,
  "per_page": 20
}
```

### 16.2 Error Responses
All errors follow standard format:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ]
  }
}
```

**Common Error Codes:**
- `VALIDATION_ERROR` (400) - Input validation failed
- `UNAUTHORIZED` (401) - Missing or invalid authentication
- `FORBIDDEN` (403) - Authenticated but insufficient permissions
- `NOT_FOUND` (404) - Resource not found
- `CONFLICT` (409) - Resource already exists
- `INTERNAL_SERVER_ERROR` (500) - Server error

### 16.3 Authentication & CORS
- **CORS Headers Required:** See index.ts for allowed origins
- **Custom Headers Supported:** `X-EmpCloud-API-Key`, `X-Device-API-Key`, `X-Request-ID`
- **Rate Limiting:** 
  - Auth endpoints: Configured limit per window
  - API endpoints: Configured limit per window

### 16.4 Audit Logging
All sensitive operations are logged:
- User authentication (login, password change)
- Profile updates
- Document verification
- Leave approvals
- Policy acknowledgments
- Biometric enrollments

Audit logs include: user ID, action, resource, IP address, user agent

### 16.5 File Upload
For file uploads (documents, etc.):
```
Content-Type: multipart/form-data
POST /api/v1/documents/upload
  - file (multipart file)
  - category_id (form field)
  - name (form field, optional)
```

### 16.6 Date/Time Format
- All dates: `YYYY-MM-DD` (ISO 8601)
- All times: `HH:MM` (24-hour format)
- All timestamps: ISO 8601 with UTC timezone `YYYY-MM-DDTHH:MM:SSZ`

### 16.7 Query Parameters
Boolean query parameters accept: `"true"`, `"1"`, or `true` (no quotes)

### 16.8 Webhooks & Callbacks
Webhooks available for:
- Leave approvals/rejections
- Announcements published
- Biometric enrollments
- Policy acknowledgments
- Survey responses
- Ticket resolutions

Configure via admin panel.

---

## 17. SDK / CLIENT LIBRARY RECOMMENDATIONS

For easier integration, consider using:
- **JavaScript/TypeScript:** `@empcloud/sdk-js` (with TypeScript types)
- **React:** `@empcloud/react` (hooks and components)
- **Flutter:** `empcloud_flutter` (for mobile apps)
- **Python:** `empcloud-sdk-python`
- **Go:** `github.com/empcloud/sdk-go`

---

## 18. MOBILE APP DEVELOPMENT GUIDE

### Recommended Flow:
1. **Authentication:** Login â†’ Store tokens securely â†’ Auto-refresh tokens
2. **Home Dashboard:** Fetch notifications, announcements, leave balance
3. **Attendance:** Check-in/out, view history
4. **Leave Management:** Apply leave, check balance
5. **Profile:** View/edit personal info
6. **Notifications:** Real-time updates via WebSocket or polling

### Performance Tips:
- Implement local caching with TTL
- Use batch endpoints where available
- Implement pagination for large lists
- Compress request/response payloads
- Cache user profile and org settings
- Handle network retries with exponential backoff

### Security:
- Store JWT tokens in secure storage (Keychain/Keystore)
- Implement token refresh before expiry
- HTTPS only
- Certificate pinning recommended
- Implement logout on unauthorized (401) errors
- Validate SSL certificates

---

## 19. RATE LIMITS & QUOTAS

Rate limits are applied per organization:
- **Auth endpoints:** 10 requests per minute (30-second window)
- **API endpoints:** 1000 requests per hour
- **File uploads:** 10 MB per file, 1 GB per day per user
- **Biometric logs:** 500 check-ins per minute per device

Exceeded limits return `429 Too Many Requests`.

---

## 20. API VERSIONING & DEPRECATION

Current version: `v1`

Deprecated endpoints will have sunset date of at least 12 months notice.

---

## File Paths Referenced
- Route files: `/packages/server/src/api/routes/*.routes.ts`
- Server entry: `/packages/server/src/index.ts`
- Validators: `/packages/shared/src/validators/index.ts`

This comprehensive API documentation provides mobile app developers with everything needed to integrate with EMP Cloud's full suite of HR management features.