import { Counter, Gauge, Histogram, Registry } from "@prometheus-io/client";

/** Chỉ số theo mục 8.12/8.13; mỗi server có registry riêng để test không dùng chung trạng thái. */
export function createMetrics() {
  const registry = new Registry();
  return {
    registry,
    rooms: new Gauge({ name: "dnw_rooms", help: "Số room đang chạy", registers: [registry] }),
    players: new Gauge({
      name: "dnw_players",
      help: "Số người chơi đang online",
      registers: [registry],
    }),
    vehicles: new Gauge({
      name: "dnw_vehicles_total",
      help: "Số xe trong các room",
      registers: [registry],
    }),
    vehiclesOccupied: new Gauge({
      name: "dnw_vehicles_occupied",
      help: "Số xe đang có người lái",
      registers: [registry],
    }),
    tickDuration: new Histogram({
      name: "dnw_tick_duration_ms",
      help: "Thời gian xử lý một tick mô phỏng (ms)",
      buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50],
      registers: [registry],
    }),
    droppedInputs: new Counter({
      name: "dnw_dropped_inputs_total",
      help: "Input bị bỏ do vượt tần suất hoặc hàng đợi đầy",
      registers: [registry],
    }),
    invalidMessages: new Counter({
      name: "dnw_invalid_messages_total",
      help: "Message sai schema hoặc không có handler",
      registers: [registry],
    }),
    reconnects: new Counter({
      name: "dnw_reconnects_total",
      help: "Số lần kết nối lại",
      registers: [registry],
    }),
    vehicleCollisions: new Counter({
      name: "dnw_vehicle_collisions_total",
      help: "Số lần xe va chạm vật cản",
      registers: [registry],
    }),
    mountRejected: new Counter({
      name: "dnw_vehicle_mount_rejected_total",
      help: "Số lần từ chối lên/xuống xe",
      registers: [registry],
    }),
  };
}

export type Metrics = ReturnType<typeof createMetrics>;
