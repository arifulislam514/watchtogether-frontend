// src/context/AuthProvider.jsx
import { useState } from 'react'
import { AuthContext } from './AuthContext'
import { publicAxios } from '../services/axios'

const getStoredTokens = () => {
  const stored = localStorage.getItem('authTokens')
  return stored ? JSON.parse(stored) : null
}

const getStoredUser = () => {
  const stored = localStorage.getItem('authTokens')
  if (!stored) return null
  const parsed = JSON.parse(stored)
  const payload = JSON.parse(atob(parsed.access.split('.')[1]))
  return { id: payload.user_id }
}

const AuthProvider = ({ children }) => {
  const [user, setUser]     = useState(getStoredUser)
  const [tokens, setTokens] = useState(getStoredTokens)

  const login = async (email, password) => {
    const response = await publicAxios.post('/api/auth/jwt/create/', {
      email,
      password,
    })
    const data = response.data
    setTokens(data)
    localStorage.setItem('authTokens', JSON.stringify(data))
    const payload = JSON.parse(atob(data.access.split('.')[1]))
    setUser({ id: payload.user_id })
    return data
  }

  const logout = () => {
    setUser(null)
    setTokens(null)
    localStorage.removeItem('authTokens')
  }

  const value = {
    user,
    tokens,
    login,
    logout,
    isAuthenticated: !!user,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export default AuthProvider