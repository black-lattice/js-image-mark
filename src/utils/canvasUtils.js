// 获取鼠标在画布上的坐标
export function getCanvasCoordinates(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    width: rect.width,
    height: rect.height,
    scaleX: canvas.width / rect.width,
    scaleY: canvas.height / rect.height,
  };
}

// 绘制锚点
export function drawAnchorPoint(ctx, x, y, fillStyle = 'rgba(255,0,0,0.8)') {
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

// 绘制闭合路径
export function drawClosedPath(ctx, points, strokeColor, strokeWidth, stroke = true, close = true) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  close && ctx.closePath();
  if (stroke) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}

// 十六进制颜色转RGBA
export function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// 判断点是否在多边形内部
export function isPointInPolygon(point, polygon) {
  if (polygon.length < 3) {
    return false;
  }
  let inside = false;
  const { x: pointX, y: pointY } = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const { x: xi, y: yi } = polygon[i];
    const { x: xj, y: yj } = polygon[j];
    const yCondition = yi > pointY !== yj > pointY;
    const slope = (xj - xi) / (yj - yi);
    const xCondition = pointX < slope * (pointY - yi) + xi;
    const intersect = yCondition && xCondition;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

// 计算点到直线的距离
export function pointToLineDistance(p, a, b) {
  const dy = b.y - a.y;
  const dx = b.x - a.x;
  const numerator = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x);
  const denominator = Math.sqrt(dy * dy + dx * dx);
  return numerator / denominator;
} 