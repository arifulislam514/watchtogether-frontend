// src/layouts/MainLayout.jsx
import { Outlet } from 'react-router-dom'

const MainLayout = () => {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Navbar will go here in Step 9 */}
      <main>
        <Outlet />
      </main>
    </div>
  )
}

export default MainLayout
