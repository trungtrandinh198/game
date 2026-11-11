import type { NoticeCode } from "@dnw/schemas";

/** Văn bản hiển thị của game; web truyền bản dịch theo ngôn ngữ, mặc định tiếng Việt. */
export interface GameLabels {
  notices: Partial<Record<NoticeCode, string>>;
  /** Mã đóng kết nối (4011...) -> thông báo. */
  closes: Record<number, string>;
  kinds: { bicycle: string; motorbike: string; car: string };
  mountPrompt: string; // chứa {kind}
  dismountPrompt: string;
  reconnecting: string;
  disconnected: string;
}

export const DEFAULT_LABELS: GameLabels = {
  notices: {
    VEHICLE_TOO_FAR: "Xe ở quá xa",
    VEHICLE_OCCUPIED: "Xe đã có người lái",
    VEHICLE_NOT_FOUND: "Không tìm thấy xe",
    VEHICLE_TOO_FAST: "Xe còn chạy nhanh, hãy giảm tốc để xuống",
    VEHICLE_NO_DISMOUNT_SPACE: "Không có chỗ để xuống xe",
    VEHICLE_COOLDOWN: "Thao tác quá nhanh",
    NOT_ON_FOOT: "Bạn đang lái xe",
    NOT_DRIVING: "Bạn không ở trên xe",
  },
  closes: {
    4011: "Bạn đã bị mời ra khỏi phòng",
    4012: "Tài khoản bị khóa",
    4013: "Tài khoản đăng nhập ở nơi khác",
    4014: "Phiên bản game không khớp, hãy tải lại trang",
    4015: "Gửi dữ liệu quá nhiều, đã bị ngắt kết nối",
    4016: "Máy chủ đang bảo trì",
  },
  kinds: { bicycle: "xe đạp", motorbike: "xe máy", car: "ô tô" },
  mountPrompt: "F: lên {kind}",
  dismountPrompt: "F: xuống xe",
  reconnecting: "Mất kết nối, đang kết nối lại...",
  disconnected: "Đã ngắt kết nối",
};
