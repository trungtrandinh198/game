import { displayNameSchema, normalizeDisplayName } from "@dnw/schemas";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./client";
import { hashPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password";
import { roles, userProfiles, userRoles, users } from "./schema";

const adminInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(255)),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  displayName: displayNameSchema,
});

export type AdminInput = z.input<typeof adminInput>;

export class AdminCreateError extends Error {}

/** Tạo tài khoản `super_admin` đã kích hoạt; không bao giờ ghi mật khẩu ra log. */
export async function createAdmin(db: Database, input: AdminInput): Promise<{ userId: string }> {
  const parsed = adminInput.safeParse(input);
  if (!parsed.success) {
    throw new AdminCreateError(
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  }
  const { email, password, displayName } = parsed.data;
  const passwordHash = await hashPassword(password);

  return db.transaction(async (tx) => {
    const [taken] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.email})`, email));
    if (taken) throw new AdminCreateError(`Email ${email} đã tồn tại`);

    const [role] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.code, "super_admin"));
    if (!role) throw new AdminCreateError("Chưa có vai trò super_admin; chạy pnpm db:seed trước");

    const now = new Date();
    const [user] = await tx
      .insert(users)
      .values({
        email,
        passwordHash,
        status: "active",
        emailVerifiedAt: now,
        termsAcceptedAt: now,
      })
      .returning({ id: users.id });
    if (!user) throw new AdminCreateError("Không tạo được người dùng");

    await tx
      .insert(userProfiles)
      .values({ userId: user.id, displayName, displayNameKey: normalizeDisplayName(displayName) });
    await tx.insert(userRoles).values({ userId: user.id, roleId: role.id });
    return { userId: user.id };
  });
}
