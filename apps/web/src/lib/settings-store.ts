"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SettingsState {
  cameraSensitivity: number;
  invertY: boolean;
  controlsHelpDismissed: boolean;
  set: (patch: Partial<Omit<SettingsState, "set">>) => void;
}

/** Cài đặt phía trình duyệt (T11 đọc để điều khiển camera). */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      cameraSensitivity: 1,
      invertY: false,
      controlsHelpDismissed: false,
      set: (patch) => set(patch),
    }),
    { name: "dnw-settings" },
  ),
);
