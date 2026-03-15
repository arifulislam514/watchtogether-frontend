// src/routes/AppRoutes.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'

import AuthLayout    from '../layouts/AuthLayout'
import MainLayout    from '../layouts/MainLayout'
import ProtectedRoute from './ProtectedRoute'
import PublicRoute    from './PublicRoute'

import LoginPage       from '../pages/LoginPage'
import RegisterPage    from '../pages/RegisterPage'
import DashboardPage   from '../pages/DashboardPage'
import VideoLibraryPage from '../pages/VideoLibraryPage'
import RoomPage        from '../pages/RoomPage'
import ProfilePage     from '../pages/ProfilePage'
import NotFoundPage    from '../pages/NotFoundPage'
import AdminPage from '../pages/AdminPage'

const AppRoutes = () => {
  return (
    <BrowserRouter>
      <Routes>

        {/* ── Public routes — redirect to /dashboard if logged in ── */}
        <Route element={<PublicRoute />}>
          <Route element={<AuthLayout />}>
            <Route path="/login"    element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
        </Route>

        {/* ── Protected routes — redirect to /login if not logged in ── */}
        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route path="/"           element={<DashboardPage />} />
            <Route path="/dashboard"  element={<DashboardPage />} />
            <Route path="/videos"     element={<VideoLibraryPage />} />
            <Route path="/rooms/:id"  element={<RoomPage />} />
            <Route path="/profile"    element={<ProfilePage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>

        {/* ── 404 ── */}
        <Route path="*" element={<NotFoundPage />} />

      </Routes>
    </BrowserRouter>
  )
}

export default AppRoutes
