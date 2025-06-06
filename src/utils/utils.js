// 防抖工具函数，确保在指定的等待时间内，函数只执行一次
export const Debounce = (fn, wait) => {
  let timer = null;
  return function (...args) {
    // 如果定时器存在，清除定时器
    if (timer) {
      clearTimeout(timer);
    }
    // 设置新的定时器
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, wait);
  };
};

export function eventMouseFactory(fn, key) {
  return function (e) {
    if (e.button !== key) return;
    requestAnimationFrame(fn.bind(null, e));
  };
}
