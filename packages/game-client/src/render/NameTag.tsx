import { useEffect, useMemo } from "react";
import * as THREE from "three";

/** Tên trên đầu nhân vật: sprite vẽ từ canvas, không cần thư viện chữ 3D. */
export function NameTag({ name, color = "#ffffff" }: { name: string; color?: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "rgba(10, 14, 20, 0.6)";
      ctx.beginPath();
      ctx.roundRect(4, 8, 248, 48, 12);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.font = "600 28px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name.slice(0, 20), 128, 33);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [name, color]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite position={[0, 2.15, 0]} scale={[1.8, 0.45, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}
