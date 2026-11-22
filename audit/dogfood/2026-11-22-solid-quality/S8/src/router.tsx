import { createRouter } from '@solidjs/router'
import { BookingsPage } from './pages/Bookings'
import { RoomsPage } from './pages/Rooms'
import { WeekPage } from './pages/Week'

export const Router = createRouter({
  routes: [
    { path: '/', component: BookingsPage },
    { path: '/rooms', component: RoomsPage },
    { path: '/week', component: WeekPage },
  ],
})
