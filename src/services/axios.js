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

// Interceptor — handle 401 (token expired)
authAxios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authTokens')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
