import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import JsImageMark from 'js-image-mark';
import 'js-image-mark/dist/js-image-mark.css';
createApp(App).use(JsImageMark).mount('#app');
