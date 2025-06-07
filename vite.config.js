import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: 'src/main.js', // 入口文件
      name: 'js-image-mark', // 库名称
      fileName: (format) => `js-image-mark.${format}.js`, // 输出文件名
    },
    rollupOptions: {
      external: ['vue'], // 排除Vue依赖
      output: {
        globals: {
          vue: 'Vue', // 全局变量名
        },
      },
    },
  },
});
