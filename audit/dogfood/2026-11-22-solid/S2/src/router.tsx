import { createRouter } from '@solidjs/router'
import Users from './pages/Users'
import UserDetail from './pages/UserDetail'
import Settings from './pages/Settings'

export const Router = createRouter({
  routes: [
    { path: '/', component: Users },
    { path: '/users', component: Users },
    { path: '/users/:id', component: UserDetail },
    { path: '/settings', component: Settings },
  ],
})
