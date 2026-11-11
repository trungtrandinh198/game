import { permissions, rolePermissions, roles, userRoles } from "@dnw/db";
import type { Database } from "@dnw/db";
import { eq } from "drizzle-orm";

export interface Authorities {
  roles: string[];
  permissions: string[];
}

/** Vai trò và quyền của user từ `user_roles` và `role_permissions`. */
export async function loadAuthorities(db: Database, userId: string): Promise<Authorities> {
  const roleRows = await db
    .select({ code: roles.code })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  const permRows = await db
    .selectDistinct({ code: permissions.code })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));
  return {
    roles: roleRows.map((r) => r.code).sort(),
    permissions: permRows.map((p) => p.code).sort(),
  };
}
