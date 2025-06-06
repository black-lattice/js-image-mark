import { ref } from 'vue';
import { eventMouseFactory } from '../utils/utils';

export function useCanvasPan(canvas, ctx, originalImage) {
  const isPanning = ref(false);
  const startPos = ref({ x: 0, y: 0 });
  const offset = ref({ x: 0, y: 0 });

  function handlePanStart(e) {
    isPanning.value = true;
    const parent = canvas.value.parentElement;
    startPos.value = {
      x: e.clientX,
      y: e.clientY,
      scrollX: parent.scrollLeft,
      scrollY: parent.scrollTop,
    };
    canvas.value.style.cursor = 'grabbing';
  }

  function handlePanMove(e) {
    if (!isPanning.value) return;

    const parent = canvas.value.parentElement;
    const deltaX = e.clientX - startPos.value.x;
    const deltaY = e.clientY - startPos.value.y;

    parent.scrollLeft = startPos.value.scrollX - deltaX;
    parent.scrollTop = startPos.value.scrollY - deltaY;
  }

  function handlePanEnd() {
    isPanning.value = false;
    canvas.value.style.cursor = 'crosshair';
  }

  function setupPanHandlers() {
    canvas.value.addEventListener('mousedown', eventMouseFactory(handlePanStart, 2));
    canvas.value.addEventListener('mousemove', eventMouseFactory(handlePanMove, 0));
    canvas.value.addEventListener('mouseup', eventMouseFactory(handlePanEnd, 2));
    canvas.value.addEventListener('mouseleave', eventMouseFactory(handlePanEnd, 2));
    canvas.value.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  return {
    setupPanHandlers,
    offset,
  };
}
