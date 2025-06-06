import { ref } from 'vue';
import { eventMouseFactory } from '../utils/utils';
import EventBus from '../utils/eventbus.js';
import { getCanvasCoordinates, isPointInPolygon, pointToLineDistance } from '../utils/canvasUtils';

export function useCanvasEvents(
  canvas,
  { mode, cannyEdit, detectedContours, selectedContourIndex, points, drawDetectedContours, resetCanvas, startDrawing, draw, endDrawing, closePolygon, resetDrawing, redrawSelection }
) {
  const draggingIndex = ref(-1); // 当前拖拽的控制点索引
  const isDragging = ref(false); // 是否正在拖拽
  const dragStartPoint = ref(null); // 拖拽开始点
  const selectedPoint = ref(null); // 选中的点

  // 定义事件映射，方便管理添加和移除的事件
  const eventMap = {
    trueEdit: [
      { type: 'dblclick', handler: eventMouseFactory(handleCannyDoubleClick, 0) }, // 双击添加点
      { type: 'mousedown', handler: eventMouseFactory(startDragging, 0) }, // 开始拖拽
      { type: 'mousemove', handler: eventMouseFactory(dragPoint, 0) }, // 拖拽移动
      { type: 'mouseup', handler: eventMouseFactory(stopDragging, 0) }, // 停止拖拽
      { type: 'contextmenu', handler: eventMouseFactory(handleRightClick, 2) }, // 右键删除点
    ],
    falseEdit: [
      { type: 'mousedown', handler: eventMouseFactory(startDrawing, 0) }, // 开始绘制
      { type: 'mousemove', handler: eventMouseFactory(draw, 0) }, // 绘制
      { type: 'mouseup', handler: eventMouseFactory(endDrawing, 0) }, // 结束绘制
      { type: 'dblclick', handler: eventMouseFactory(closePolygon, 0) }, // 闭合多边形
      { type: 'click', handler: eventMouseFactory(handleCannyClick, 0) }, // Canny模式点击
    ],
  };

  /**
   * 开始拖拽控制点
   * @param {Event} e - 鼠标事件对象
   */
  function startDragging(e) {
    if (!cannyEdit.value) return;

    const { x, y } = getCanvasCoordinates(e, canvas.value);
    const contour = mode.value === 'canny' ? detectedContours.value[selectedContourIndex.value] : points.value;

    if (!contour) return;

    // 查找最近的控制点
    const index = findNearestPoint(contour, x, y);
    if (index !== -1) {
      draggingIndex.value = index;
      isDragging.value = true;
      dragStartPoint.value = { x, y };
      selectedPoint.value = { ...contour[index] };
      canvas.value.style.cursor = 'grabbing';
      EventBus.emit('recordState');
    }
  }

  /**
   * 拖拽控制点移动
   * @param {Event} e - 鼠标事件对象
   */
  function dragPoint(e) {
    if (!isDragging.value || !cannyEdit.value) return;

    const { x, y } = getCanvasCoordinates(e, canvas.value);
    const contour = mode.value === 'canny' ? detectedContours.value[selectedContourIndex.value] : points.value;

    if (!contour) return;

    // 更新控制点位置
    contour[draggingIndex.value] = { x, y };

    // 重绘轮廓
    if (mode.value === 'canny') {
      requestAnimationFrame(drawDetectedContours);
    } else {
      requestAnimationFrame(redrawSelection);
    }
  }

  /**
   * 停止拖拽
   */
  function stopDragging() {
    isDragging.value = false;
    draggingIndex.value = -1;
    dragStartPoint.value = null;
    selectedPoint.value = null;
    canvas.value.style.cursor = 'crosshair';
    EventBus.emit('recordState');
  }

  /**
   * 处理Canny模式下的双击事件
   * @param {Event} e - 鼠标事件对象
   */
  function handleCannyDoubleClick(e) {
    if (!cannyEdit.value) return;

    const contour = mode.value === 'canny' ? detectedContours.value[selectedContourIndex.value] : points.value;
    if (!Array.isArray(contour) || contour.length === 0) return;

    const { x, y } = getCanvasCoordinates(e, canvas.value);
    const { minDist, insertIndex } = findNearestEdge(contour, x, y);

    if (insertIndex !== -1 && minDist < 10) {
      contour.splice(insertIndex, 0, { x, y });
      if (mode.value === 'canny') {
        drawDetectedContours();
      } else {
        redrawSelection();
      }
    }
    EventBus.emit('recordState');
  }

  /**
   * 处理右键点击事件
   * @param {Event} e - 鼠标事件对象
   */
  function handleRightClick(e) {
    e.preventDefault();
    if (!cannyEdit.value) return;

    const contour = mode.value === 'canny' ? detectedContours.value[selectedContourIndex.value] : points.value;
    if (!Array.isArray(contour) || contour.length === 0) return;

    const { x, y } = getCanvasCoordinates(e, canvas.value);
    const pointIndex = findNearestPoint(contour, x, y);

    if (pointIndex !== -1 && contour.length > 3) {
      contour.splice(pointIndex, 1);
      if (mode.value === 'canny') {
        drawDetectedContours();
      } else {
        redrawSelection();
      }
    }
    EventBus.emit('recordState');
  }

  /**
   * 处理Canny模式下的点击事件
   * @param {Event} e - 鼠标事件对象
   */
  function handleCannyClick(e) {
    if (mode.value !== 'canny' || !detectedContours.value?.length || cannyEdit.value) {
      return;
    }
    const { x, y } = getCanvasCoordinates(e, canvas.value);
    let selectedIndex = -1;
    for (let i = 0; i < detectedContours.value.length; i++) {
      if (isPointInPolygon({ x, y }, detectedContours.value[i])) {
        selectedIndex = i;
        break;
      }
    }
    selectedContourIndex.value = selectedIndex;
    drawDetectedContours();
  }

  /**
   * 查找最近的控制点
   * @param {Array} contour - 轮廓点集
   * @param {number} x - 鼠标x坐标
   * @param {number} y - 鼠标y坐标
   * @returns {number} 最近控制点的索引，-1表示未找到
   */
  function findNearestPoint(contour, x, y) {
    if (!contour || !contour.length) return -1;

    const threshold = 10;
    return contour.findIndex((point) => {
      const dx = point.x - x;
      const dy = point.y - y;
      return Math.sqrt(dx * dx + dy * dy) < threshold;
    });
  }

  /**
   * 查找最近的边
   * @param {Array} contour - 轮廓点集
   * @param {number} x - 鼠标x坐标
   * @param {number} y - 鼠标y坐标
   * @returns {Object} 包含最近距离和插入索引的对象
   */
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

  /**
   * 处理键盘按下事件
   * @param {Event} e - 键盘事件对象
   */
  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      resetDrawing();
      resetCanvas();
    }
  }

  /**
   * 设置事件监听器
   * 根据当前模式添加或移除相应的事件监听器
   */
  function setupEventListeners() {
    const canvasElement = canvas.value;
    if (!canvasElement) return;

    // 根据当前模式确定要添加和移除的事件
    const add = cannyEdit.value ? eventMap.trueEdit : eventMap.falseEdit;
    const remove = cannyEdit.value ? eventMap.falseEdit : eventMap.trueEdit;

    // 移除事件监听
    remove.forEach(({ type, handler }) => {
      canvasElement.removeEventListener(type, handler);
    });

    // 添加事件监听
    add.forEach(({ type, handler }) => {
      canvasElement.addEventListener(type, handler);
    });
  }

  return {
    // draggingIndex,
    // isDragging,
    // dragStartPoint,
    // selectedPoint,
    setupEventListeners,
    // handleMouseDown,
    // handleMouseMove,
    // handleMouseUp,
    handleKeyDown,
  };
}
