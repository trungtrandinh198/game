/** Quản lý input bàn phím, chuột và cảm ứng; không phụ thuộc React. */
export interface InputSnapshot {
  moveX: number;
  moveZ: number;
  run: boolean;
  handbrake: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class InputManager {
  /** Hướng nhìn: forward = (sin yaw, cos yaw). */
  cameraYaw = Math.PI / 2;
  cameraPitch = 0.35;
  /** Thời điểm (ms) người chơi xoay camera lần cuối, để camera tự bám xe khi không đụng vào. */
  lastLookAt = 0;
  sensitivity = 0.0035;
  invertY = false;

  private readonly keys = new Set<string>();
  private joystick = { x: 0, z: 0 };
  /** Input theo kịch bản (bench); khi đặt thì thay thế phím và joystick. */
  scripted: InputSnapshot | null = null;
  private touchRun = false;
  private touchHandbrake = false;
  private interactQueued = false;
  private dragging = false;
  private cleanup: (() => void) | null = null;

  attach(element: HTMLElement): void {
    this.detach();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "KeyF" || e.code === "KeyE") this.interactQueued = true;
      if (e.code === "Space") e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
    const onBlur = () => {
      this.keys.clear();
      this.dragging = false;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onBlur();
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button === 2) {
        this.dragging = true;
        element.setPointerCapture(e.pointerId);
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (this.dragging && e.pointerType === "mouse") this.look(e.movementX, e.movementY);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button === 2) this.dragging = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    element.addEventListener("contextmenu", onContextMenu);
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerUp);
    this.cleanup = () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      element.removeEventListener("contextmenu", onContextMenu);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
    };
  }

  detach(): void {
    this.cleanup?.();
    this.cleanup = null;
    this.keys.clear();
  }

  /** dx > 0 (kéo sang phải) quay góc nhìn sang phải, tức giảm yaw. */
  look(dx: number, dy: number): void {
    this.cameraYaw -= dx * this.sensitivity;
    this.cameraPitch = clamp(
      this.cameraPitch + (this.invertY ? -dy : dy) * this.sensitivity,
      0.08,
      1.2,
    );
    this.lastLookAt = performance.now();
  }

  setJoystick(x: number, z: number): void {
    this.joystick = { x: clamp(x, -1, 1), z: clamp(z, -1, 1) };
  }

  setRun(on: boolean): void {
    this.touchRun = on;
  }

  setHandbrake(on: boolean): void {
    this.touchHandbrake = on;
  }

  pressInteract(): void {
    this.interactQueued = true;
  }

  consumeInteract(): boolean {
    const queued = this.interactQueued;
    this.interactQueued = false;
    return queued;
  }

  snapshot(): InputSnapshot {
    if (this.scripted) return this.scripted;
    const k = this.keys;
    const keyX =
      (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) -
      (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    const keyZ =
      (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const moveX = clamp(keyX + this.joystick.x, -1, 1);
    const moveZ = clamp(keyZ + this.joystick.z, -1, 1);
    return {
      moveX,
      moveZ,
      run: k.has("ShiftLeft") || k.has("ShiftRight") || this.touchRun,
      handbrake: k.has("Space") || this.touchHandbrake,
    };
  }
}
