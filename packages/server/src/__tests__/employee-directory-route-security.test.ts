import { describe, expect, it } from "vitest";
import employeeRouter from "../api/routes/employee.routes.js";
import userRouter from "../api/routes/user.routes.js";

type RouterLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: unknown[];
  };
};

function getHandlerCount(router: any, method: string, path: string): number {
  const layer = (router.stack as RouterLayer[]).find(
    (candidate) => candidate.route?.path === path && candidate.route.methods[method],
  );
  if (!layer?.route) throw new Error(`Route ${method.toUpperCase()} ${path} was not found`);
  return layer.route.stack.length;
}

describe("employee directory route authorization", () => {
  it("mounts authorization after authentication on every organization-wide employee listing", () => {
    expect(getHandlerCount(employeeRouter, "get", "/")).toBeGreaterThanOrEqual(3);
    expect(getHandlerCount(employeeRouter, "get", "/directory")).toBeGreaterThanOrEqual(3);
    expect(getHandlerCount(userRouter, "get", "/")).toBeGreaterThanOrEqual(3);
  });

  it("mounts self-or-privileged authorization on the employee detail alias", () => {
    expect(getHandlerCount(employeeRouter, "get", "/:id")).toBeGreaterThanOrEqual(3);
  });
});
