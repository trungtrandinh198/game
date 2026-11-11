import { SandboxSim } from "./sim/SandboxSim";
import { InputManager } from "./input/InputManager";
import { StatsCollector } from "./stats";

export interface SandboxRuntime {
  sim: SandboxSim;
  input: InputManager;
  stats: StatsCollector;
  /** Thông tin render gần nhất (do scene cập nhật). */
  info: { calls: number; triangles: number; geometries: number; textures: number };
}

export function createRuntime(): SandboxRuntime {
  return {
    sim: new SandboxSim(),
    input: new InputManager(),
    stats: new StatsCollector(),
    info: { calls: 0, triangles: 0, geometries: 0, textures: 0 },
  };
}
