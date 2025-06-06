import { ref, watch } from 'vue';
import EventBus from '../utils/eventbus';
import { drawAnchorPoint, drawClosedPath, hexToRgba } from '../utils/canvasUtils';
const detectedContours = ref([]); // 存储检测到的所有轮廓
const selectedContourIndex = ref(-1); // 当前选中的轮廓索引

export function useCannyDetection(canvas, ctx, originalImage, cannyEdit) {
  const lowThreshold = ref(50); // Canny边缘检测的低阈值
  const highThreshold = ref(150); // Canny边缘检测的高阈值
  const kernelSize = ref(7); // 高斯模糊的核大小
  const sigma = ref(1.3); // 高斯模糊的标准差
  const controlPointColor = ref('#ff9900'); // 控制点的颜色
  const fillColor = ref('#ff6b6b'); // 填充颜色
  const strokeColor = ref('#ff0000'); // 描边颜色
  const strokeWidth = ref(1); // 描边宽度
  const fillOpacity = ref(60); // 填充透明度
  /**
   * 执行Canny边缘检测
   * 使用OpenCV进行图像处理，包括灰度转换、高斯模糊、边缘检测等步骤
   * 检测到的轮廓会被存储在detectedContours中
   */
  function detectEdges() {
    if (!window.cv || !originalImage.value || !ctx.value || !canvas.value) {
      console.error('OpenCV 未加载 或未上传图片');
      return;
    }

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
      const imageData = ctx.value.getImageData(0, 0, canvas.value.width, canvas.value.height);
      src = cv.matFromImageData(imageData);

      // 转换为灰度图
      gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // 高斯模糊降噪
      blurred = new cv.Mat();
      cv.GaussianBlur(gray, blurred, new cv.Size(kernelSize.value, kernelSize.value), sigma.value);

      // 自适应阈值处理
      thresh = new cv.Mat();
      cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);

      // Canny边缘检测
      edges = new cv.Mat();
      cv.Canny(blurred, edges, lowThreshold.value, highThreshold.value);

      // 形态学闭操作
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
          const epsilon = 0.01 * cv.arcLength(cnt, true);
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

  /**
   * 绘制检测到的轮廓
   * @param {string} strokeColor - 轮廓线条颜色
   * @param {number} strokeWidth - 轮廓线条宽度
   * @param {string} fillColor - 填充颜色
   * @param {number} fillOpacity - 填充透明度
   */
  function drawDetectedContours() {
    // 检查画布和原始图像是否存在，避免空指针异常
    if (!canvas.value || !originalImage.value) return;
    // 清除画布并重新绘制原始图像
    resetCanvas(false);

    // 获取当前选中的轮廓
    const contour = detectedContours.value[selectedContourIndex.value];
    // 若轮廓点集为空，则直接返回
    if (!Array.isArray(contour) || contour.length === 0) return;
    // 绘制轮廓路径
    drawClosedPath(ctx.value, contour, strokeColor.value, strokeWidth.value);
    // 设置样式并填充、描边轮廓
    ctx.value.fillStyle = hexToRgba(fillColor.value, fillOpacity.value / 100);
    ctx.value.lineCap = 'round';
    ctx.value.fill();

    // 绘制可拖拽控制点
    if (cannyEdit.value) {
      contour.forEach((point) => drawAnchorPoint(ctx.value, point.x, point.y, controlPointColor.value));
    }
  }

  /**
   * 重置画布
   * @param {boolean} reset - 是否重置所有状态
   */
  function resetCanvas(reset = true) {
    if (!canvas.value || !originalImage.value) return;

    ctx.value.clearRect(0, 0, canvas.value.width, canvas.value.height);
    ctx.value.drawImage(originalImage.value, 0, 0);

    if (reset) {
      detectedContours.value = [];
      selectedContourIndex.value = -1;
      cannyEdit.value = false;
    }
  }

  /**
   * 处理Canny编辑状态切换
   */
  function handleCannyEdit() {
    drawDetectedContours();
  }

  /**
   * 处理Canny模式下的点击事件
   * @param {Event} e - 点击事件对象
   */
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
    if (selectedContourIndex.value > -1) {
      EventBus.emit('recordState');
    }
    // 重绘检测到的轮廓
    drawDetectedContours();
  }

  /**
   * 判断点是否在多边形内部
   * @param {Object} point - 待判断的点 {x, y}
   * @param {Array} polygon - 多边形点集数组
   * @returns {boolean} 点是否在多边形内部
   */
  function isPointInPolygon(point, polygon) {
    if (polygon.length < 3) return false;

    let inside = false;
    const { x: pointX, y: pointY } = point;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const { x: xi, y: yi } = polygon[i];
      const { x: xj, y: yj } = polygon[j];

      const yCondition = yi > pointY !== yj > pointY;
      const slope = (xj - xi) / (yj - yi);
      const xCondition = pointX < slope * (pointY - yi) + xi;

      if (yCondition && xCondition) {
        inside = !inside;
      }
    }

    return inside;
  }
  /**
   * 重置Canny检测相关状态
   */
  function resetCannyDetection() {
    detectedContours.value = [];
    selectedContourIndex.value = -1;
  }
  return {
    // cvReady,
    detectedContours,
    selectedContourIndex,
    lowThreshold,
    highThreshold,
    kernelSize,
    sigma,
    detectEdges,
    drawDetectedContours,
    resetCanvas,
    handleCannyEdit,
    handleCannyClick,
    resetCannyDetection,
  };
}
