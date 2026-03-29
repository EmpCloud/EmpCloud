# Biometrics Module — End-to-End Test Plan

## Module Overview
Biometric attendance system with face enrollment, QR code attendance, device management, biometric check-in/out (face, fingerprint, QR, selfie), configurable settings, and comprehensive logging.

---

## Test Phases

### Phase 1: Biometric Dashboard

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Navigate to `/biometrics` | Dashboard loads with 5 metric cards |
| 2 | Check-ins Today count | Matches today's successful check-ins |
| 3 | Check-outs Today count | Matches today's successful check-outs |
| 4 | Failed Attempts count | Includes failed/spoofing/no_match results |
| 5 | Enrolled Users count | Distinct users with active face enrollment |
| 6 | Online Devices count | Devices with status=online and active |
| 7 | Method breakdown section | Face/Fingerprint/QR/Selfie counts shown |
| 8 | Recent events (last 10) | Events with user, method, result, timestamp |

### Phase 2: Face Enrollment (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 9 | Open enrollment form | Employee dropdown + method selector visible |
| 10 | Select employee from dropdown | Employee selected |
| 11 | Choose method: Photo Upload | Upload field appears |
| 12 | Choose method: Webcam Capture | Webcam UI appears |
| 13 | Choose method: Device Capture | Device capture option |
| 14 | Enroll employee face | Enrollment created, quality score shown |
| 15 | Re-enroll same employee | Previous enrollment deactivated, new one created |
| 16 | View enrolled employees table | Name, method, quality score, date shown |
| 17 | Delete enrollment | is_active = false, removed from table |
| 18 | Audit log: BIOMETRIC_FACE_ENROLLED | Audit entry created |

### Phase 3: Face Verification

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 19 | Verify with matching face | Result: matched=true, confidence score |
| 20 | Verify with non-matching face | Result: matched=false, no_match |
| 21 | Verify with liveness check enabled | Liveness validated |
| 22 | Spoofing attempt detected | Result: spoofing_detected |

### Phase 4: QR Code Attendance

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 23 | Navigate to `/biometrics/qr` | QR code card displayed |
| 24 | Auto-generate QR code | Code format: EMP-{orgId}-{userId}-{uuid} |
| 25 | QR type badge (Rotating/Static) | Correct type from settings |
| 26 | Countdown timer for rotating QR | Timer shows remaining seconds |
| 27 | Timer turns red < 30 seconds | Visual warning |
| 28 | Auto-refresh after expiry | New QR generated automatically |
| 29 | Manual refresh button | New QR generated on click |
| 30 | Scan valid QR code | Returns valid=true with user info |
| 31 | Scan expired QR code | Returns valid=false |
| 32 | Scan QR from different org | Returns valid=false |
| 33 | Quick Check-In button | Attendance check-in via QR |
| 34 | Quick Check-Out button | Attendance check-out via QR |

### Phase 5: Biometric Check-In/Check-Out

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 35 | Check-in via face method | Biometric log + attendance record created |
| 36 | Check-in via QR method | QR validated, attendance synced |
| 37 | Check-in via selfie method | Selfie + optional liveness check |
| 38 | Check-in via fingerprint | Fingerprint validated |
| 39 | Check-out via any method | Check-out recorded, worked minutes calculated |
| 40 | Failed check-in logged | Biometric log with result=failed, no attendance |
| 41 | Geo-location captured (if selfie_geo_required) | Lat/lng stored in log |
| 42 | Attendance sync failure | Biometric log saved with sync_error |

### Phase 6: Device Management (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 43 | Navigate to `/biometrics/devices` | Device grid loads |
| 44 | Register new device | Name, type, serial, IP, location saved |
| 45 | API key displayed on creation | One-time display, never shown again |
| 46 | Device types: face_terminal, fingerprint_reader, qr_scanner, multi | All types accepted |
| 47 | View device card | Name, type, status badge, serial, IP, location |
| 48 | Device heartbeat updates status | Status → online, last_heartbeat updated |
| 49 | Offline device (no heartbeat) | Status badge shows "Offline" |
| 50 | Decommission device | is_active=false, status=offline |
| 51 | Audit: BIOMETRIC_DEVICE_REGISTERED | Entry created |
| 52 | Audit: BIOMETRIC_DEVICE_DECOMMISSIONED | Entry created |

### Phase 7: Biometric Settings (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 53 | Navigate to `/biometrics/settings` | 3 settings sections load |
| 54 | Face Match Threshold slider (0.0-1.0) | Default: 0.75, persists on save |
| 55 | Liveness Detection toggle | Default: true |
| 56 | GPS Required for Selfie toggle | Default: true |
| 57 | Geo-fence Radius (10-50000m) | Default: 200m |
| 58 | QR Type: Rotating vs Static | Dropdown selection |
| 59 | Rotation Interval (1-1440 min) | Only shown for Rotating type |
| 60 | Save settings | All values persist |
| 61 | Settings auto-initialize for new org | Defaults created on first access |

### Phase 8: Biometric Logs (HR Only)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 62 | Navigate to `/biometrics/logs` | Log table loads |
| 63 | Filter by method (Face/QR/Selfie/Fingerprint) | Filtered results |
| 64 | Filter by result (Success/Failed/Spoofing/No Match) | Filtered results |
| 65 | Filter by date range | Date-bounded results |
| 66 | Clear filters | Reset to all logs |
| 67 | Log columns: Employee, Method, Type, Result, Confidence, Liveness, Synced, Time | All visible |
| 68 | Pagination (20/page) | Navigation works |
| 69 | Result badges color-coded | Success=green, Failed=red, Spoofing=orange, No Match=yellow |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/biometrics/face/enroll` | POST | Face enrollment |
| `/api/v1/biometrics/face/enrollments` | GET | List enrollments |
| `/api/v1/biometrics/face/enrollments/:id` | DELETE | Remove enrollment |
| `/api/v1/biometrics/face/verify` | POST | Verify face |
| `/api/v1/biometrics/qr/generate` | POST | Generate QR |
| `/api/v1/biometrics/qr/my-code` | GET | Get own QR |
| `/api/v1/biometrics/qr/scan` | POST | Validate QR scan |
| `/api/v1/biometrics/check-in` | POST | Biometric check-in |
| `/api/v1/biometrics/check-out` | POST | Biometric check-out |
| `/api/v1/biometrics/devices` | GET/POST | List/Register devices |
| `/api/v1/biometrics/devices/:id` | PUT/DELETE | Update/Decommission |
| `/api/v1/biometrics/devices/:id/heartbeat` | POST | Device heartbeat (API key auth) |
| `/api/v1/biometrics/settings` | GET/PUT | Get/Update settings |
| `/api/v1/biometrics/logs` | GET | Biometric logs |
| `/api/v1/biometrics/dashboard` | GET | Dashboard stats |

## Biometric Methods

| Method | Auth | Liveness | Geo | Use Case |
|--------|------|----------|-----|----------|
| face | Face encoding | Optional | No | Terminal-based |
| fingerprint | Fingerprint scan | N/A | No | Reader-based |
| qr | QR code | N/A | No | Phone/scanner |
| selfie | Face photo | Optional | Optional | Mobile self-service |

## Device Types

`face_terminal` | `fingerprint_reader` | `qr_scanner` | `multi`

## Log Result Values

`success` | `failed` | `spoofing_detected` | `no_match`
