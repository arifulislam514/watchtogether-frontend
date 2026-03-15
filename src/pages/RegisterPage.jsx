// src/pages/RegisterPage.jsx
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { publicAxios } from "../services/axios";
import useAuth from "../hooks/useAuth";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Card from "../components/ui/Card";
import { useState } from "react";

const RegisterPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm();

  const onSubmit = async (data) => {
    setError("");
    try {
      // Register
      await publicAxios.post("/api/auth/users/", {
        name: data.name,
        email: data.email,
        password: data.password,
        re_password: data.re_password,
      });
      // Auto-login after register
      await login(data.email, data.password);
      navigate("/dashboard");
    } catch (err) {
      const detail = err.response?.data;
      if (detail?.email) setError("This email is already registered.");
      else if (detail?.password) setError(detail.password[0]);
      else setError("Registration failed. Please try again.");
    }
  };

  return (
    <Card>
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-violet-400">WatchTogether</h1>
        <p className="text-gray-400 mt-1 text-sm">Create your account</p>
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
          label="Name"
          type="text"
          placeholder="Your name"
          error={errors.name?.message}
          {...register("name", { required: "Name is required" })}
        />

        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register("email", {
            required: "Email is required",
            pattern: { value: /^\S+@\S+$/i, message: "Invalid email" },
          })}
        />

        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          error={errors.password?.message}
          {...register("password", {
            required: "Password is required",
            minLength: { value: 8, message: "Minimum 8 characters" },
          })}
        />

        <Input
          label="Confirm Password"
          type="password"
          placeholder="••••••••"
          error={errors.re_password?.message}
          {...register("re_password", {
            required: "Please confirm your password",
            validate: (val) =>
              val === getValues("password") || "Passwords do not match",
          })}
        />

        <Button type="submit" fullWidth loading={isSubmitting} className="mt-2">
          Create Account
        </Button>
      </form>

      {/* Footer */}
      <p className="text-center text-sm text-gray-500 mt-6">
        Already have an account?{" "}
        <Link to="/login" className="text-violet-400 hover:text-violet-300">
          Sign in
        </Link>
      </p>
    </Card>
  );
};

export default RegisterPage;
