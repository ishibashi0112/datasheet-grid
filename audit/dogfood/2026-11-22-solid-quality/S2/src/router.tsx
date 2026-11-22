import { createRouter } from '@solidjs/router'
import Users from './pages/Users'
import UserDetail from './pages/UserDetail'
import Settings from './pages/Settings'
import Activity from './pages/Activity'
import Repro from './pages/Repro'
import ActivityReadme from './pages/ActivityReadme'

export const Router = createRouter({
  routes: [
    { path: '/', component: Users },
    { path: '/users', component: Users },
    { path: '/users/:id', component: UserDetail },
    { path: '/settings', component: Settings },
    { path: '/activity', component: Activity },
    { path: '/repro', component: Repro },
    { path: '/activity2', component: ActivityReadme },
  ],
})
