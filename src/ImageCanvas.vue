<script setup>
import { ref, onMounted, computed, useTemplateRef, watch } from 'vue';
import { useCannyDetection } from './composables/useCannyDetection';
import { useCanvasDrawing } from './composables/useCanvasDrawing';
import { useCanvasEvents } from './composables/useCanvasEvents';
import { useCanvasPan } from './composables/useCanvasPan';
import { useCanvasHistory } from './composables/useCanvasHistory';
import EventBus from './utils/eventbus.js';
const cannyEdit = ref(false);
const mode = ref('freehand');
// 画布引用
const canvas = ref(null);
const ctx = ref(null);
const originalImage = ref(null);
const imageUpload = ref(null);

// 初始化组合式函数
const {
  // mode,
  isDrawing,
  points,
  startDrawing,
  draw,
  endDrawing,
  closePolygon,
  resetDrawing,
  resetCanvas,
  redrawSelection,
  applyFill,
  handleNonCannyEdit,
} = useCanvasDrawing(canvas, ctx, originalImage, mode, cannyEdit);

const {
  //   cvReady,
  detectedContours,
  selectedContourIndex,
  resetCannyDetection,
  detectEdges,
  drawDetectedContours,
  handleCannyEdit,
} = useCannyDetection(canvas, ctx, originalImage, cannyEdit);

const { setupPanHandlers } = useCanvasPan(canvas, ctx, originalImage);
const { setupEventListeners, handleKeyDown } = useCanvasEvents(canvas, {
  mode,
  cannyEdit,
  detectedContours,
  selectedContourIndex,
  points,
  drawDetectedContours,
  resetCanvas,
  startDrawing,
  draw,
  endDrawing,
  closePolygon,
  resetDrawing,
  redrawSelection,
  applyFill,
  isDrawing,
});
const { undo, redo, canRedo, canUndo, recordState, setupRecordEvent, clearHistory } = useCanvasHistory({ canvas, mode, cannyEdit, detectedContours, selectedContourIndex, points, isDrawing });
// 监听模式变化
watch([mode, cannyEdit], () => {
  setupEventListeners();
  setupPanHandlers();
});

function setMode(newMode) {
  mode.value = newMode;
  points.value = [];
  resetDrawing();
  if (mode.value === 'canny') detectEdges();
  resetCanvas();
  EventBus.emit('recordState');
}

function handleImageUpload(e) {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = function (event) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = event.target.result;
    img.onload = function () {
      try {
        // 确保画布和上下文存在
        if (!canvas.value) {
          console.error('画布元素不存在');
          return;
        }

        // 获取上下文
        ctx.value = canvas.value.getContext('2d');
        if (!ctx.value) {
          console.error('无法获取画布上下文');
          return;
        }
        clearHistory();
        // 设置画布尺寸
        canvas.value.width = img.naturalWidth;
        canvas.value.height = img.naturalHeight;
        canvas.value.style.display = 'block';

        // 绘制图片
        ctx.value.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);

        // 保存原始图片
        originalImage.value = new Image();
        originalImage.value.src = canvas.value.toDataURL();

        // 初始化事件监听
        setupEventListeners();
        setupPanHandlers();
        setupRecordEvent();
        recordState();
        // 如果当前是 Canny 模式，执行边缘检测
        if (mode.value === 'canny') {
          detectEdges();
        }
      } catch (error) {
        console.error('图片加载失败:', error);
      }
    };
  };
  reader.readAsDataURL(file);
}

function chooseImage() {
  imageUpload.value.click();
}

function handleEdit() {
  cannyEdit.value = !cannyEdit.value;
  if (mode.value === 'canny') {
    handleCannyEdit();
  } else {
    handleNonCannyEdit();
  }
  EventBus.emit('recordState');
}
function handleResetCanvas() {
  resetCanvas();
  resetCannyDetection();
  EventBus.emit('recordState');
}
function handleApplyFill() {
  applyFill();
  EventBus.emit('recordState');
}
</script>

<template>
  <div class="canvas-section">
    <div class="toolbar">
      <input type="file" ref="imageUpload" accept="image/*" style="display: none" @change="handleImageUpload" />
      <img key="uploadImage" @click="chooseImage" class="btn" src="../src/assets/icons/upload.svg" alt="upload" />
      <img key="freehand" @click="setMode('freehand')" :class="['btn', { 'btn-active': mode === 'freehand' }]" src="../src/assets/icons/line.svg" alt="line" />
      <img key="polygon" @click="setMode('polygon')" :class="['btn', { 'btn-active': mode === 'polygon' }]" src="../src/assets/icons/polygon.svg" alt="polygon" />
      <img key="canny" @click="setMode('canny')" :class="['btn', { 'btn-active': mode === 'canny' }]" src="../src/assets/icons/canny.svg" alt="canny" />
      <img key="cannyEdit" @click="handleEdit" :class="['btn', { 'btn-active': cannyEdit }]" src="../src/assets/icons/hand.svg" alt="edit" />
      <img key="applyFill" @click="handleApplyFill" class="btn" src="../src/assets/icons/fill.svg" alt="fill" />
      <img key="resetCanvas" @click="handleResetCanvas" class="btn" src="../src/assets/icons/reset.svg" alt="reset" />
      <img key="undo" @click="undo" :class="['btn', { disabled: !canUndo }]" src="../src/assets/icons/undo.svg" alt="undo" />
      <img key="redo" @click="redo" :class="['btn', { disabled: !canRedo }]" src="../src/assets/icons/redo.svg" alt="redo" />
    </div>
    <div class="canvas-container">
      <canvas ref="canvas" @keydown="handleKeyDown" tabindex="0"></canvas>
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

.canvas-section {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  border-radius: 10px;
  box-shadow: 4px 4px 6px rgba(0, 0, 0, 0.05);
}

.canvas-container {
  width: 100%;
  flex: 1;
  overflow: auto;
  /* 隐藏滚动条，但仍可滚动 */
  -ms-overflow-style: none; /* IE 和 Edge */
  scrollbar-width: none; /* Firefox */
}

.canvas-container::-webkit-scrollbar {
  display: none; /* Chrome, Safari 和 Opera */
}

canvas {
  cursor: crosshair;
}

.toolbar {
  height: 60px;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 15px;
  background: #f8f9fa;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
}

.btn {
  width: 32px;
  height: 32px;
  padding: 5px;
  border: none;
  border-radius: 8px;
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}
.btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 8px rgba(52, 152, 219, 0.4);
}

.btn-active {
  transform: translateY(-1px);
  box-shadow: 0 6px 8px rgba(52, 152, 219, 0.4);
}
</style>
