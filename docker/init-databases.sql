-- =============================================================================
-- Initialize all EMP module databases on a single MySQL instance.
-- Each module gets its own database for isolation.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS `empcloud`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `emp_payroll`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `emp_billing`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Future modules — uncomment as they come online:
-- CREATE DATABASE IF NOT EXISTS `emp_monitor`
--   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CREATE DATABASE IF NOT EXISTS `emp_hrms`
--   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CREATE DATABASE IF NOT EXISTS `emp_attendance`
--   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CREATE DATABASE IF NOT EXISTS `emp_recruit`
--   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CREATE DATABASE IF NOT EXISTS `emp_field`
--   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CREATE DATABASE IF NOT EXISTS `emp_biometrics`
--   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CREATE DATABASE IF NOT EXISTS `emp_projects`
--   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CREATE DATABASE IF NOT EXISTS `emp_rewards`
--   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CREATE DATABASE IF NOT EXISTS `emp_performance`
--   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CREATE DATABASE IF NOT EXISTS `emp_exit`
--   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
