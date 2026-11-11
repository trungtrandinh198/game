/** Vai trò, quyền và ánh xạ theo bảng ở mục 7.12. */
export const ROLE_DEFS = [
  { code: "player", name: "Người chơi" },
  { code: "moderator", name: "Điều hành viên" },
  { code: "content_editor", name: "Biên tập nội dung" },
  { code: "admin", name: "Quản trị viên" },
  { code: "super_admin", name: "Siêu quản trị" },
] as const;

export type RoleCode = (typeof ROLE_DEFS)[number]["code"];

export const PERMISSION_DEFS = [
  { code: "dashboard.read", description: "Xem bảng điều khiển" },
  { code: "users.read", description: "Xem người dùng" },
  { code: "users.status.update", description: "Đổi trạng thái người dùng" },
  { code: "users.roles.assign", description: "Gán vai trò" },
  { code: "moderation.act", description: "Kick, tạm khóa, cấm" },
  { code: "reports.read", description: "Xem báo cáo vi phạm" },
  { code: "reports.resolve", description: "Xử lý báo cáo vi phạm" },
  { code: "landmarks.read", description: "Xem địa danh" },
  { code: "landmarks.write", description: "Sửa địa danh" },
  { code: "landmarks.publish", description: "Xuất bản địa danh" },
  { code: "avatars.manage", description: "Quản lý nhân vật" },
  { code: "vehicles.manage", description: "Quản lý phương tiện" },
  { code: "rooms.read", description: "Xem room" },
  { code: "rooms.manage", description: "Drain/đóng room" },
  { code: "audit.read", description: "Xem nhật ký quản trị" },
] as const;

export type PermissionCode = (typeof PERMISSION_DEFS)[number]["code"];

const ALL = PERMISSION_DEFS.map((p) => p.code);

export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]> = {
  player: [],
  moderator: [
    "dashboard.read",
    "users.read",
    "moderation.act",
    "reports.read",
    "reports.resolve",
    "rooms.read",
  ],
  content_editor: ["dashboard.read", "landmarks.read", "landmarks.write", "landmarks.publish"],
  admin: ALL.filter((c) => c !== "users.roles.assign"),
  super_admin: ALL,
};

export const LANDMARK_CATEGORY_CODES = [
  "bridge",
  "market",
  "museum",
  "beach",
  "mountain",
  "park",
  "street",
] as const;
