import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // ---------- 公开区(免登) ----------
    {
      path: '/',
      name: 'PublicStatus',
      component: () => import('../views/public/PublicStatus.vue'),
    },
    {
      path: '/status/:id',
      name: 'PublicDetail',
      component: () => import('../views/public/PublicDetail.vue'),
    },

    // ---------- 登录 ----------
    {
      path: '/admin/login',
      name: 'Login',
      component: () => import('../views/Login.vue'),
    },

    // ---------- 后台(需鉴权) ----------
    {
      path: '/admin',
      component: () => import('../views/Layout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', name: 'Dashboard', component: () => import('../views/Dashboard.vue') },
        { path: 'clients/:id', name: 'ClientDetail', component: () => import('../views/ClientDetail.vue') },
        { path: 'terminal', name: 'Terminal', component: () => import('../views/Terminal.vue') },
        { path: 'commands', name: 'Commands', component: () => import('../views/Commands.vue') },
        { path: 'tasks', name: 'Tasks', component: () => import('../views/Tasks.vue') },
        { path: 'alerts', name: 'Alerts', component: () => import('../views/Alerts.vue') },
        { path: 'netnodes', name: 'NetNodes', component: () => import('../views/NetNodes.vue') },
        { path: 'files', name: 'Files', component: () => import('../views/Files.vue') },
        { path: 'settings', name: 'Settings', component: () => import('../views/Settings.vue') },
      ],
    },

    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token');
  if (to.meta.requiresAuth && !token) {
    next('/admin/login');
  } else if (to.name === 'Login' && token) {
    next('/admin');
  } else {
    next();
  }
});

export default router;
