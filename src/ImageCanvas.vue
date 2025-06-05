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
const modeLabels = {
  freehand: '自由索套',
  polygon: '多边形索套',
  canny: 'Canny边缘检测',
};

const statusMessage = ref('准备绘制选区');
const isDrawing = ref(false);
const points = ref([]);
const selectedContour = ref(null);
const cvReady = ref(true);
const contours = ref([]);
const edgeImage = ref(null);

// 控制参数
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
function eventListener() {
  if (cannyEdit.value) {
    canvas.value.removeEventListener('mousedown', startDrawing);
    canvas.value.removeEventListener('mousemove', draw);
    canvas.value.removeEventListener('mouseup', endDrawing);
    canvas.value.removeEventListener('click', handleCannyClick);
  } else {
    // 添加事件监听
    canvas.value.addEventListener('mousedown', startDrawing);
    canvas.value.addEventListener('mousemove', draw);
    canvas.value.addEventListener('mouseup', endDrawing);
    canvas.value.addEventListener('dblclick', closePolygon);
    canvas.value.addEventListener('click', handleCannyClick);
    canvas.value.addEventListener('dblclick', handleCannyDoubleClick);
    canvas.value.addEventListener('mousedown', startDragging);
    canvas.value.addEventListener('mousemove', dragPoint);
    canvas.value.addEventListener('mouseup', stopDragging);
  }
}
const getImageUrl = (url) => {
  return new URL(url, import.meta.url).href;
};
// 加载示例图片
// 修改外部图片加载方式
function loadSampleImage() {
  const img = new Image();
  img.crossOrigin = 'Anonymous';
  img.src = imgUrl.value; //getImageUrl('./image-1.png');

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
      statusMessage.value = '图片加载失败，请检查控制台';
    }
  };

  img.onerror = function () {
    statusMessage.value = '图片加载失败，请检查URL有效性或CORS设置';
  };
}

function setMode(newMode) {
  mode.value = newMode;
  const ms = {
    freehand: '按住鼠标拖动绘制选区',
    polygon: '点击添加顶点，双击闭合选区',
    canny: 'Canny边缘检测',
  };
  statusMessage.textContent = ms[mode.value];
  points.value = [];
  resetDrawing();
  if (mode.value === 'canny') detectEdges();
  resetCanvas();
}

// 开始绘制
function startDrawing(e) {
  if (mode.value === 'canny') return;

  if (mode.value === 'polygon' && isDrawing.value && points.value.length > 0) {
    const rect = canvas.value.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    points.value.push({ x, y });

    // 绘制新点
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,0,0,0.8)';
    ctx.fill();

    // 绘制预览线
    redrawSelection();
    return;
  }
  resetDrawing();
  isDrawing.value = true;
  const rect = canvas.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // 多边形模式需要单独绘制起点
  if (mode.value === 'polygon') {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,0,0,0.8)';
    ctx.fill();
  }

  points.value.push({ x, y });
}

// 绘制过程
function draw(e) {
  if (!isDrawing.value || mode.value === 'canny') return;

  // 添加拖拽点移动功能
  if (cannyEdit.value && draggingIndex.value !== -1) {
    const rect = canvas.value.getBoundingClientRect();
    const scaleX = canvas.value.width / rect.width;
    const scaleY = canvas.value.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    points.value[draggingIndex.value] = { x, y };
    redrawSelection();
    return;
  }

  const rect = canvas.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // 自由索套模式实时绘制路径
  if (mode.value === 'freehand') {
    ctx.beginPath();
    ctx.moveTo(points.value[points.value.length - 1].x, points.value[points.value.length - 1].y);
    ctx.lineTo(x, y);
    ctx.strokeStyle = strokeColor.value;
    ctx.lineWidth = strokeWidth.value;
    ctx.stroke();

    points.value.push({ x, y });
  }
  // 多边形模式显示预览线
  else {
    // 清除临时绘制
    ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
    ctx.drawImage(originalImage, 0, 0);

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
}

// 结束绘制（自由索套模式）
function endDrawing() {
  if (mode.value === 'freehand' && isDrawing.value) {
    isDrawing.value = false;
    statusMessage.value = '点击"完成选区"应用填充效果';
  }
}

// 闭合多边形（多边形模式）
function closePolygon() {
  if (cannyEdit.value) return;
  if (mode.value === 'polygon' && points.value.length > 2) {
    isDrawing.value = false;
    // 添加路径闭合逻辑
    ctx.beginPath();
    ctx.moveTo(points.value[0].x, points.value[0].y);
    for (let i = 1; i < points.value.length; i++) {
      ctx.lineTo(points.value[i].x, points.value[i].y);
    }
    ctx.closePath();
    ctx.strokeStyle = strokeColor.value;
    ctx.lineWidth = strokeWidth.value;
    ctx.stroke();

    applyFill();
  }
}

// 应用填充效果
function canvasApplyFill() {
  if (points.value.length < 3 || mode.value === 'canny') return;

  // 创建离屏canvas处理选区
  const offscreen = document.createElement('canvas');
  offscreen.width = canvas.value.width;
  offscreen.height = canvas.value.height;
  const offCtx = offscreen.getContext('2d');

  // 绘制选区路径
  offCtx.beginPath();
  offCtx.moveTo(points.value[0].x, points.value[0].y);
  for (let i = 1; i < points.value.length; i++) {
    offCtx.lineTo(points.value[i].x, points.value[i].y);
  }
  offCtx.closePath();

  // 填充选区
  const opacity = parseInt(fillOpacity.value) / 100;
  offCtx.fillStyle = hexToRgba(fillColor.value, opacity);
  offCtx.fill();

  // 合成到主画布
  ctx.globalCompositeOperation = 'source-atop';
  ctx.drawImage(offscreen, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  // 绘制轮廓
  ctx.beginPath();
  ctx.moveTo(points.value[0].x, points.value[0].y);
  for (let i = 1; i < points.value.length; i++) {
    ctx.lineTo(points.value[i].x, points.value[i].y);
  }
  ctx.closePath();
  ctx.strokeStyle = strokeColor.value;
  ctx.lineWidth = strokeWidth.value;
  ctx.stroke();

  // resetDrawing();
}

// 辅助函数：绘制已存在的多边形锚点
function drawExistingPolygon() {
  points.value.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,0,0,0.8)';
    ctx.fill();
  });

  if (points.value.length > 1) {
    ctx.beginPath();
    ctx.moveTo(points.value[0].x, points.value[0].y);
    for (let i = 1; i < points.value.length; i++) {
      ctx.lineTo(points.value[i].x, points.value[i].y);
    }
    ctx.strokeStyle = strokeColor.value;
    ctx.lineWidth = strokeWidth.value;
    ctx.stroke();
  }
}

// 重置绘图状态
function resetDrawing() {
  points.value = [];
  isDrawing.value = false;
  selectedContour.value = null;
}

// 重置整个画布
function resetCanvas() {
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
  ctx.drawImage(originalImage, 0, 0);
  resetDrawing();
  statusMessage.value = '画布已重置! 可以开始新选区';
}

// 重新绘制选区（颜色/粗细改变时）
function redrawSelection() {
  if (points.value.length > 0) {
    ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
    ctx.drawImage(originalImage, 0, 0);

    if (mode.value === 'polygon') {
      drawExistingPolygon();
    } else {
      ctx.beginPath();
      ctx.moveTo(points.value[0].x, points.value[0].y);
      for (let i = 1; i < points.value.length; i++) {
        ctx.lineTo(points.value[i].x, points.value[i].y);
      }
      ctx.strokeStyle = strokeColor.value;
      ctx.lineWidth = strokeWidth.value;
      ctx.stroke();
    }
  }
}
// 新增：Canny边缘检测功能
function detectEdges() {
  if (!cvReady.value) {
    statusMessage.value = 'OpenCV.js尚未加载完成，请稍候...';
    return;
  }

  statusMessage.value = '正在执行边缘检测...';

  try {
    // 获取图像数据
    const imageData = ctx.getImageData(0, 0, canvas.value.width, canvas.value.height);
    const src = cv.matFromImageData(imageData);

    // 转换为灰度图
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // 高斯模糊降噪（增强降噪效果）
    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(kernelSize.value, kernelSize.value), sigma.value);

    // 自适应阈值处理（提高边缘连续性）
    const thresh = new cv.Mat();
    cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
    // Canny边缘检测
    const edges = new cv.Mat();
    cv.Canny(blurred, edges, lowThreshold.value, highThreshold.value);
    // 形态学闭操作（填充轮廓内部空洞）
    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);
    // 查找轮廓
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

    // 保存检测到的轮廓
    detectedContours.value = [];
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);

      // 过滤掉太小的轮廓
      if (area > 10) {
        // 降低面积阈值以保留更多轮廓
        // 简化轮廓
        const approx = new cv.Mat();
        const epsilon = 0.01 * cv.arcLength(cnt, true); // 提高轮廓近似精度
        cv.approxPolyDP(cnt, approx, epsilon, true);

        // 转换为JS数组
        const points = [];
        for (let j = 0; j < approx.rows; j++) {
          const point = approx.data32S.subarray(j * 2, j * 2 + 2);
          points.push({ x: point[0], y: point[1] });
        }

        detectedContours.value.push(points);
        approx.delete();
      }
      cnt.delete();
    }

    // 绘制检测到的轮廓
    drawDetectedContours();

    // 释放内存
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    hierarchy.delete();
    contours.delete();

    statusMessage.value = `检测到 ${detectedContours.value.length} 个轮廓`;
  } catch (error) {
    console.error('边缘检测失败:', error);
    statusMessage.value = '错误: ' + error.message;
  }
}

// 新增：绘制检测到的轮廓
function drawDetectedContours() {
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
  ctx.drawImage(originalImage, 0, 0);

  // if (selectedContourIndex.value !== -1) {
  const contour = mode.value !== 'canny' ? points.value : detectedContours.value[selectedContourIndex.value];
  ctx.beginPath();
  ctx.moveTo(contour[0].x, contour[0].y);

  for (let i = 1; i < contour.length; i++) {
    ctx.lineTo(contour[i].x, contour[i].y);
  }

  ctx.closePath();

  ctx.strokeStyle = strokeColor.value;
  ctx.lineWidth = strokeWidth.value;
  ctx.fillStyle = hexToRgba(fillColor.value, fillOpacity.value / 100);
  ctx.fill();
  ctx.lineCap = 'round';
  ctx.stroke();

  // 绘制可拖拽控制点
  if (cannyEdit.value) {
    ctx.fillStyle = '#ff9900';
    contour.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}
// 修改startDragging函数
function startDragging(e) {
  if (!cannyEdit.value) return;

  // 添加右键事件监听
  canvas.value.addEventListener('contextmenu', handleRightClick);

  // const contour = detectedContours.value[selectedContourIndex.value];
  const contour = mode.value !== 'canny' ? points.value : detectedContours.value[selectedContourIndex.value];
  const rect = canvas.value.getBoundingClientRect();
  const scaleX = canvas.value.width / rect.width;
  const scaleY = canvas.value.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  // 查找最近的控制点
  draggingIndex.value = contour.findIndex((point) => {
    return Math.abs(point.x - x) < 10 && Math.abs(point.y - y) < 10;
  });

  if (draggingIndex.value !== -1) {
    isDragging.value = true;
    canvas.value.style.cursor = 'grabbing';
  }
}

function dragPoint(e) {
  if (!isDragging.value || !cannyEdit.value) return;
  const contour = mode.value !== 'canny' ? points.value : detectedContours.value[selectedContourIndex.value];
  // const contour = detectedContours.value[selectedContourIndex.value];
  const rect = canvas.value.getBoundingClientRect();
  const scaleX = canvas.value.width / rect.width;
  const scaleY = canvas.value.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  contour[draggingIndex.value] = { x, y };
  requestAnimationFrame(drawDetectedContours);
}

// 新增右键删除处理
function handleRightClick(e) {
  e.preventDefault();
  if (!cannyEdit.value) return;
  const contour = mode.value !== 'canny' ? points.value : detectedContours.value[selectedContourIndex.value];
  // const contour = detectedContours.value[selectedContourIndex.value];
  const rect = canvas.value.getBoundingClientRect();
  const scaleX = canvas.value.width / rect.width;
  const scaleY = canvas.value.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  // 查找最近的控制点
  const pointIndex = contour.findIndex((point) => {
    return Math.abs(point.x - x) < 10 && Math.abs(point.y - y) < 10;
  });

  if (pointIndex !== -1 && contour.length > 3) {
    contour.splice(pointIndex, 1);
    drawDetectedContours();
    statusMessage.value = `已删除第 ${pointIndex + 1} 个控制点`;
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
  if (!cannyEdit.value) return;
  const contour = mode.value !== 'canny' ? points.value : detectedContours.value[selectedContourIndex.value];
  // const contour = detectedContours.value[selectedContourIndex.value];
  const rect = canvas.value.getBoundingClientRect();
  const scaleX = canvas.value.width / rect.width;
  const scaleY = canvas.value.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  // 查找最近边并插入新点
  let minDist = Infinity;
  let insertIndex = -1;

  for (let i = 0; i < contour.length; i++) {
    const p1 = contour[i];
    const p2 = contour[(i + 1) % contour.length];
    const dist = pointToLineDistance({ x, y }, p1, p2);
    if (dist < minDist && dist < 10) {
      minDist = dist;
      insertIndex = i + 1;
    }
  }

  if (insertIndex !== -1) {
    contour.splice(insertIndex, 0, { x, y });
    drawDetectedContours();
  }
}

function pointToLineDistance(p, a, b) {
  const numerator = Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x);
  const denominator = Math.sqrt(Math.pow(b.y - a.y, 2) + Math.pow(b.x - a.x, 2)).toFixed(2) - 0;
  return numerator / denominator;
}

// 新增：处理Canny模式下的点击事件
function handleCannyClick(e) {
  if (mode.value !== 'canny' || !detectedContours.value?.length || cannyEdit.value) {
    return;
  }
  const rect = canvas.value.getBoundingClientRect();
  const scaleX = canvas.value.width / rect.width;
  const scaleY = canvas.value.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  // 检查点击位置是否在某个轮廓内
  for (let i = 0; i < detectedContours.value.length; i++) {
    if (isPointInPolygon({ x, y }, detectedContours.value[i])) {
      selectedContourIndex.value = i;
      drawDetectedContours();
      statusMessage.value = `已选中区域 ${i + 1}`;
      return;
    }
  }

  // 点击在轮廓外则取消选择
  selectedContourIndex.value = -1;
  drawDetectedContours();
  statusMessage.value = '未选中任何区域';
}

// 新增：判断点是否在多边形内
function isPointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;

    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

// 新增：应用Canny模式下的填充
function applyCannyFill() {
  if (selectedContourIndex.value === -1) {
    statusMessage.value = '请先选择一个区域';
    return;
  }

  const contour = detectedContours.value[selectedContourIndex.value];

  // 创建离屏canvas处理选区
  const offscreen = document.createElement('canvas');
  offscreen.width = canvas.value.width;
  offscreen.height = canvas.value.height;
  const offCtx = offscreen.getContext('2d');

  // 绘制选区路径
  offCtx.beginPath();
  offCtx.moveTo(contour[0].x, contour[0].y);
  for (let i = 1; i < contour.length; i++) {
    offCtx.lineTo(contour[i].x, contour[i].y);
  }
  offCtx.closePath();

  // 填充选区
  const opacity = fillOpacity.value / 100;
  offCtx.fillStyle = hexToRgba(fillColor.value, opacity);
  offCtx.fill();

  // 合成到主画布
  ctx.globalCompositeOperation = 'source-atop';
  ctx.drawImage(offscreen, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  // 绘制轮廓
  ctx.beginPath();
  ctx.moveTo(contour[0].x, contour[0].y);
  for (let i = 1; i < contour.length; i++) {
    ctx.lineTo(contour[i].x, contour[i].y);
  }
  ctx.closePath();
  ctx.strokeStyle = strokeColor.value;
  ctx.lineWidth = strokeWidth.value;
  ctx.stroke();

  statusMessage.value = `区域 ${selectedContourIndex.value + 1} 已填充!`;
}

// 修改：统一的应用填充函数
function applyFill() {
  if (mode.value === 'canny') {
    applyCannyFill();
  } else {
    canvasApplyFill();
  }
}

// 辅助函数：十六进制颜色转RGBA
function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
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
const handleImageUpload = (e) => {
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
};
const imUp = useTemplateRef('imageUpload');
function chooseImage() {
  imUp.value.click();
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
