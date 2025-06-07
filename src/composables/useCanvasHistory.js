import { ref, computed } from 'vue';
import EventBus from '../utils/eventbus.js';
let maxSteps = 20;
const history = ref([]);
const currentStep = ref(-1);
let currentData = ref(null);
export function useCanvasHistory({ maxStack, canvas, points, mode, isDrawing, cannyEdit, detectedContours, selectedContourIndex }) {
  maxSteps = maxStack;
  EventBus.on('recordState', recordState);
  // 记录画布状态
  function recordState() {
    const imageData = canvas.value.toDataURL();
    currentData.value = {
      data: imageData,
      mode: mode.value,
      isDrawing: isDrawing.value,
      cannyEdit: cannyEdit.value,
      selectedContourIndex: selectedContourIndex.value,
      points: Array.from(points.value),
      detectedContours: Array.from(detectedContours.value),
    };
    // 移除当前步骤之后的历史
    history.value.push({ ...currentData.value });

    // 限制历史记录长度
    if (history.value.length > maxSteps) {
      history.value.shift();
    }
    currentStep.value = history.value.length - 1;
  }

  // 撤销操作
  function undo() {
    if (currentStep.value > 0) {
      currentStep.value--;
      restoreState();
    }
  }

  // 重做操作
  function redo() {
    if (currentStep.value < history.value.length - 1) {
      currentStep.value++;
      restoreState();
    }
  }

  // 恢复状态
  function restoreState() {
    const img = new Image();
    const his = history.value[currentStep.value];
    img.onload = () => {
      const ctx = canvas.value.getContext('2d');
      ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = his.data;
    mode.value = his.mode;
    isDrawing.value = his.isDrawing;
    cannyEdit.value = his.cannyEdit;
    points.value = his.points;
    detectedContours.value = his.detectedContours;
    selectedContourIndex.value = his.selectedContourIndex;
    currentData.value = his;
  }

  // 清空历史
  function clearHistory() {
    history.value = [];
    currentStep.value = -1;
  }
  return {
    currentData,
    recordState,
    undo,
    redo,
    clearHistory,
    canUndo: computed(() => currentStep.value > 0),
    canRedo: computed(() => currentStep.value < history.value.length - 1),
  };
}
