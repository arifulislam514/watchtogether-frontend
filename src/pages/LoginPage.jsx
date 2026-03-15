// src/pages/LoginPage.jsx
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import Button from '../components/ui/Button'
import Input  from '../components/ui/Input'
import Card   from '../components/ui/Card'
import { useState } from 'react'

const LoginPage = () => {
  const { login }     = useAuth()
  const navigate      = useNavigate()
  const [error, setError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm()

  const onSubmit = async (data) => {
    setError('')
    try {
      await login(data.email, data.password)
      navigate('/dashboard')
    } catch (_err) {
      setError('Invalid email or password.')
    }
  }

  return (
    <Card>
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-violet-400">WatchTogether</h1>
        <p className="text-gray-400 mt-1 text-sm">Sign in to your account</p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email', {
            required: 'Email is required',
            pattern: { value: /^\S+@\S+$/i, message: 'Invalid email' }
          })}
        />

        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          error={errors.password?.message}
          {...register('password', {
            required: 'Password is required',
            minLength: { value: 6, message: 'Minimum 6 characters' }
          })}
        />

        <Button type="submit" fullWidth loading={isSubmitting} className="mt-2">
          Sign In
        </Button>
      </form>

      {/* Footer */}
      <p className="text-center text-sm text-gray-500 mt-6">
        Don't have an account?{' '}
        <Link to="/register" className="text-violet-400 hover:text-violet-300">
          Sign up
        </Link>
      </p>
    </Card>
  )
}

export default LoginPage
