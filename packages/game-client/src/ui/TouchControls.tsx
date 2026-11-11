"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { InputManager } from "../input/InputManager";

export interface TouchControlsProps {
  input: InputManager;
  /** Trạng thái để hiện nút ngữ cảnh (đang lái xe, có xe trong tầm lên). */
  getStatus: () => { mounted: boolean; canMount: boolean };
}

const STICK_RADIUS = 56;

const button = {
  position: "absolute",
  zIndex: 6,
  minWidth: 64,
  height: 64,
  borderRadius: 32,
  border: "2px solid rgba(255,255,255,0.7)",
  background: "rgba(10,14,20,0.55)",
  color: "#fff",
  font: "600 13px system-ui, sans-serif",
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
} as const;

/** Joystick ảo, nút chạy/phanh tay/lên xe và vùng kéo xoay camera (mục 3.1, mobile). */
export function TouchControls({ input, getStatus }: TouchControlsProps) {
  const [enabled, setEnabled] = useState(false);
  const [stick, setStick] = useState<{ x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [canMount, setCanMount] = useState(false);
  const stickOrigin = useRef<{ id: number; x: number; y: number } | null>(null);
  const lookPointer = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    setEnabled(window.matchMedia?.("(pointer: coarse)").matches ?? false);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const status = getStatus();
      setMounted(status.mounted);
      setCanMount(status.canMount);
    }, 150);
    return () => window.clearInterval(id);
  }, [getStatus]);

  const onStickDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    stickOrigin.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setStick({ x: 0, y: 0 });
  }, []);

  const onStickMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const origin = stickOrigin.current;
      if (!origin || origin.id !== e.pointerId) return;
      let dx = e.clientX - origin.x;
      let dy = e.clientY - origin.y;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx = (dx / len) * STICK_RADIUS;
        dy = (dy / len) * STICK_RADIUS;
      }
      setStick({ x: dx, y: dy });
      input.setJoystick(dx / STICK_RADIUS, -dy / STICK_RADIUS);
    },
    [input],
  );

  const onStickUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (stickOrigin.current?.id !== e.pointerId) return;
      stickOrigin.current = null;
      setStick(null);
      input.setJoystick(0, 0);
    },
    [input],
  );

  const onLookDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lookPointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }, []);

  const onLookMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const p = lookPointer.current;
      if (!p || p.id !== e.pointerId) return;
      input.look((e.clientX - p.x) * 1.6, (e.clientY - p.y) * 1.6);
      lookPointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    },
    [input],
  );

  const onLookUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (lookPointer.current?.id === e.pointerId) lookPointer.current = null;
  }, []);

  if (!enabled) {
    return (
      <button
        type="button"
        style={{ position: "absolute", zIndex: 6, bottom: 8, left: 8, font: "12px system-ui" }}
        onClick={() => setEnabled(true)}
      >
        Bật điều khiển cảm ứng
      </button>
    );
  }

  const hold = (setter: (on: boolean) => void) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setter(true);
    },
    onPointerUp: () => setter(false),
    onPointerCancel: () => setter(false),
  });

  return (
    <>
      <div
        style={{
          position: "absolute",
          zIndex: 4,
          top: 0,
          right: 0,
          width: "50%",
          height: "100%",
          touchAction: "none",
        }}
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={onLookUp}
        onPointerCancel={onLookUp}
      />
      <div
        style={{
          position: "absolute",
          zIndex: 6,
          left: "max(24px, env(safe-area-inset-left))",
          bottom: "max(24px, env(safe-area-inset-bottom))",
          width: STICK_RADIUS * 2.6,
          height: STICK_RADIUS * 2.6,
          borderRadius: "50%",
          background: "rgba(10,14,20,0.35)",
          border: "2px solid rgba(255,255,255,0.5)",
          touchAction: "none",
        }}
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickUp}
        onPointerCancel={onStickUp}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 56,
            height: 56,
            marginLeft: -28 + (stick?.x ?? 0),
            marginTop: -28 + (stick?.y ?? 0),
            borderRadius: "50%",
            background: "rgba(255,255,255,0.75)",
          }}
        />
      </div>

      {!mounted && (
        <button
          type="button"
          style={{ ...button, right: "max(24px, env(safe-area-inset-right))", bottom: 110 }}
          {...hold((on) => input.setRun(on))}
        >
          Chạy
        </button>
      )}
      {mounted && (
        <button
          type="button"
          style={{ ...button, right: "max(24px, env(safe-area-inset-right))", bottom: 110 }}
          {...hold((on) => input.setHandbrake(on))}
        >
          Phanh tay
        </button>
      )}
      {(mounted || canMount) && (
        <button
          type="button"
          style={{
            ...button,
            right: "max(100px, env(safe-area-inset-right))",
            bottom: 40,
            minWidth: 88,
          }}
          onClick={() => input.pressInteract()}
        >
          {mounted ? "Xuống xe" : "Lên xe"}
        </button>
      )}
    </>
  );
}
