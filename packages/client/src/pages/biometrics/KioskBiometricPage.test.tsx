import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import KioskBiometricPage from "./KioskBiometricPage";

vi.mock("@/lib/auth-store", () => ({ useAuthStore: () => undefined }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

it("does not show invented access events without an activity source", () => {
  const html = renderToStaticMarkup(<KioskBiometricPage />);
  expect(html).toContain("Access history is not available here.");
  expect(html).not.toContain("Today, 10:24 AM");
  expect(html).not.toContain("Factory Gate");
});
