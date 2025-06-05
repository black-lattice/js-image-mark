<script setup>
import { ref, onMounted, computed, useTemplateRef } from 'vue';
// 画布引用
const canvas = ref(null);
let ctx = null;
let originalImage = null;

// 状态变量
const cannyEdit = ref(false);
const mode = ref('freehand');
const selectedContourIndex = ref(-1);
const draggingIndex = ref(-1);
const isDragging = ref(false);

const isDrawing = ref(false);
const points = ref([]);
const selectedContour = ref(null);
const cvReady = ref(true);

// 控制参数
const anchorColor = ref('#ff9900');
const fillColor = ref('#ff6b6b');
const strokeColor = ref('#ff0000');
const strokeWidth = ref(1);
const fillOpacity = ref(60);

// Canny参数
const lowThreshold = ref(50);
const highThreshold = ref(150);
const kernelSize = ref(5);
const sigma = ref(1.4);

const detectedContours = ref([]);

// 初始化
onMounted(() => {
  ctx = canvas.value.getContext('2d');
  // loadSampleImage();
  // 设置OpenCV加载回调
  if (window.cv) {
    cvReady.value = true;
  }
  eventListener();
});
// 定义事件映射，方便管理添加和移除的事件
const eventMap = {
  trueEdit: [
    { type: 'dblclick', handler: handleCannyDoubleClick },
    { type: 'mousedown', handler: startDragging },
    { type: 'mousemove', handler: dragPoint },
    { type: 'mouseup', handler: stopDragging },
  ],
  falseEdit: [
    { type: 'mousedown', handler: startDrawing },
    { type: 'mousemove', handler: draw },
    { type: 'mouseup', handler: endDrawing },
    { type: 'dblclick', handler: closePolygon },
    { type: 'click', handler: handleCannyClick },
  ],
};

function eventListener() {
  const canvasElement = canvas.value;
  if (!canvasElement) return;
  let add = cannyEdit.value ? eventMap.trueEdit : eventMap.falseEdit;
  let remove = cannyEdit.value ? eventMap.falseEdit : eventMap.trueEdit;
  // 移除事件监听
  remove.forEach(({ type, handler }) => {
    canvasElement.removeEventListener(type, handler);
  });
  // 添加事件监听
  add.forEach(({ type, handler }) => {
    canvasElement.addEventListener(type, handler);
  });
}

function setMode(newMode) {
  mode.value = newMode;
  points.value = [];
  resetDrawing();
  mode.value === 'canny' && detectEdges();
  resetCanvas();
}

function handleCannyEdit() {
  cannyEdit.value = !cannyEdit.value;
  drawDetectedContours();
  eventListener();
}

const cannyEditName = computed(() => {
  return cannyEdit.value ? '关闭canny编辑' : '开启canny编辑';
});
// 新增处理图片上传的函数
function handleImageUpload(e) {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = function (event) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = event.target.result;
    img.onload = function () {
      try {
        // 自动适配图片尺寸
        canvas.value.width = img.naturalWidth;
        canvas.value.height = img.naturalHeight;
        canvas.value.style.display = 'block';
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
        originalImage = new Image();
        originalImage.src = canvas.value.toDataURL();
      } catch (error) {
        console.error('图片加载失败:', error);
      }
    };
  };
  reader.readAsDataURL(file);
}
const imUp = useTemplateRef('imageUpload');
function chooseImage() {
  imUp.value.click();
}
// 提取公共函数，用于获取鼠标在画布上的坐标
function getCanvasCoordinates(e, canvas) {
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

// 提取公共函数，用于绘制锚点
function drawAnchorPoint(ctx, x, y, fillStyle = 'rgba(255,0,0,0.8)') {
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function startDrawing(e) {
  if (mode.value === 'canny') return;

  const { x, y } = getCanvasCoordinates(e, canvas.value);

  if (mode.value === 'polygon' && isDrawing.value && points.value.length > 0) {
    points.value.push({ x, y });
    // 绘制新点
    drawAnchorPoint(ctx, x, y);
    // 绘制预览线
    redrawSelection();
    return;
  }

  resetDrawing();
  isDrawing.value = true;
  points.value.push({ x, y });

  // 多边形模式需要单独绘制起点
  if (mode.value === 'polygon') {
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawAnchorPoint(ctx, x, y);
  }
}
// 绘制过程
function draw(e) {
  // 若未在绘制状态或当前模式为 Canny，则直接返回
  if (!isDrawing.value || mode.value === 'canny') return;

  // 获取鼠标在画布上的坐标
  const { x, y, scaleX, scaleY } = getCanvasCoordinates(e, canvas.value);

  // 处理拖拽点移动功能
  if (cannyEdit.value && draggingIndex.value !== -1) {
    points.value[draggingIndex.value] = { x: x * scaleX, y: y * scaleY };
    redrawSelection();
    return;
  }

  // 根据不同模式进行绘制
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

// 自由索套模式绘制函数
function drawFreehand(x, y) {
  ctx.beginPath();
  ctx.moveTo(points.value[points.value.length - 1].x, points.value[points.value.length - 1].y);
  ctx.lineTo(x, y);
  ctx.strokeStyle = strokeColor.value;
  ctx.lineWidth = strokeWidth.value;
  ctx.stroke();

  points.value.push({ x, y });
}

// 多边形模式绘制函数
function drawPolygon(x, y) {
  // 清除临时绘制
  resetCanvas(false);

  // 绘制已有路径
  drawExistingPolygon();

  // 绘制预览线
  ctx.beginPath();
  ctx.moveTo(points.value[0].x, points.value[0].y);
  for (let i = 1; i < points.value.length; i++) {
    ctx.lineTo(points.value[i].x, points.value[i].y);
  }
  ctx.lineTo(x, y);
  ctx.strokeStyle = strokeColor.value;
  ctx.lineWidth = strokeWidth.value;
  ctx.stroke();
}

// 结束绘制（自由索套模式）
function endDrawing() {
  if (mode.value === 'freehand' && isDrawing.value) {
    isDrawing.value = false;
  }
}

// 闭合多边形（多边形模式）
function closePolygon() {
  // 若处于 Canny 编辑模式，直接返回
  if (cannyEdit.value) return;
  // 检查当前模式是否为多边形模式且点数大于 2
  if (mode.value === 'polygon' && points.value.length > 2) {
    // 结束绘制状态
    isDrawing.value = false;
    drawClosedPath(ctx, points.value, strokeColor.value, strokeWidth.value);
    applyFill();
  }
}

// 提取绘制闭合路径的公共函数
function drawClosedPath(ctx, points, strokeColor, strokeWidth, stroke = true, close = true) {
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

// 辅助函数：绘制已存在的多边形锚点
function drawExistingPolygon() {
  const polygonPoints = points.value;
  // 绘制所有锚点
  if (polygonPoints.length > 0) {
    polygonPoints.forEach((point) => {
      drawAnchorPoint(ctx, point.x, point.y, anchorColor);
    });
  }
  // 绘制多边形路径
  if (polygonPoints.length > 1) {
    drawClosedPath(ctx, polygonPoints, strokeColor.value, strokeWidth.value, true, false);
  }
}

// 重置绘图状态
function resetDrawing() {
  points.value = [];
  isDrawing.value = false;
  selectedContour.value = null;
}

// 重置整个画布
function resetCanvas(reset = true) {
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
  ctx.drawImage(originalImage, 0, 0);
  reset && resetDrawing();
}

// 重新绘制选区（颜色/粗细改变时）
function redrawSelection() {
  // 检查点数是否大于 0，若不满足则直接返回
  if (points.value.length === 0) return;
  // 清除画布并重新绘制原始图像
  resetCanvas(false);
  // 根据不同模式绘制选区
  if (mode.value === 'polygon') {
    drawExistingPolygon();
  } else {
    drawClosedPath(ctx, points.value, strokeColor.value, strokeWidth.value);
  }
}
// 新增：Canny边缘检测功能
function detectEdges() {
  if (!cvReady.value) return;

  // 定义辅助函数，用于释放多个OpenCV对象
  const releaseMatObjects = (...mats) => {
    mats.forEach((mat) => {
      if (mat && mat.delete) {
        mat.delete();
      }
    });
  };

  let src, gray, blurred, thresh, edges, kernel, hierarchy, contours;
  try {
    // 获取图像数据
    const imageData = ctx.getImageData(0, 0, canvas.value.width, canvas.value.height);
    src = cv.matFromImageData(imageData);

    // 转换为灰度图
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // 高斯模糊降噪（增强降噪效果）
    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(kernelSize.value, kernelSize.value), sigma.value);

    // 自适应阈值处理（提高边缘连续性）
    thresh = new cv.Mat();
    cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);

    // Canny边缘检测
    edges = new cv.Mat();
    cv.Canny(blurred, edges, lowThreshold.value, highThreshold.value);

    // 形态学闭操作（填充轮廓内部空洞）
    kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);

    // 查找轮廓
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

    // 保存检测到的轮廓
    detectedContours.value = [];
    const contourCount = contours.size();
    for (let i = 0; i < contourCount; i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);

      // 过滤掉太小的轮廓
      if (area > 10) {
        // 简化轮廓
        const approx = new cv.Mat();
        const epsilon = 0.01 * cv.arcLength(cnt, true); // 提高轮廓近似精度
        cv.approxPolyDP(cnt, approx, epsilon, true);

        // 转换为JS数组
        const points = [];
        const rows = approx.rows;
        const data = approx.data32S;
        for (let j = 0; j < rows; j++) {
          const start = j * 2;
          points.push({ x: data[start], y: data[start + 1] });
        }

        detectedContours.value.push(points);
        approx.delete();
      }
      cnt.delete();
    }

    // 绘制检测到的轮廓
    drawDetectedContours();
  } catch (error) {
    console.error('边缘检测失败:', error);
  } finally {
    // 释放内存
    releaseMatObjects(src, gray, blurred, thresh, edges, kernel, hierarchy, contours);
  }
}

// 新增：绘制检测到的轮廓
function drawDetectedContours() {
  // 检查画布和原始图像是否存在，避免空指针异常
  if (!canvas.value || !originalImage) return;
  // 清除画布并重新绘制原始图像
  resetCanvas(false);

  // 根据当前模式获取对应的轮廓点集
  const contour = getCurrentContour();
  // 若轮廓点集为空，则直接返回
  if (!Array.isArray(contour) || contour.length === 0) return;
  // 绘制轮廓路径
  drawClosedPath(ctx, contour, strokeColor.value, strokeWidth.value);
  // 设置样式并填充、描边轮廓
  ctx.fillStyle = hexToRgba(fillColor.value, fillOpacity.value / 100);
  ctx.lineCap = 'round';
  ctx.fill();

  // 绘制可拖拽控制点
  if (cannyEdit.value) {
    contour.forEach((point) => drawAnchorPoint(ctx, point.x, point.y, anchorColor.value));
  }
}
// 修改startDragging函数
function startDragging(e) {
  // 若不在 Canny 编辑模式，直接返回
  if (!cannyEdit.value) return;

  // 添加右键事件监听
  canvas.value.addEventListener('contextmenu', handleRightClick);

  // 获取当前模式对应的轮廓点集
  const contour = getCurrentContour();
  // 若轮廓点集为空，则直接返回
  if (!Array.isArray(contour) || contour.length === 0) return;
  // 提取获取鼠标在画布上坐标的逻辑到公共函数
  const { x, y } = getCanvasCoordinates(e, canvas.value);

  // 查找最近的控制点
  draggingIndex.value = findNearestControlPoint(contour, x, y);

  if (draggingIndex.value !== -1) {
    isDragging.value = true;
    canvas.value.style.cursor = 'grabbing';
  }
}

// 提取获取当前轮廓的逻辑到单独函数
function getCurrentContour() {
  return mode.value !== 'canny' ? points.value : detectedContours.value[selectedContourIndex.value];
}

// 提取查找最近控制点的逻辑到单独函数
function findNearestControlPoint(contour, x, y) {
  const threshold = 10;
  return contour.findIndex((point) => {
    return Math.abs(point.x - x) < threshold && Math.abs(point.y - y) < threshold;
  });
}

// 优化思路：提取公共函数，减少重复代码，提高代码可读性和可维护性
function dragPoint(e) {
  if (!isDragging.value || !cannyEdit.value) return;
  const contour = getCurrentContour();
  // 若轮廓点集为空，则直接返回
  if (!Array.isArray(contour) || contour.length === 0) return;
  const { x, y, scaleX, scaleY } = getCanvasCoordinates(e, canvas.value);
  // 更新控制点位置
  contour[draggingIndex.value] = { x: x * scaleX, y: y * scaleY };
  // 在下一帧请求重绘检测到的轮廓
  requestAnimationFrame(drawDetectedContours);
}

// 新增右键删除处理
function handleRightClick(e) {
  e.preventDefault();
  // 若不在 Canny 编辑模式，直接返回
  if (!cannyEdit.value) return;
  const contour = getCurrentContour();
  // 若轮廓点集为空，则直接返回
  if (!Array.isArray(contour) || contour.length === 0) return;
  const { x, y } = getCanvasCoordinates(e, canvas.value);
  const pointIndex = findNearestControlPoint(contour, x, y);
  // 检查是否找到可删除的点且轮廓点数足够
  if (pointIndex !== -1 && contour.length > 3) {
    // 删除找到的控制点
    contour.splice(pointIndex, 1);
    // 重绘检测到的轮廓
    drawDetectedContours();
  }
}

// 修改stopDragging函数
function stopDragging() {
  // 移除右键监听
  canvas.value.removeEventListener('contextmenu', handleRightClick);
  isDragging.value = false;
  draggingIndex.value = -1;
  canvas.value.style.cursor = 'default';
  canvas.value.addEventListener('click', handleCannyClick);
}

function handleCannyDoubleClick(e) {
  // 若不在 Canny 编辑模式，直接返回
  if (!cannyEdit.value) return;

  // 获取当前轮廓
  const contour = getCurrentContour();
  // 若轮廓点集为空，则直接返回
  if (!Array.isArray(contour) || contour.length === 0) return;
  // 获取鼠标在画布上的坐标
  const { x, y } = getCanvasCoordinates(e, canvas.value);

  // 查找最近边并插入新点
  const { minDist, insertIndex } = findNearestEdge(contour, x, y);

  if (insertIndex !== -1 && minDist < 10) {
    contour.splice(insertIndex, 0, { x, y });
    requestAnimationFrame(drawDetectedContours); // 使用 requestAnimationFrame 优化重绘
  }
}

// 提取查找最近边的逻辑到单独函数
function findNearestEdge(contour, x, y) {
  let minDist = Infinity;
  let insertIndex = -1;

  for (let i = 0; i < contour.length; i++) {
    const p1 = contour[i];
    const p2 = contour[(i + 1) % contour.length];
    const dist = pointToLineDistance({ x, y }, p1, p2);
    if (dist < minDist) {
      minDist = dist;
      insertIndex = i + 1;
    }
  }
  return { minDist, insertIndex };
}

// 优化点到直线距离计算函数，减少重复计算，提高性能
function pointToLineDistance(p, a, b) {
  const dy = b.y - a.y;
  const dx = b.x - a.x;
  const numerator = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x);
  const denominator = Math.sqrt(dy * dy + dx * dx);
  return numerator / denominator;
}

// 新增：处理Canny模式下的点击事件
function handleCannyClick(e) {
  // 提前返回条件检查，若不满足条件则直接退出函数
  if (mode.value !== 'canny' || !detectedContours.value?.length || cannyEdit.value) {
    return;
  }
  // 提取获取画布坐标的逻辑到公共函数
  const { x, y } = getCanvasCoordinates(e, canvas.value);
  let selectedIndex = -1;
  // 检查点击位置是否在某个轮廓内
  for (let i = 0; i < detectedContours.value.length; i++) {
    if (isPointInPolygon({ x, y }, detectedContours.value[i])) {
      selectedIndex = i;
      break;
    }
  }
  // 更新选中轮廓索引
  selectedContourIndex.value = selectedIndex;
  // 重绘检测到的轮廓
  drawDetectedContours();
}

/**
 * 判断一个点是否在多边形内部。
 * 该方法使用射线法（Ray Casting Algorithm）来判断点是否在多边形内部。
 * 射线法的原理是从待判断的点出发，向水平方向发射一条射线，统计该射线与多边形边的交点个数。
 * 如果交点个数为奇数，则点在多边形内部；如果交点个数为偶数，则点在多边形外部。
 *
 * @param {Object} point - 待判断的点，包含 x 和 y 坐标属性。
 * @param {Array<Object>} polygon - 多边形的顶点数组，每个顶点是一个包含 x 和 y 坐标属性的对象。
 * @returns {boolean} - 如果点在多边形内部返回 true，否则返回 false。
 */
function isPointInPolygon(point, polygon) {
  // 若多边形点数少于 3 个，无法构成多边形，直接返回 false
  if (polygon.length < 3) {
    return false;
  }
  // 初始化结果变量，用于记录点是否在多边形内部
  let inside = false;
  // 解构出待判断点的 x 和 y 坐标
  const { x: pointX, y: pointY } = point;
  // 遍历多边形的每一条边
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    // 解构出当前边的起点坐标
    const { x: xi, y: yi } = polygon[i];
    // 解构出当前边的终点坐标
    const { x: xj, y: yj } = polygon[j];
    // 判断射线与当前边在 y 轴方向上是否相交
    const yCondition = yi > pointY !== yj > pointY;
    // 计算当前边的斜率
    const slope = (xj - xi) / (yj - yi);
    // 判断射线与当前边在 x 轴方向上是否相交
    const xCondition = pointX < slope * (pointY - yi) + xi;
    // 综合 y 轴和 x 轴的判断结果，确定射线是否与当前边相交
    const intersect = yCondition && xCondition;
    // 如果射线与当前边相交，则取反 inside 的值
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

// 修改：统一的应用填充函数
function applyFill() {
  const contour = getCurrentContour();
  // 若轮廓点集为空，则直接返回
  if (!Array.isArray(contour) || contour.length === 0) return;
  // 创建离屏canvas处理选区
  const offscreen = document.createElement('canvas');
  offscreen.width = canvas.value.width;
  offscreen.height = canvas.value.height;
  const offCtx = offscreen.getContext('2d');

  // 绘制选区路径并填充
  drawClosedPath(offCtx, contour, '', '', false);
  const opacity = parseInt(fillOpacity.value) / 100;
  offCtx.fillStyle = hexToRgba(fillColor.value, opacity);
  offCtx.fill();

  // 合成到主画布
  ctx.globalCompositeOperation = 'source-atop';
  ctx.drawImage(offscreen, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  // 绘制轮廓
  drawClosedPath(ctx, contour, strokeColor.value, strokeWidth.value);
}

// 辅助函数：十六进制颜色转RGBA
function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
</script>
<template>
  <div class="canvas-section">
    <div class="toolbar">
      <input type="file" ref="imageUpload" accept="image/*" style="display: none" @change="handleImageUpload" />
      <button key="uploadImage" @click="chooseImage" class="btn">上传图片</button>

      <button key="freehand" @click="setMode('freehand')" :class="['btn', { 'btn-active': mode === 'freehand' }]">自由索套</button>
      <button key="polygon" @click="setMode('polygon')" :class="['btn', { 'btn-active': mode === 'polygon' }]">多边形索套</button>
      <button key="canny" @click="setMode('canny')" :class="['btn', { 'btn-active': mode === 'canny' }]">边缘检测</button>
      <button key="cannyEdit" @click="handleCannyEdit" :class="['btn', !cannyEdit ? 'btn-don' : 'btn-reset']">{{ cannyEditName }}</button>
      <button key="applyFill" @click="applyFill" class="btn btn-done">完成选区</button>
      <button key="resetCanvas" @click="resetCanvas" class="btn btn-reset">重置画布</button>
    </div>
    <div class="canvas-container">
      <canvas ref="canvas"></canvas>
    </div>
  </div>
</template>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
body {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}
.canvas-section {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
}
.canvas-container {
  width: 1000px;
  flex: 1;
  margin: 0 auto;
  overflow: auto;
}
.toolbar {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
  margin: 20px 0;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 10px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
}
.btn {
  padding: 12px 20px;
  border: none;
  border-radius: 8px;
  background: #3498db;
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 6px rgba(52, 152, 219, 0.3);
}
.btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 8px rgba(52, 152, 219, 0.4);
}
.btn:active {
  transform: translateY(1px);
}
.btn-reset {
  background: #e74c3c;
  box-shadow: 0 4px 6px rgba(231, 76, 60, 0.3);
}
.btn-done {
  background: #2ecc71;
  box-shadow: 0 4px 6px rgba(46, 204, 113, 0.3);
}
</style>
