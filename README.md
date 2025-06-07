### js-image-mark

#### 介绍

js-image-mark 是一个用于在图片上添加索套(类似于 ps 选取物体)并覆盖颜色的 JavaScript 库。
利用 canvas 实现划线，填充。多边形就是多个点组成的闭合区域，在闭合点位置双击可快速填充
利用 opencv.js 的边缘检测，实现物体的选取。边缘拖拽点可拖拽移动，方便快速覆盖物体区域。如果自动覆盖点过多，可右键点击拖拽点删除，覆盖区域将自动更新。
![界面](https://github.com/black-lattice/js-image-mark/blob/main/docs/01.png)

使用方法
首先在 index.html 中引入 opencv.js：

<script async src="https://docs.opencv.org/4.5.5/opencv.js"></script>

然后加载依赖包

```js
yarn add js-image-mark
或者
npm install js-image-mark
```

全局引入

```js
import JsImageMark from 'js-image-mark';
import 'js-image-mark/dist/js-image-mark.css';
createApp(App).use(JsImageMark).mount('#app');
```

按需引入

```js
<script setup>
import { JsImageMark } from 'js-image-mark';
import 'js-image-mark/dist/js-image-mark.css';
</script>
<template>
  <div class="app">
    <JsImageMark style="width: 70%; height: 80%"></JsImageMark>
  </div>
</template>
<style scoped>
.app {
  width: 100%;
  height: 100%;
}
</style>
```
