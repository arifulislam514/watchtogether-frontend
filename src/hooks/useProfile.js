// src/hooks/useProfile.js
import { useState, useEffect } from 'react'
import { authAxios } from '../services/axios'

const useProfile = () => {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authAxios.get('/api/users/me/')
      .then(res => setProfile(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  const updateProfile = async (data) => {
    const res = await authAxios.patch('/api/users/me/', data, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    setProfile(res.data)
    return res.data
  }

  return { profile, loading, updateProfile }
}

export default useProfile
