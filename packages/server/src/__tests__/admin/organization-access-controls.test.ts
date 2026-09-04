import { beforeEach, describe, expect, it, vi } from "vitest";

const first = vi.fn();
const update = vi.fn();
const insert = vi.fn();
const chain: any = {
  where: vi.fn(() => chain),
  select: vi.fn(() => chain),
  first,
  update,
  insert,
};
const db = vi.fn(() => chain);

vi.mock("../../db/connection.js", () => ({ getDB: () => db }));
vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  addOrgComment,
  updateOrganizationAccessControls,
} from "../../services/admin/org-admin.service.js";

describe("updateOrganizationAccessControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain.where.mockReturnValue(chain);
    chain.select.mockReturnValue(chain);
    chain.update.mockResolvedValue(1);
    chain.insert.mockResolvedValue([41]);
  });

  it("persists and returns both organization access switches", async () => {
    first
      .mockResolvedValueOnce({ id: 12, name: "Acme" })
      .mockResolvedValueOnce({ id: 12, login_blocked: 1, payment_block_enabled: 1 });

    const result = await updateOrganizationAccessControls({
      orgId: 12,
      loginBlocked: true,
      paymentBlockEnabled: true,
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      login_blocked: true,
      payment_block_enabled: true,
      updated_at: expect.any(Date),
    }));
    expect(result).toEqual({
      id: 12,
      login_blocked: true,
      payment_block_enabled: true,
    });
  });

  it("never allows the platform organization to be blocked", async () => {
    await expect(updateOrganizationAccessControls({ orgId: 0, loginBlocked: true }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(update).not.toHaveBeenCalled();
  });

  it("sanitizes organization comments before storing them", async () => {
    first
      .mockResolvedValueOnce({ id: 12, name: "Acme" })
      .mockResolvedValueOnce({ first_name: "Super", last_name: "Admin" })
      .mockResolvedValueOnce({ id: 41, comment: "Safe note" });

    await addOrgComment({
      orgId: 12,
      authorUserId: 1,
      comment: "<script>alert('xss')</script>Safe note",
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: 12,
      author_user_id: 1,
      comment: "Safe note",
    }));
  });
});
