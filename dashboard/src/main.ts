import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import 'flag-icons/css/flag-icons.min.css';
import './styles/theme.css';
import App from './App.vue';
import router from './router/index';
import { useThemeStore } from './stores/theme';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(ElementPlus);

// 初始化主题(在挂载前应用 data-theme,避免首屏闪烁)
useThemeStore();

app.mount('#app');
