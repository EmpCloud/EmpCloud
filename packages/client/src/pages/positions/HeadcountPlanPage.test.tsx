import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import HeadcountPlanPage from "./HeadcountPlanPage";

const state = vi.hoisted(() => ({
  response: undefined as { data: Record<string, unknown>[]; meta: { page: number; per_page: number; total: number; total_pages: number } } | undefined,
}));
vi.mock("@/api/client", () => ({ default: {} }));
vi.mock("@/api/hooks", () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock("@/components/ui/Toast", () => ({ showToast: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: state.response, isLoading: false }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

describe("headcount plans", () => {
  beforeEach(() => { state.response = undefined; });

  it("shows the empty state when the organization has no plans", () => {
    state.response = { data: [], meta: { page: 1, per_page: 10, total: 0, total_pages: 0 } };
    const html = renderToStaticMarkup(<HeadcountPlanPage />);
    expect(html).toContain("positions.headcountPlans.noPlans");
    expect(html).not.toContain("dfghdfgh");
  });

  it("does not invent plans when requests return no data", () => {
    const html = renderToStaticMarkup(<HeadcountPlanPage />);
    expect(html).not.toContain("QA Draft Plan");
    expect(html).not.toContain("dfghdfgh");
  });

  it("offers the next page in the default grid view", () => {
    state.response = {
      data: [{ id: 1, title: "Engineering growth", fiscal_year: "2026-27", status: "draft", planned_headcount: 2 }],
      meta: { page: 1, per_page: 10, total: 11, total_pages: 2 },
    };
    const html = renderToStaticMarkup(<HeadcountPlanPage />);
    expect(html).toContain("Engineering growth");
    expect(html).toContain("positions.headcountPlans.next");
  });
});
