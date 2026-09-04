export function getPaymentRestrictionDestination(user: { role: string }): string {
  return user.role === "org_admin" || user.role === "super_admin"
    ? "/billing"
    : "/payment-required";
}

export function isPaymentResolutionPage(pathname: string): boolean {
  return pathname === "/billing" || pathname === "/payment-required";
}
