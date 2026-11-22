import { createRouter } from '@solidjs/router'
import { ProjectPage } from './ProjectPage'
import { ReportPage } from './ReportPage'
import { MembersPage } from './MembersPage'

function Home() {
  return <p class="home">左のプロジェクトを選んでください。</p>
}

export const Router = createRouter({
  routes: [
    { path: '/', component: Home },
    { path: '/projects/:id', component: ProjectPage },
    { path: '/projects/:id/report', component: ReportPage },
    { path: '/members', component: MembersPage },
  ],
})
