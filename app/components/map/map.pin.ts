const TERRON_PIN_ICON_ID = "terron-pin";

type MapWithImage = {
  hasImage(id: string): boolean;
  addImage(id: string, image: ImageData, options?: { pixelRatio?: number }): void;
};

function drawTerronPinToCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const s = size;
  ctx.clearRect(0, 0, s, s);

  const cx = s * 0.5;
  const cy = s * 0.42;
  const bodyR = s * 0.22;

  const grd = ctx.createRadialGradient(cx - bodyR * 0.3, cy - bodyR * 0.3, bodyR * 0.2, cx, cy, bodyR * 1.2);
  grd.addColorStop(0, "#f5d76e");
  grd.addColorStop(0.45, "#c9a227");
  grd.addColorStop(1, "#3d3208");

  ctx.beginPath();
  ctx.moveTo(cx, s * 0.88);
  ctx.bezierCurveTo(s * 0.18, s * 0.55, s * 0.18, s * 0.28, cx, cy - bodyR * 0.85);
  ctx.bezierCurveTo(s * 0.82, s * 0.28, s * 0.82, s * 0.55, cx, s * 0.88);
  ctx.closePath();
  ctx.fillStyle = grd;
  ctx.fill();

  ctx.strokeStyle = "rgba(255,248,220,0.55)";
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy - bodyR * 0.15, bodyR * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10,14,24,0.92)";
  ctx.fill();
  ctx.strokeStyle = "rgba(245,215,110,0.95)";
  ctx.lineWidth = Math.max(1, s * 0.035);
  ctx.stroke();

  return canvas;
}

/** Mapbox style yüklendikten hemen sonra çağrılmalı (symbol katmanından önce). */
export function registerTerronPinMapImage(map: MapWithImage) {
  if (typeof document === "undefined") return;
  if (map.hasImage(TERRON_PIN_ICON_ID)) return;
  const canvas = drawTerronPinToCanvas(128);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  map.addImage(TERRON_PIN_ICON_ID, imgData, { pixelRatio: 2 });
}
