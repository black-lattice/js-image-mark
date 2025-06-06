import { ref } from 'vue';
import { Debounce } from '../utils/utils';
import EventBus from '../utils/eventbus';
import { getCanvasCoordinates, drawAnchorPoint, drawClosedPath, hexToRgba } from '../utils/canvasUtils';
const isDrawing = ref(false); // 是否正在绘制
const points = ref([]); // 存储绘制的点集

export function useCanvasDrawing(canvas, ctx, originalImage, mode, cannyEdit) {
  // 控制参数
  const controlPointColor = ref('#ff9900'); // 控制点的颜色
  const anchorColor = ref('#ff0000'); // 锚点颜色
  const fillColor = ref('#ff6b6b'); // 填充颜色
  const strokeColor = ref('#ff0000'); // 描边颜色
  const strokeWidth = ref(1); // 描边宽度
  const fillOpacity = ref(60); // 填充透明度

  /**
   * 开始绘制
   * @param {Event} e - 鼠标事件对象
   */
  function startDrawing(e) {
    if (mode.value === 'canny') return;
    !isDrawing.value && resetDrawing();
    isDrawing.value = true;
    const { x, y } = getCanvasCoordinates(e, canvas.value);
    points.value.push({ x, y });
    if (mode.value === 'polygon' && isDrawing.value) {
      drawExistingPolygon();
      return;
    }
  }

  /**
   * 绘制过程
   * @param {Event} e - 鼠标事件对象
   */
  function draw(e) {
    if (!isDrawing.value || mode.value === 'canny' || !points.value.length) return;
    const { x, y } = getCanvasCoordinates(e, canvas.value);
    switch (mode.value) {
      case 'freehand':
        drawFreehand(x, y);
        break;
      case 'polygon':
        drawPolygon(x, y);
        break;
      default:
        break;
    }
  }

  /**
   * 自由索套模式绘制
   * @param {number} x - 鼠标x坐标
   * @param {number} y - 鼠标y坐标
   */
  function drawFreehand(x, y) {
    ctx.value.beginPath();
    ctx.value.moveTo(points.value[points.value.length - 1].x, points.value[points.value.length - 1].y);
    ctx.value.lineTo(x, y);
    ctx.value.strokeStyle = strokeColor.value;
    ctx.value.lineWidth = strokeWidth.value;
    ctx.value.stroke();

    points.value.push({ x, y });
  }

  /**
   * 多边形模式绘制
   * @param {number} x - 鼠标x坐标
   * @param {number} y - 鼠标y坐标
   */
  function drawPolygon(x, y) {
    resetCanvas(false);
    drawExistingPolygon();

    ctx.value.beginPath();
    ctx.value.moveTo(points.value[0].x, points.value[0].y);
    for (let i = 1; i < points.value.length; i++) {
      ctx.value.lineTo(points.value[i].x, points.value[i].y);
    }
    ctx.value.lineTo(x, y);
    ctx.value.strokeStyle = strokeColor.value;
    ctx.value.lineWidth = strokeWidth.value;
    ctx.value.stroke();
  }

  /**
   * 结束绘制
   */
  function endDrawing() {
    if (mode.value === 'freehand' && isDrawing.value) {
      isDrawing.value = false;
    }
    EventBus.emit('recordState');
  }

  /**
   * 闭合多边形，并填充
   */
  function closePolygon() {
    if (mode.value === 'polygon' && points.value.length > 2) {
      isDrawing.value = false;
      drawAnchor();
      applyFill();
      EventBus.emit('recordState');
    }
  }

  /**
   * 绘制所有锚点和多边形路径，但是不闭合路径
   */
  function drawExistingPolygon() {
    const polygonPoints = points.value;
    drawAnchor();
    if (polygonPoints.length > 1) {
      drawClosedPath(ctx.value, polygonPoints, strokeColor.value, strokeWidth.value, true, false);
    }
  }

  /**
   * 重置绘制状态
   */
  function resetDrawing() {
    points.value = [];
    isDrawing.value = false;
  }

  /**
   * 重置画布
   * @param {boolean} reset - 是否重置绘制状态
   */
  function resetCanvas(reset = true) {
    if (!ctx.value || !canvas.value) return;
    ctx.value.clearRect(0, 0, canvas.value.width, canvas.value.height);
    ctx.value.drawImage(originalImage.value, 0, 0);
    reset && resetDrawing();
  }

  /**
   * 重绘选区
   * 根据当前模式重绘选区，包括多边形和自由索套模式
   */
  function redrawSelection() {
    if (points.value.length === 0) return;
    resetCanvas(false);
    if (mode.value === 'polygon' || cannyEdit.value) {
      drawAnchor();
    }
    applyFill();
  }
  /**
   * 编辑
   */
  function handleNonCannyEdit() {
    if (cannyEdit.value) {
      resetCanvas(false);
      drawAnchor();
      applyFill();
    } else {
      redrawSelection();
    }
  }
  // 绘制锚点
  function drawAnchor() {
    if (!canvas.value || !originalImage.value) return;
    let color = !cannyEdit.value ? anchorColor.value : controlPointColor.value;
    const contour = points.value;
    if (!Array.isArray(contour) || contour.length === 0) return;
    contour.forEach((point) => drawAnchorPoint(ctx.value, point.x, point.y, color));
  }
  /**
   * 应用填充,不绘制锚点
   * 使用离屏画布实现选区填充效果
   */
  function applyFill() {
    if (!Array.isArray(points.value) || points.value.length === 0) return;

    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.value.width;
    offscreen.height = canvas.value.height;
    const offCtx = offscreen.getContext('2d');

    drawClosedPath(offCtx, points.value, '', '', false);
    const opacity = parseInt(fillOpacity.value) / 100;
    offCtx.fillStyle = hexToRgba(fillColor.value, opacity);
    offCtx.fill();

    ctx.value.globalCompositeOperation = 'source-atop';
    ctx.value.drawImage(offscreen, 0, 0);
    ctx.value.globalCompositeOperation = 'source-over';

    drawClosedPath(ctx.value, points.value, strokeColor.value, strokeWidth.value);
  }
  // 绘制路径
  return {
    // mode,
    isDrawing,
    points,
    anchorColor,
    fillColor,
    strokeColor,
    strokeWidth,
    fillOpacity,
    startDrawing,
    draw,
    endDrawing,
    closePolygon: Debounce(closePolygon, 100),
    resetDrawing,
    resetCanvas,
    redrawSelection,
    applyFill,
    handleNonCannyEdit,
  };
}
