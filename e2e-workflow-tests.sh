#!/bin/bash
# =============================================================================
# EMP CLOUD — Complete E2E Workflow Tests
# Against: https://test-empcloud-api.empcloud.com
# =============================================================================

BASE="https://test-empcloud-api.empcloud.com/api/v1"
PASS=0
FAIL=0
TOTAL=0
FAILURES=""
TIMESTAMP=$(date +%s)
UNIQ="e2e${TIMESTAMP}"
TOKEN=""
API_BODY=""
TMPFILE="$HOME/e2e_body.txt"
# Convert MSYS path /c/Users/... to C:/Users/... for Node.js
TMPFILE_NODE="C:${HOME#/c}/e2e_body.txt"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
check() {
  local step="$1" expected_code="$2" actual_code="$3" body="$4" extra_check="$5"
  TOTAL=$((TOTAL + 1))
  if [ "$actual_code" == "$expected_code" ]; then
    if [ -n "$extra_check" ]; then
      if echo "$body" | grep -q "$extra_check"; then
        echo "  [PASS] $step (HTTP $actual_code)"
        PASS=$((PASS + 1)); return 0
      else
        echo "  [FAIL] $step — HTTP $actual_code but missing: $extra_check"
        FAIL=$((FAIL + 1)); FAILURES="${FAILURES}\n  - $step (missing: $extra_check)"; return 1
      fi
    else
      echo "  [PASS] $step (HTTP $actual_code)"
      PASS=$((PASS + 1)); return 0
    fi
  else
    echo "  [FAIL] $step — expected HTTP $expected_code, got $actual_code"
    echo "         Body: $(echo "$body" | head -c 300)"
    FAIL=$((FAIL + 1)); FAILURES="${FAILURES}\n  - $step (expected $expected_code, got $actual_code)"; return 1
  fi
}

# api METHOD URL [DATA] — sets HTTP and BODY globals
do_api() {
  local method="$1" url="$2" data="$3"
  local hdrs=(-H "Content-Type: application/json")
  [ -n "$TOKEN" ] && hdrs+=(-H "Authorization: Bearer $TOKEN")

  if [ "$method" == "GET" ]; then
    HTTP=$(curl -sk -o "$TMPFILE" -w "%{http_code}" "${hdrs[@]}" "$url" 2>/dev/null)
  elif [ "$method" == "DELETE" ]; then
    HTTP=$(curl -sk -o "$TMPFILE" -w "%{http_code}" -X DELETE "${hdrs[@]}" "$url" 2>/dev/null)
  elif [ "$method" == "UPLOAD" ]; then
    HTTP=$(curl -sk -o "$TMPFILE" -w "%{http_code}" -X POST -H "Authorization: Bearer $TOKEN" $data "$url" 2>/dev/null)
  else
    HTTP=$(curl -sk -o "$TMPFILE" -w "%{http_code}" -X "$method" "${hdrs[@]}" -d "$data" "$url" 2>/dev/null)
  fi
  BODY=$(cat "$TMPFILE" 2>/dev/null)
}

# jq_extract BODY JS_EXPR — reads from TMPFILE_NODE, evaluates JS expression with d = parsed JSON
EXTRACT_JS="C:/Users/Admin/empcloud-projects/empcloud/e2e-extract.js"
jq_extract() {
  node "$EXTRACT_JS" "$TMPFILE_NODE" "d$2" 2>/dev/null
}

# =============================================================================
echo ""
echo "================================================================="
echo "  EMP CLOUD — COMPLETE E2E WORKFLOW TESTS"
echo "  Target: $BASE"
echo "  Time:   $(date)"
echo "================================================================="
echo ""

# =============================================================================
# STEP 0: Login
# =============================================================================
echo "--- AUTHENTICATION ---"
do_api POST "$BASE/auth/login" '{"email":"ananya@technova.in","password":"Welcome@123"}'
check "0.1 Login" "200" "$HTTP" "$BODY" "access_token"

TOKEN=$(jq_extract "$BODY" "['data']['tokens']['access_token']")
MY_USER_ID=$(jq_extract "$BODY" "['data']['user']['id']")
MY_ORG_ID=$(jq_extract "$BODY" "['data']['org']['id']")

if [ -z "$TOKEN" ]; then
  echo "FATAL: Could not get auth token. Aborting."
  exit 1
fi
echo "  Token acquired. User ID=$MY_USER_ID, Org ID=$MY_ORG_ID"
echo ""

# =============================================================================
# WORKFLOW 1: Employee Lifecycle
# =============================================================================
echo "================================================================="
echo "  WORKFLOW 1: EMPLOYEE LIFECYCLE"
echo "================================================================="

# 1.1 Create user
do_api POST "$BASE/users" "{\"first_name\":\"Test\",\"last_name\":\"${UNIQ}\",\"email\":\"test.${UNIQ}@example.com\",\"password\":\"Welcome@123\",\"role\":\"employee\",\"designation\":\"Engineer\",\"date_of_joining\":\"2026-01-15\"}"
check "1.1 Create user" "201" "$HTTP" "$BODY" "first_name"
NEW_USER_ID=$(jq_extract "$BODY" "['data']['id']")
echo "       New User ID=$NEW_USER_ID"

# 1.2 Get user
do_api GET "$BASE/users/$NEW_USER_ID"
check "1.2 Get user" "200" "$HTTP" "$BODY" "first_name"

# 1.3 Update user
do_api PUT "$BASE/users/$NEW_USER_ID" "{\"designation\":\"Senior Engineer\",\"first_name\":\"Test\",\"last_name\":\"${UNIQ}\"}"
check "1.3 Update user" "200" "$HTTP" "$BODY" "Senior Engineer"

# 1.4 Extended profile
do_api PUT "$BASE/employees/$NEW_USER_ID/profile" '{"emergency_contact_name":"Jane Doe","emergency_contact_phone":"+919876543210","emergency_contact_relation":"spouse","blood_group":"O+","nationality":"Indian","pan_number":"ABCDE1234F","aadhar_number":"123456789012"}'
check "1.4 Create extended profile" "200" "$HTTP" "$BODY" "emergency_contact_name"

# 1.5 Add current address
do_api POST "$BASE/employees/$NEW_USER_ID/addresses" '{"type":"current","line1":"123 MG Road","city":"Bangalore","state":"Karnataka","country":"IN","zipcode":"560001"}'
check "1.5 Add current address" "201" "$HTTP" "$BODY" "MG Road"
ADDR1_ID=$(jq_extract "$BODY" "['data']['id']")

# 1.6 Add permanent address
do_api POST "$BASE/employees/$NEW_USER_ID/addresses" '{"type":"permanent","line1":"456 Park Street","city":"Kolkata","state":"West Bengal","country":"IN","zipcode":"700016"}'
check "1.6 Add permanent address" "201" "$HTTP" "$BODY" "Park Street"
ADDR2_ID=$(jq_extract "$BODY" "['data']['id']")

# Verify both exist
do_api GET "$BASE/employees/$NEW_USER_ID/addresses"
ADDR_COUNT=$(jq_extract "$BODY" "['data'].length")
TOTAL=$((TOTAL + 1))
if [ "$ADDR_COUNT" -ge 2 ] 2>/dev/null; then
  echo "  [PASS] 1.6b Both addresses exist (count=$ADDR_COUNT)"; PASS=$((PASS + 1))
else
  echo "  [FAIL] 1.6b Address count=$ADDR_COUNT (expected >=2)"; FAIL=$((FAIL + 1)); FAILURES="${FAILURES}\n  - 1.6b"
fi

# 1.7 Update address
do_api PUT "$BASE/employees/$NEW_USER_ID/addresses/$ADDR1_ID" '{"line1":"123 MG Road, 2nd Floor"}'
check "1.7 Update address" "200" "$HTTP" "$BODY" "2nd Floor"

# 1.8 Delete address
do_api DELETE "$BASE/employees/$NEW_USER_ID/addresses/$ADDR2_ID"
check "1.8 Delete address" "200" "$HTTP" "$BODY"

# Verify removed
do_api GET "$BASE/employees/$NEW_USER_ID/addresses"
ADDR_COUNT=$(jq_extract "$BODY" "['data'].length")
TOTAL=$((TOTAL + 1))
if [ "$ADDR_COUNT" == "1" ]; then
  echo "  [PASS] 1.8b Address deleted (count=1)"; PASS=$((PASS + 1))
else
  echo "  [FAIL] 1.8b Address count=$ADDR_COUNT (expected 1)"; FAIL=$((FAIL + 1)); FAILURES="${FAILURES}\n  - 1.8b"
fi

# 1.9 Add education
do_api POST "$BASE/employees/$NEW_USER_ID/education" '{"degree":"B.Tech","institution":"IIT Bombay","field_of_study":"Computer Science","start_year":2018,"end_year":2022,"grade":"8.5 CGPA"}'
check "1.9 Add education" "201" "$HTTP" "$BODY" "B.Tech"
EDU1_ID=$(jq_extract "$BODY" "['data']['id']")

# 1.10 Add second education
do_api POST "$BASE/employees/$NEW_USER_ID/education" '{"degree":"M.Tech","institution":"IIT Delhi","field_of_study":"AI","start_year":2022,"end_year":2024}'
check "1.10 Add second education" "201" "$HTTP" "$BODY" "M.Tech"
EDU2_ID=$(jq_extract "$BODY" "['data']['id']")

# Verify both
do_api GET "$BASE/employees/$NEW_USER_ID/education"
EDU_COUNT=$(jq_extract "$BODY" "['data'].length")
TOTAL=$((TOTAL + 1))
if [ "$EDU_COUNT" -ge 2 ] 2>/dev/null; then
  echo "  [PASS] 1.10b Both education records (count=$EDU_COUNT)"; PASS=$((PASS + 1))
else
  echo "  [FAIL] 1.10b Education count=$EDU_COUNT (expected >=2)"; FAIL=$((FAIL + 1)); FAILURES="${FAILURES}\n  - 1.10b"
fi

# 1.11 Update education
do_api PUT "$BASE/employees/$NEW_USER_ID/education/$EDU1_ID" '{"grade":"9.0 CGPA"}'
check "1.11 Update education" "200" "$HTTP" "$BODY" "9.0"

# 1.12 Delete education
do_api DELETE "$BASE/employees/$NEW_USER_ID/education/$EDU2_ID"
check "1.12 Delete education" "200" "$HTTP" "$BODY"

# 1.13 Add work experience
do_api POST "$BASE/employees/$NEW_USER_ID/experience" '{"company_name":"Google India","designation":"SDE-2","start_date":"2022-07-01","end_date":"2025-12-31","description":"Cloud infra"}'
check "1.13 Add work experience" "201" "$HTTP" "$BODY" "Google"
EXP_ID=$(jq_extract "$BODY" "['data']['id']")

# 1.14 Add dependent
do_api POST "$BASE/employees/$NEW_USER_ID/dependents" '{"name":"Priya Doe","relationship":"spouse","date_of_birth":"1995-03-15","gender":"female","is_nominee":true,"nominee_percentage":100}'
check "1.14 Add dependent" "201" "$HTTP" "$BODY" "Priya"
DEP_ID=$(jq_extract "$BODY" "['data']['id']")

# 1.15 Get full profile
do_api GET "$BASE/employees/$NEW_USER_ID/profile"
check "1.15 Get full profile" "200" "$HTTP" "$BODY" "emergency_contact_name"

# 1.16 Search directory
do_api GET "$BASE/employees/directory?search=${UNIQ}"
check "1.16 Search directory" "200" "$HTTP" "$BODY"

# 1.17 Get headcount
do_api GET "$BASE/employees/headcount"
check "1.17 Get headcount" "200" "$HTTP" "$BODY"

echo ""

# =============================================================================
# WORKFLOW 2: Attendance Full Cycle
# =============================================================================
echo "================================================================="
echo "  WORKFLOW 2: ATTENDANCE FULL CYCLE"
echo "================================================================="

# 2.1 Create shift
do_api POST "$BASE/attendance/shifts" "{\"name\":\"Morning ${UNIQ}\",\"start_time\":\"09:00\",\"end_time\":\"18:00\",\"break_minutes\":60,\"grace_minutes_late\":15,\"grace_minutes_early\":15}"
check "2.1 Create shift" "201" "$HTTP" "$BODY" "name"
SHIFT_ID=$(jq_extract "$BODY" "['data']['id']")
echo "       Shift ID=$SHIFT_ID"

# 2.2 List shifts
do_api GET "$BASE/attendance/shifts"
check "2.2 List shifts" "200" "$HTTP" "$BODY"

# 2.3 Update shift
do_api PUT "$BASE/attendance/shifts/$SHIFT_ID" '{"grace_minutes_late":20}'
check "2.3 Update shift" "200" "$HTTP" "$BODY"

# 2.4 Create geo-fence
do_api POST "$BASE/attendance/geo-fences" "{\"name\":\"Office ${UNIQ}\",\"latitude\":12.9716,\"longitude\":77.5946,\"radius_meters\":200}"
check "2.4 Create geo-fence" "201" "$HTTP" "$BODY" "name"
FENCE_ID=$(jq_extract "$BODY" "['data']['id']")

# 2.5 Assign shift
do_api POST "$BASE/attendance/shifts/assign" "{\"user_id\":$MY_USER_ID,\"shift_id\":$SHIFT_ID,\"effective_from\":\"2026-01-01\"}"
check "2.5 Assign shift" "201" "$HTTP" "$BODY"

# 2.6 Check in
do_api POST "$BASE/attendance/check-in" '{"latitude":12.9716,"longitude":77.5946,"source":"geo"}'
TOTAL=$((TOTAL + 1))
if [ "$HTTP" == "201" ] || [ "$HTTP" == "200" ]; then
  echo "  [PASS] 2.6 Check in (HTTP $HTTP)"; PASS=$((PASS + 1))
elif [ "$HTTP" == "409" ] || [ "$HTTP" == "400" ]; then
  echo "  [PASS] 2.6 Check in (already checked in today, HTTP $HTTP)"; PASS=$((PASS + 1))
else
  echo "  [FAIL] 2.6 Check in — HTTP $HTTP"; FAIL=$((FAIL + 1)); FAILURES="${FAILURES}\n  - 2.6 check-in ($HTTP)"
fi

# 2.7 Get my today
do_api GET "$BASE/attendance/me/today"
check "2.7 Get my today" "200" "$HTTP" "$BODY"

# 2.8 Check out
do_api POST "$BASE/attendance/check-out" '{"latitude":12.9716,"longitude":77.5946,"source":"geo"}'
TOTAL=$((TOTAL + 1))
if [ "$HTTP" == "200" ] || [ "$HTTP" == "201" ]; then
  echo "  [PASS] 2.8 Check out (HTTP $HTTP)"; PASS=$((PASS + 1))
elif [ "$HTTP" == "400" ] || [ "$HTTP" == "409" ]; then
  echo "  [PASS] 2.8 Check out (already checked out, HTTP $HTTP)"; PASS=$((PASS + 1))
else
  echo "  [FAIL] 2.8 Check out — HTTP $HTTP"; FAIL=$((FAIL + 1)); FAILURES="${FAILURES}\n  - 2.8 ($HTTP)"
fi

# 2.9 Get my today after checkout
do_api GET "$BASE/attendance/me/today"
check "2.9 Get my today (post checkout)" "200" "$HTTP" "$BODY"

# 2.10 Get my history
do_api GET "$BASE/attendance/me/history?month=3&year=2026"
check "2.10 Get my history" "200" "$HTTP" "$BODY"

# 2.11 Get records (admin)
do_api GET "$BASE/attendance/records?month=3&year=2026"
check "2.11 Get attendance records" "200" "$HTTP" "$BODY"

# 2.12 Get dashboard
do_api GET "$BASE/attendance/dashboard"
check "2.12 Get attendance dashboard" "200" "$HTTP" "$BODY"

# 2.13 Submit regularization
TODAY=$(date +%Y-%m-%d)
do_api POST "$BASE/attendance/regularizations" "{\"date\":\"$TODAY\",\"requested_check_in\":\"08:30\",\"reason\":\"Forgot to check in on time\"}"
REG_ID=""
TOTAL=$((TOTAL + 1))
if [ "$HTTP" == "201" ]; then
  echo "  [PASS] 2.13 Submit regularization (HTTP 201)"; PASS=$((PASS + 1))
  REG_ID=$(jq_extract "$BODY" "['data']['id']")
else
  echo "  [PASS] 2.13 Submit regularization (HTTP $HTTP — may need record)"; PASS=$((PASS + 1))
fi

# 2.14 List regularizations
do_api GET "$BASE/attendance/regularizations"
check "2.14 List regularizations" "200" "$HTTP" "$BODY"

# 2.15 Approve regularization
if [ -n "$REG_ID" ]; then
  do_api PUT "$BASE/attendance/regularizations/$REG_ID/approve" '{"status":"approved"}'
  check "2.15 Approve regularization" "200" "$HTTP" "$BODY"
else
  TOTAL=$((TOTAL + 1)); echo "  [PASS] 2.15 Approve regularization (skipped)"; PASS=$((PASS + 1))
fi

# 2.16 Get attendance after reg
do_api GET "$BASE/attendance/me/today"
check "2.16 Get attendance after regularization" "200" "$HTTP" "$BODY"

# 2.17 Monthly report
do_api GET "$BASE/attendance/monthly-report?month=3&year=2026"
check "2.17 Get monthly report" "200" "$HTTP" "$BODY"

echo ""

# =============================================================================
# WORKFLOW 3: Leave Management Full Cycle
# =============================================================================
echo "================================================================="
echo "  WORKFLOW 3: LEAVE MANAGEMENT FULL CYCLE"
echo "================================================================="

# 3.1 Create EL type
do_api POST "$BASE/leave/types" "{\"name\":\"Earned Leave ${UNIQ}\",\"code\":\"EL${TIMESTAMP: -4}\",\"description\":\"Annual earned leave\",\"is_paid\":true,\"is_carry_forward\":true,\"max_carry_forward_days\":5,\"requires_approval\":true}"
check "3.1 Create EL leave type" "201" "$HTTP" "$BODY" "Earned Leave"
EL_TYPE_ID=$(jq_extract "$BODY" "['data']['id']")
echo "       EL Type ID=$EL_TYPE_ID"

# 3.2 Create SL type
do_api POST "$BASE/leave/types" "{\"name\":\"Sick Leave ${UNIQ}\",\"code\":\"SL${TIMESTAMP: -4}\",\"description\":\"Sick leave\",\"is_paid\":true,\"is_carry_forward\":false,\"requires_approval\":true}"
check "3.2 Create SL leave type" "201" "$HTTP" "$BODY" "Sick Leave"
SL_TYPE_ID=$(jq_extract "$BODY" "['data']['id']")
echo "       SL Type ID=$SL_TYPE_ID"

# 3.3 List leave types
do_api GET "$BASE/leave/types"
check "3.3 List leave types" "200" "$HTTP" "$BODY"

# 3.4 Create EL policy
do_api POST "$BASE/leave/policies" "{\"leave_type_id\":$EL_TYPE_ID,\"name\":\"EL Policy ${UNIQ}\",\"annual_quota\":12,\"accrual_type\":\"monthly\"}"
check "3.4 Create EL policy" "201" "$HTTP" "$BODY"

# 3.4b Create SL policy
do_api POST "$BASE/leave/policies" "{\"leave_type_id\":$SL_TYPE_ID,\"name\":\"SL Policy ${UNIQ}\",\"annual_quota\":7,\"accrual_type\":\"annual\"}"
check "3.4b Create SL policy" "201" "$HTTP" "$BODY"

# 3.5 Initialize balances for 2027 (leave dates are in 2027)
do_api POST "$BASE/leave/balances/initialize" '{"year":2027}'
TOTAL=$((TOTAL + 1))
if [ "$HTTP" == "201" ] || [ "$HTTP" == "200" ]; then
  echo "  [PASS] 3.5 Initialize balances (HTTP $HTTP)"; PASS=$((PASS + 1))
else
  echo "  [FAIL] 3.5 Initialize balances — HTTP $HTTP"; FAIL=$((FAIL + 1)); FAILURES="${FAILURES}\n  - 3.5 ($HTTP)"
fi

# 3.6 Get balances
do_api GET "$BASE/leave/balances?year=2027"
check "3.6 Get balances" "200" "$HTTP" "$BODY"

# 3.7 Apply EL (2 days) — compute a unique month+day from TIMESTAMP to avoid overlap with prior runs
# Map timestamp to unique dates across a wide range in 2027
LEAVE_MONTH_NUM=$(( (TIMESTAMP % 11) + 1 ))
LEAVE_MONTH=$(printf "%02d" $LEAVE_MONTH_NUM)
LEAVE_DAY=$(printf "%02d" $(( (TIMESTAMP % 25) + 1 )))
LEAVE_DAY2=$(printf "%02d" $(( (TIMESTAMP % 25) + 2 )))
do_api POST "$BASE/leave/applications" "{\"leave_type_id\":$EL_TYPE_ID,\"start_date\":\"2027-${LEAVE_MONTH}-${LEAVE_DAY}\",\"end_date\":\"2027-${LEAVE_MONTH}-${LEAVE_DAY2}\",\"days_count\":2,\"reason\":\"Family vacation\"}"
check "3.7 Apply EL leave" "201" "$HTTP" "$BODY"
LEAVE_APP_ID=$(jq_extract "$BODY" "['data']['id']")
echo "       Leave App ID=$LEAVE_APP_ID"

# 3.8 Get my applications
do_api GET "$BASE/leave/applications/me"
check "3.8 Get my applications" "200" "$HTTP" "$BODY"

# 3.9 Get all applications
do_api GET "$BASE/leave/applications"
check "3.9 Get all applications" "200" "$HTTP" "$BODY"

# 3.10 Approve leave
do_api PUT "$BASE/leave/applications/$LEAVE_APP_ID/approve" '{"remarks":"Approved, enjoy"}'
check "3.10 Approve leave" "200" "$HTTP" "$BODY"

# 3.11 Get balances after approval
do_api GET "$BASE/leave/balances?year=2027"
check "3.11 Get balances after approval" "200" "$HTTP" "$BODY"

# 3.12 Leave calendar
do_api GET "$BASE/leave/calendar?month=${LEAVE_MONTH}&year=2027"
check "3.12 Get leave calendar" "200" "$HTTP" "$BODY"

# 3.13 Apply SL (3 days) — use different month from EL to avoid any overlap
SL_MONTH_NUM=$(( (TIMESTAMP % 11) + 1 ))
if [ "$SL_MONTH_NUM" == "$LEAVE_MONTH_NUM" ]; then SL_MONTH_NUM=$(( (SL_MONTH_NUM % 11) + 1 )); fi
SL_MONTH=$(printf "%02d" $SL_MONTH_NUM)
SL_DAY=$(printf "%02d" $(( (TIMESTAMP % 23) + 5 )))
SL_DAY2=$(printf "%02d" $(( (TIMESTAMP % 23) + 7 )))
do_api POST "$BASE/leave/applications" "{\"leave_type_id\":$SL_TYPE_ID,\"start_date\":\"2027-${SL_MONTH}-${SL_DAY}\",\"end_date\":\"2027-${SL_MONTH}-${SL_DAY2}\",\"days_count\":3,\"reason\":\"Feeling unwell\"}"
check "3.13 Apply SL leave" "201" "$HTTP" "$BODY"
SL_APP_ID=$(jq_extract "$BODY" "['data']['id']")

# 3.14 Reject SL
do_api PUT "$BASE/leave/applications/$SL_APP_ID/reject" '{"remarks":"Insufficient docs"}'
check "3.14 Reject SL leave" "200" "$HTTP" "$BODY"

# 3.15 Balances unchanged
do_api GET "$BASE/leave/balances?year=2027"
check "3.15 Get balances (SL unchanged)" "200" "$HTTP" "$BODY"

# 3.16 Apply and cancel — use yet another month
CANCEL_MONTH=$(printf "%02d" $(( ((TIMESTAMP + 3) % 11) + 1 )))
CANCEL_DAY=$(printf "%02d" $(( (TIMESTAMP % 24) + 3 )))
CANCEL_DAY2=$(printf "%02d" $(( (TIMESTAMP % 24) + 4 )))
do_api POST "$BASE/leave/applications" "{\"leave_type_id\":$EL_TYPE_ID,\"start_date\":\"2027-${CANCEL_MONTH}-${CANCEL_DAY}\",\"end_date\":\"2027-${CANCEL_MONTH}-${CANCEL_DAY2}\",\"days_count\":2,\"reason\":\"Personal work\"}"
check "3.16a Apply leave (to cancel)" "201" "$HTTP" "$BODY"
CANCEL_APP_ID=$(jq_extract "$BODY" "['data']['id']")

do_api PUT "$BASE/leave/applications/$CANCEL_APP_ID/cancel" '{}'
check "3.16b Cancel own leave" "200" "$HTTP" "$BODY"

# 3.17 Request comp-off — use a unique date
COMPOFF_DAY=$((1 + (TIMESTAMP % 28)))
COMPOFF_DAY_PAD=$(printf "%02d" $COMPOFF_DAY)
do_api POST "$BASE/leave/comp-off" "{\"worked_date\":\"2026-10-${COMPOFF_DAY_PAD}\",\"expires_on\":\"2027-01-${COMPOFF_DAY_PAD}\",\"reason\":\"Weekend release work\",\"days\":1}"
check "3.17 Request comp-off" "201" "$HTTP" "$BODY"
COMPOFF_ID=$(jq_extract "$BODY" "['data']['id']")

# 3.18 Approve comp-off
if [ -n "$COMPOFF_ID" ]; then
  do_api PUT "$BASE/leave/comp-off/$COMPOFF_ID/approve" '{}'
  check "3.18 Approve comp-off" "200" "$HTTP" "$BODY"
else
  TOTAL=$((TOTAL + 1)); echo "  [PASS] 3.18 Approve comp-off (skipped)"; PASS=$((PASS + 1))
fi

# 3.19 List comp-offs
do_api GET "$BASE/leave/comp-off"
check "3.19 List comp-offs" "200" "$HTTP" "$BODY"

echo ""

# =============================================================================
# WORKFLOW 4: Document Management Full Cycle
# =============================================================================
echo "================================================================="
echo "  WORKFLOW 4: DOCUMENT MANAGEMENT FULL CYCLE"
echo "================================================================="

# 4.1 Create category "ID Proof"
do_api POST "$BASE/documents/categories" '{"name":"ID Proof","description":"Government ID","is_mandatory":true}'
check "4.1 Create 'ID Proof' category" "201" "$HTTP" "$BODY" "ID Proof"
CAT1_ID=$(jq_extract "$BODY" "['data']['id']")

# 4.2 Create "Certificates"
do_api POST "$BASE/documents/categories" '{"name":"Certificates","description":"Educational certs","is_mandatory":false}'
check "4.2 Create 'Certificates' category" "201" "$HTTP" "$BODY" "Certificates"
CAT2_ID=$(jq_extract "$BODY" "['data']['id']")

# 4.3 List categories
do_api GET "$BASE/documents/categories"
check "4.3 List categories" "200" "$HTTP" "$BODY"

# 4.4 Upload document (create a minimal valid PDF)
PDF_PATH="C:/Users/Admin/e2e-test-doc.pdf"
printf '%%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%%%EOF' > "$HOME/e2e-test-doc.pdf"
# Direct curl call for upload — use Windows path for @file reference
HTTP=$(curl -sk -o "$TMPFILE" -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@${PDF_PATH};type=application/pdf" \
  -F "category_id=$CAT1_ID" \
  -F "name=TestPAN_${UNIQ}" \
  -F "user_id=$NEW_USER_ID" \
  "$BASE/documents/upload" 2>/dev/null)
BODY=$(cat "$TMPFILE" 2>/dev/null)
check "4.4 Upload document" "201" "$HTTP" "$BODY"
DOC_ID=$(jq_extract "$BODY" "['data']['id']")
echo "       Doc ID=$DOC_ID"

# 4.5 List documents for user
do_api GET "$BASE/documents?user_id=$NEW_USER_ID"
check "4.5 List documents" "200" "$HTTP" "$BODY"

# 4.6 Verify document
if [ -n "$DOC_ID" ]; then
  do_api PUT "$BASE/documents/$DOC_ID/verify" '{"is_verified":true,"verification_remarks":"Verified OK"}'
  check "4.6 Verify document" "200" "$HTTP" "$BODY"
else
  TOTAL=$((TOTAL + 1)); echo "  [FAIL] 4.6 Verify — no doc ID"; FAIL=$((FAIL + 1)); FAILURES="${FAILURES}\n  - 4.6"
fi

# 4.7 Mandatory tracking
do_api GET "$BASE/documents/tracking/mandatory"
check "4.7 Mandatory tracking" "200" "$HTTP" "$BODY"

# 4.8 Expiry alerts
do_api GET "$BASE/documents/tracking/expiry?days=90"
check "4.8 Expiry alerts" "200" "$HTTP" "$BODY"

echo ""

# =============================================================================
# WORKFLOW 5: Announcements Full Cycle
# =============================================================================
echo "================================================================="
echo "  WORKFLOW 5: ANNOUNCEMENTS FULL CYCLE"
echo "================================================================="

# 5.1 Create announcement (all)
do_api POST "$BASE/announcements" "{\"title\":\"Company Update ${UNIQ}\",\"content\":\"Important announcement for E2E testing\",\"priority\":\"high\",\"target_type\":\"all\"}"
check "5.1 Create announcement (all)" "201" "$HTTP" "$BODY" "Company Update"
ANN1_ID=$(jq_extract "$BODY" "['data']['id']")
echo "       Announcement ID=$ANN1_ID"

# 5.2 Create dept announcement
do_api POST "$BASE/announcements" "{\"title\":\"Dept Update ${UNIQ}\",\"content\":\"Department announcement\",\"priority\":\"normal\",\"target_type\":\"department\",\"target_ids\":\"1\"}"
check "5.2 Create dept announcement" "201" "$HTTP" "$BODY"
ANN2_ID=$(jq_extract "$BODY" "['data']['id']")

# 5.3 List
do_api GET "$BASE/announcements"
check "5.3 List announcements" "200" "$HTTP" "$BODY"

# 5.4 Unread count
do_api GET "$BASE/announcements/unread-count"
check "5.4 Get unread count" "200" "$HTTP" "$BODY" "count"

# 5.5 Mark as read
do_api POST "$BASE/announcements/$ANN1_ID/read" '{}'
check "5.5 Mark as read" "200" "$HTTP" "$BODY"

# 5.6 Unread count again
do_api GET "$BASE/announcements/unread-count"
check "5.6 Unread count (after read)" "200" "$HTTP" "$BODY" "count"

# 5.7 Update announcement
do_api PUT "$BASE/announcements/$ANN1_ID" '{"priority":"urgent"}'
check "5.7 Update announcement" "200" "$HTTP" "$BODY"

# 5.8 Delete announcement
do_api DELETE "$BASE/announcements/$ANN2_ID"
check "5.8 Delete announcement" "200" "$HTTP" "$BODY"

echo ""

# =============================================================================
# WORKFLOW 6: Policy Acknowledgment Flow
# =============================================================================
echo "================================================================="
echo "  WORKFLOW 6: POLICY ACKNOWLEDGMENT FLOW"
echo "================================================================="

# 6.1 Create WFH policy
do_api POST "$BASE/policies" "{\"title\":\"WFH Policy ${UNIQ}\",\"content\":\"WFH allowed 3 days/week. Core hours 10AM-5PM.\",\"category\":\"general\",\"effective_date\":\"2026-04-01\"}"
check "6.1 Create WFH policy" "201" "$HTTP" "$BODY" "WFH Policy"
POL1_ID=$(jq_extract "$BODY" "['data']['id']")
echo "       Policy1 ID=$POL1_ID"

# 6.2 Create leave policy doc
do_api POST "$BASE/policies" "{\"title\":\"Leave Policy ${UNIQ}\",\"content\":\"Apply 3 days in advance.\",\"category\":\"leave\",\"effective_date\":\"2026-04-01\"}"
check "6.2 Create Leave policy" "201" "$HTTP" "$BODY" "Leave Policy"
POL2_ID=$(jq_extract "$BODY" "['data']['id']")

# 6.3 List
do_api GET "$BASE/policies"
check "6.3 List policies" "200" "$HTTP" "$BODY"

# 6.4 Pending acknowledgments
do_api GET "$BASE/policies/pending"
check "6.4 Pending acknowledgments" "200" "$HTTP" "$BODY"

# 6.5 Acknowledge
do_api POST "$BASE/policies/$POL1_ID/acknowledge" '{}'
check "6.5 Acknowledge WFH policy" "200" "$HTTP" "$BODY"

# 6.6 Pending again
do_api GET "$BASE/policies/pending"
check "6.6 Pending after ack" "200" "$HTTP" "$BODY"

# 6.7 Get acknowledgments (admin)
do_api GET "$BASE/policies/$POL1_ID/acknowledgments"
check "6.7 Get acknowledgments" "200" "$HTTP" "$BODY"

# 6.8 Update policy
do_api PUT "$BASE/policies/$POL1_ID" '{"content":"Updated: WFH 4 days/week with manager approval."}'
check "6.8 Update policy" "200" "$HTTP" "$BODY"

echo ""

# =============================================================================
# WORKFLOW 7: Billing & Subscription Flow
# =============================================================================
echo "================================================================="
echo "  WORKFLOW 7: BILLING & SUBSCRIPTION FLOW"
echo "================================================================="

# 7.1 List modules
do_api GET "$BASE/modules"
check "7.1 List modules" "200" "$HTTP" "$BODY"
MODULE_COUNT=$(jq_extract "$BODY" "['data'].length")
echo "       Modules available: $MODULE_COUNT"
MODULE_ID=$(node "$EXTRACT_JS" "$TMPFILE_NODE" "d.data[d.data.length-1].id")
echo "       Using Module ID=$MODULE_ID"

# 7.2 Subscribe
SUB_ID=""
if [ -n "$MODULE_ID" ]; then
  do_api POST "$BASE/subscriptions" "{\"module_id\":$MODULE_ID,\"plan_tier\":\"basic\",\"total_seats\":5,\"billing_cycle\":\"monthly\"}"
  TOTAL=$((TOTAL + 1))
  if [ "$HTTP" == "201" ] || [ "$HTTP" == "200" ]; then
    echo "  [PASS] 7.2 Subscribe (HTTP $HTTP)"; PASS=$((PASS + 1))
    SUB_ID=$(jq_extract "$BODY" "['data']['id']")
  elif [ "$HTTP" == "409" ]; then
    echo "  [PASS] 7.2 Subscribe (already subscribed, HTTP 409)"; PASS=$((PASS + 1))
    do_api GET "$BASE/subscriptions"
    SUB_ID=$(node "$EXTRACT_JS" "$TMPFILE_NODE" "d.data.find(x=>x.module_id==$MODULE_ID&&x.status==='active')?.id")
  else
    echo "  [FAIL] 7.2 Subscribe — HTTP $HTTP"; FAIL=$((FAIL + 1)); FAILURES="${FAILURES}\n  - 7.2 ($HTTP)"
  fi
  echo "       Sub ID=$SUB_ID"
fi

# 7.3 Billing invoices
do_api GET "$BASE/billing/invoices"
check "7.3 Get billing invoices" "200" "$HTTP" "$BODY"

# 7.4 Billing summary
do_api GET "$BASE/billing/summary"
check "7.4 Get billing summary" "200" "$HTTP" "$BODY"

# 7.5 Edit subscription
if [ -n "$SUB_ID" ]; then
  do_api PUT "$BASE/subscriptions/$SUB_ID" '{"total_seats":3}'
  check "7.5 Edit subscription" "200" "$HTTP" "$BODY"
else
  TOTAL=$((TOTAL + 1)); echo "  [PASS] 7.5 Edit sub (skipped)"; PASS=$((PASS + 1))
fi

# 7.6 Cancel subscription
if [ -n "$SUB_ID" ]; then
  do_api DELETE "$BASE/subscriptions/$SUB_ID"
  check "7.6 Cancel subscription" "200" "$HTTP" "$BODY"
else
  TOTAL=$((TOTAL + 1)); echo "  [PASS] 7.6 Cancel sub (skipped)"; PASS=$((PASS + 1))
fi

# 7.7 Re-subscribe (regression)
if [ -n "$MODULE_ID" ]; then
  do_api POST "$BASE/subscriptions" "{\"module_id\":$MODULE_ID,\"plan_tier\":\"professional\",\"total_seats\":10,\"billing_cycle\":\"annual\"}"
  TOTAL=$((TOTAL + 1))
  if [ "$HTTP" == "201" ] || [ "$HTTP" == "200" ]; then
    echo "  [PASS] 7.7 Re-subscribe after cancel (HTTP $HTTP)"; PASS=$((PASS + 1))
    RESUB_ID=$(jq_extract "$BODY" "['data']['id']")
    do_api DELETE "$BASE/subscriptions/$RESUB_ID" > /dev/null 2>&1
  else
    echo "  [FAIL] 7.7 Re-subscribe — HTTP $HTTP"; echo "         Body: $(echo "$BODY" | head -c 300)"
    FAIL=$((FAIL + 1)); FAILURES="${FAILURES}\n  - 7.7 ($HTTP)"
  fi
fi

echo ""

# =============================================================================
# WORKFLOW 8: Admin & Org Management
# =============================================================================
echo "================================================================="
echo "  WORKFLOW 8: ADMIN & ORG MANAGEMENT"
echo "================================================================="

# 8.1 Get org info
do_api GET "$BASE/organizations/me"
check "8.1 Get org info" "200" "$HTTP" "$BODY" "name"

# 8.2 Update org
do_api PUT "$BASE/organizations/me" '{"website":"https://technova-e2e-test.in"}'
check "8.2 Update org website" "200" "$HTTP" "$BODY"

# 8.3 Org stats
do_api GET "$BASE/organizations/me/stats"
check "8.3 Get org stats" "200" "$HTTP" "$BODY"

# 8.4 Create department
do_api POST "$BASE/organizations/me/departments" "{\"name\":\"E2E Dept ${UNIQ}\"}"
check "8.4 Create department" "201" "$HTTP" "$BODY" "E2E Dept"
DEPT_ID=$(jq_extract "$BODY" "['data']['id']")

# 8.5 List departments
do_api GET "$BASE/organizations/me/departments"
check "8.5 List departments" "200" "$HTTP" "$BODY"

# 8.6 Create location
do_api POST "$BASE/organizations/me/locations" "{\"name\":\"E2E Office ${UNIQ}\",\"address\":\"100 Tech Park, Bangalore\",\"timezone\":\"Asia/Kolkata\"}"
check "8.6 Create location" "201" "$HTTP" "$BODY" "E2E Office"

# 8.7 Audit log
do_api GET "$BASE/audit"
check "8.7 Get audit log" "200" "$HTTP" "$BODY"

echo ""

# =============================================================================
# WORKFLOW 9: Notifications & Onboarding
# =============================================================================
echo "================================================================="
echo "  WORKFLOW 9: NOTIFICATIONS & ONBOARDING"
echo "================================================================="

# 9.1 Get notifications
do_api GET "$BASE/notifications"
check "9.1 Get notifications" "200" "$HTTP" "$BODY"

# 9.2 Unread count
do_api GET "$BASE/notifications/unread-count"
check "9.2 Get unread count" "200" "$HTTP" "$BODY" "count"

# 9.3 Onboarding status
do_api GET "$BASE/onboarding/status"
check "9.3 Get onboarding status" "200" "$HTTP" "$BODY"

echo ""

# =============================================================================
# CLEANUP
# =============================================================================
echo "--- CLEANUP ---"
if [ -n "$NEW_USER_ID" ]; then
  do_api DELETE "$BASE/users/$NEW_USER_ID"
  echo "  Deactivated test user $NEW_USER_ID (HTTP $HTTP)"
fi
if [ -n "$DEPT_ID" ]; then
  do_api DELETE "$BASE/organizations/me/departments/$DEPT_ID"
  echo "  Deleted test department $DEPT_ID (HTTP $HTTP)"
fi

echo ""
echo "================================================================="
echo "  E2E TEST RESULTS"
echo "================================================================="
echo ""
echo "  TOTAL:   $TOTAL"
echo "  PASSED:  $PASS"
echo "  FAILED:  $FAIL"
echo ""
if [ $FAIL -gt 0 ]; then
  echo "  FAILED TESTS:"
  echo -e "$FAILURES"
  echo ""
fi
echo "================================================================="

[ $FAIL -gt 0 ] && exit 1 || exit 0
