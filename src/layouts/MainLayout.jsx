// src/layouts/MainLayout.jsx
import { Outlet } from 'react-router-dom'
import Navbar from '../components/Navbar'

const MainLayout = () => (
  <div className="min-h-screen bg-gray-950 text-white">
    <Navbar />
    <main className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-8">
      <Outlet />
    </main>
  </div>
)

export default MainLayout
