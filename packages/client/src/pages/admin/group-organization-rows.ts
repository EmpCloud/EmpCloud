export type OrganizationIdentity = {
  key: string;
  id: string | number | null;
  name: string | null;
  email: string | null;
};

export type OrganizationRowGroup<T> = OrganizationIdentity & {
  rows: T[];
};

export function groupOrganizationRows<T>(
  rows: readonly T[],
  identify: (row: T) => OrganizationIdentity,
): OrganizationRowGroup<T>[] {
  const groups = new Map<string, OrganizationRowGroup<T>>();

  for (const row of rows) {
    const organization = identify(row);
    const existing = groups.get(organization.key);

    if (existing) {
      existing.rows.push(row);
      continue;
    }

    groups.set(organization.key, { ...organization, rows: [row] });
  }

  return Array.from(groups.values());
}
