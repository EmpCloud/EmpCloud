import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === "users-module-map") {
      return {
        data: [{
          id: 1,
          first_name: "Ana",
          last_name: "García",
          email: "ana@example.com",
          role: "hr manager",
          designation: "Tech Lead",
          modules: [],
        }],
        isLoading: false,
      };
    }
    if (queryKey[0] === "org-subscriptions") {
      return { data: [{ module_id: 10, status: "active", used_seats: 0, total_seats: 10 }] };
    }
    return { data: [{ id: 10, slug: "emp-lms", name: "EMP LMS" }] };
  },
}));

vi.mock("react-i18next", () => ({
  Trans: () => null,
  useTranslation: () => ({
    t: (key: string) => ({
      "modulesAccess.title": "Acceso a módulos",
      "modulesAccess.subtitle": "Administra el acceso.",
      "modulesAccess.enableAll": "Habilitar para todos",
      "modulesAccess.disableAll": "Deshabilitar para todos",
      "modulesAccess.searchPlaceholder": "Buscar empleados",
      "modulesAccess.searchAriaLabel": "Buscar empleados",
      "modulesAccess.filterAriaLabel": "Filtrar empleados",
      "modulesAccess.allEmployees": "Todos los empleados",
      "modulesAccess.enabledFor": "Habilitado para",
      "modulesAccess.notEnabledFor": "No habilitado para",
      "modulesAccess.enabledSuffix": "Habilitado",
      "modulesAccess.notEnabledSuffix": "No habilitado",
      "modulesAccess.table.employee": "Empleado",
      "modulesAccess.table.role": "Rol",
      "modulesAccess.table.designation": "Cargo",
      "modulesAccess.table.modules": "Módulos",
      "modules.emp-lms.name": "Gestión de aprendizaje y capacitación",
      "roles.hr_manager": "Responsable de RR. HH.",
    } as Record<string, string>)[key] ?? key,
  }),
}));

vi.mock("@/api/client", () => ({ default: {} }));

import ModuleAccessPage from "./ModuleAccessPage";

describe("ModuleAccessPage localization", () => {
  it("renders localized module, role, and bulk action labels", () => {
    const html = renderToStaticMarkup(<ModuleAccessPage />);

    expect(html).toContain("Habilitar para todos");
    expect(html).toContain("Deshabilitar para todos");
    expect(html).toContain("Gestión de aprendizaje y capacitación");
    expect(html).toContain("Responsable de RR. HH.");
    expect(html).not.toContain("Enable All");
    expect(html).not.toContain("Disable All");
    expect(html).not.toContain("EMP LMS");
  });
});
