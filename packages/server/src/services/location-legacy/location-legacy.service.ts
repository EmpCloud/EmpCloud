import { getDB } from "../../db/connection.js";

interface DepartmentRow {
  location_id: number;
  department_id: number;
  name: string;
}

export interface LegacyLocationWithDepartments {
  location_id: number;
  location: string;
  timezone: string | null;
  department: Array<{ department_id: number; name: string }>;
}

export async function getLocationsDepartmentsByOrg(organizationId: number): Promise<{
  locations: LegacyLocationWithDepartments[];
  orgtimezone: string | null;
}> {
  const db = getDB();

  const [organization, locations, departments] = await Promise.all([
    db("organizations")
      .where({ id: organizationId, is_active: true })
      .select("timezone")
      .first(),
    db("organization_locations")
      .where({ organization_id: organizationId, is_active: true })
      .select("id", "name", "timezone")
      .orderBy("name", "asc"),
    db("users as u")
      .innerJoin("organization_departments as d", function () {
        this.on("d.id", "=", "u.department_id")
          .andOn("d.organization_id", "=", "u.organization_id");
      })
      .innerJoin("organization_locations as l", function () {
        this.on("l.id", "=", "u.location_id")
          .andOn("l.organization_id", "=", "u.organization_id");
      })
      .where("u.organization_id", organizationId)
      .andWhere("u.status", 1)
      .andWhere("d.is_deleted", false)
      .andWhere("l.is_active", true)
      .whereNotNull("u.location_id")
      .whereNotNull("u.department_id")
      .distinct("u.location_id", "d.id as department_id", "d.name")
      .orderBy("d.name", "asc") as Promise<DepartmentRow[]>,
  ]);

  const departmentsByLocation = new Map<number, Array<{ department_id: number; name: string }>>();
  for (const row of departments) {
    const existing = departmentsByLocation.get(Number(row.location_id)) ?? [];
    existing.push({ department_id: Number(row.department_id), name: row.name });
    departmentsByLocation.set(Number(row.location_id), existing);
  }

  return {
    locations: locations.map((location: { id: number; name: string; timezone: string | null }) => ({
      location_id: Number(location.id),
      location: location.name,
      timezone: location.timezone,
      department: departmentsByLocation.get(Number(location.id)) ?? [],
    })),
    orgtimezone: organization?.timezone ?? null,
  };
}
