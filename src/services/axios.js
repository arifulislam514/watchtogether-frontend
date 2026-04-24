// src/services/axios.js
import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL

// ── Public client — no auth header ──────────────────────────
// Used for: login, register
export const publicAxios = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// ── Authenticated client — attaches JWT automatically ───────
// Used for: all protected API calls
export const authAxios = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Interceptor — reads token from localStorage before every request
authAxios.interceptors.request.use((config) => {
  const tokens = localStorage.getItem('authTokens')
  if (tokens) {
    const { access } = JSON.parse(tokens)
    config.headers['Authorization'] = `JWT ${access}`
  }
  return config
})

// Interceptor — handle 401 with silent token refresh
let isRefreshing = false
let refreshQueue = []  // queued requests waiting for new token

authAxios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const stored = localStorage.getItem('authTokens')
      if (!stored) {
        window.location.href = '/login'
        return Promise.reject(error)
      }
      // If already refreshing, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject })
        }).then(token => {
          original.headers['Authorization'] = `JWT ${token}`
          return authAxios(original)
        })
      }
      isRefreshing = true
      try {
        const { refresh } = JSON.parse(stored)
        const res = await publicAxios.post('/api/auth/jwt/refresh/', { refresh })
        const newAccess = res.data.access
        const newTokens = { ...JSON.parse(stored), access: newAccess }
        localStorage.setItem('authTokens', JSON.stringify(newTokens))
        // Flush queue
        refreshQueue.forEach(({ resolve }) => resolve(newAccess))
        refreshQueue = []
        original.headers['Authorization'] = `JWT ${newAccess}`
        return authAxios(original)
      } catch (_) {
        refreshQueue.forEach(({ reject }) => reject(_))
        refreshQueue = []
        localStorage.removeItem('authTokens')
        window.location.href = '/login'
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)
