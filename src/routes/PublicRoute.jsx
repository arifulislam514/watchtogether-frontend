// src/routes/PublicRoute.jsx
import { Navigate, Outlet } from 'react-router-dom'
import useAuth from '../hooks/useAuth'

// Redirects to /dashboard if already logged in
// Prevents logged-in users from seeing login/register pages
const PublicRoute = () => {
  const { isAuthenticated } = useAuth()
  return !isAuthenticated ? <Outlet /> : <Navigate to="/dashboard" replace />
}

export default PublicRoute
