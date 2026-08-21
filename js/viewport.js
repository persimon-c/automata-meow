// viewport transform, the single conversion pair between automaton space and screen space
// screen = canvas * scale + translate
// every tool and hit test must go through these two functions, zoom never mutates state coords

export function createViewport() {
  return { scale: 1, tx: 0, ty: 0 };
}

export function toScreen(vp, x, y) {
  return { x: x * vp.scale + vp.tx, y: y * vp.scale + vp.ty };
}

export function toCanvas(vp, sx, sy) {
  return { x: (sx - vp.tx) / vp.scale, y: (sy - vp.ty) / vp.scale };
}

// pinch zoom keeps the canvas point under the finger midpoint pinned in place,
// so zooming feels like grabbing the paper rather than sliding it
export function applyPinch(vp, prevMid, prevDist, curMid, curDist) {
  const k = prevDist > 0 ? curDist / prevDist : 1;
  const ns = Math.min(6, Math.max(0.2, vp.scale * k));
  // keep the grabbed canvas point fixed under the moving midpoint
  const cx = (prevMid.x - vp.tx) / vp.scale;
  const cy = (prevMid.y - vp.ty) / vp.scale;
  vp.scale = ns;
  vp.tx = curMid.x - cx * ns;
  vp.ty = curMid.y - cy * ns;
}
