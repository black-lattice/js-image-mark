import { ref, computed } from 'vue';
import { Debounce } from '../utils/utils.js';
import EventBus from '../utils/eventbus.js';
const maxSteps = 20;
const history = ref([]);
const currentStep = ref(-1);
export function useCanvasHistory({ canvas, points, mode, isDrawing, cannyEdit, detectedContours, selectedContourIndex }) {
  EventBus.on('recordState', recordState);
  // 记录画布状态
  function recordState() {
    const imageData = canvas.value.toDataURL();
    // 移除当前步骤之后的历史
    history.value.push({
      data: imageData,
      mode: mode.value,
      isDrawing: isDrawing.value,
      cannyEdit: cannyEdit.value,
      selectedContourIndex: selectedContourIndex.value,
      points: Array.from(points.value),
      detectedContours: Array.from(detectedContours.value),
    });

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
  }

  // 清空历史
  function clearHistory() {
    history.value = [];
    currentStep.value = -1;
  }
  function setupRecordEvent() {
    // canvas.value.addEventListener('mouseup', Debounce(recordState, 200));
  }
  return {
    recordState,
    undo,
    redo,
    clearHistory,
    canUndo: computed(() => currentStep.value > 0),
    canRedo: computed(() => currentStep.value < history.value.length - 1),
    setupRecordEvent,
  };
}
