import React, { useState } from "react";
import { useLocation, useNavigate ,Link} from "react-router-dom";
import { login } from "../services/authService";
import toast from "react-hot-toast";
import {
  UserIcon,
  LockClosedIcon,
  ArrowLeftOnRectangleIcon,
  ExclamationCircleIcon,
  EyeIcon,
  EyeSlashIcon
} from "@heroicons/react/24/outline";

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

const validateUsername = (username) => {
  const re = /^[a-zA-Z0-9_]+$/;
  return re.test(username) && username.length >= 3;
};

const validatePassword = (password) => {
  return password.length >= 6;
};

export default function Login({ onLogin }) {
  const q = useQuery();
  const navigate = useNavigate();
  const redirect = q.get("redirect") || "/dashboard";
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [loginData, setLoginData] = useState({ 
    userName: "", 
    password: "" 
  });
  const [loginErrors, setLoginErrors] = useState({
    userName: "",
    password: ""
  });

  const validateLoginForm = () => {
    let isValid = true;
    const newErrors = {
      userName: "",
      password: ""
    };

    if (!loginData.userName.trim()) {
      newErrors.userName = "Username is required";
      isValid = false;
    } else if (!validateUsername(loginData.userName)) {
      newErrors.userName = "Username must be at least 3 characters and contain only letters, numbers, and underscores";
      isValid = false;
    }

    if (!loginData.password) {
      newErrors.password = "Password is required";
      isValid = false;
    } else if (!validatePassword(loginData.password)) {
      newErrors.password = "Password must be at least 6 characters";
      isValid = false;
    }

    setLoginErrors(newErrors);
    return isValid;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!validateLoginForm()) return;
    
    setIsSubmitting(true);
    try {
      const data = await login(loginData);
      toast.success("Welcome back!", {
        icon: '👋',
        style: {
          borderRadius: '10px',
          background: '#4ADE80',
          color: '#fff',
        },
      });
      if (data.token) localStorage.setItem("token", data.token);
      onLogin(data);
      navigate(redirect);
    } catch (err) {
      toast.error(err?.response?.data?.error || "Invalid credentials. Please try again.", {
        icon: '⚠️',
        style: {
          borderRadius: '10px',
          background: '#F87171',
          color: '#fff',
        },
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-center">
          <h1 className="text-2xl font-bold text-white">Welcome to ParseBlog</h1>
          <p className="text-indigo-100 mt-1">Sign in to continue</p>
        </div>

        <div className="p-6">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon className={`h-5 w-5 ${loginErrors.userName ? 'text-red-500' : 'text-gray-400'}`} />
                </div>
                <input
                  required
                  placeholder="Enter your username"
                  value={loginData.userName}
                  onChange={(e) => {
                    setLoginData({ ...loginData, userName: e.target.value });
                    if (loginErrors.userName) {
                      setLoginErrors({ ...loginErrors, userName: "" });
                    }
                  }}
                  className={`pl-10 w-full border ${loginErrors.userName ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'} rounded-lg px-4 py-2.5 focus:ring-2 focus:border-indigo-500 outline-none transition`}
                />
              </div>
              {loginErrors.userName && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <ExclamationCircleIcon className="h-4 w-4 mr-1" />
                  {loginErrors.userName}
                </p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <LockClosedIcon className={`h-5 w-5 ${loginErrors.password ? 'text-red-500' : 'text-gray-400'}`} />
                </div>
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={loginData.password}
                  onChange={(e) => {
                    setLoginData({ ...loginData, password: e.target.value });
                    if (loginErrors.password) {
                      setLoginErrors({ ...loginErrors, password: "" });
                    }
                  }}
                  className={`pl-10 pr-10 w-full border ${loginErrors.password ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'} rounded-lg px-4 py-2.5 focus:ring-2 focus:border-indigo-500 outline-none transition`}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  )}
                </button>
              </div>
              {loginErrors.password && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <ExclamationCircleIcon className="h-4 w-4 mr-1" />
                  {loginErrors.password}
                </p>
              )}
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                  Remember me
                </label>
              </div>
              <div className="text-sm">
                <Link to="/forgot-password" className="font-medium text-indigo-600 hover:text-indigo-500">
  Forgot password?
</Link>
              </div>
            </div>
            
            <button 
              type="submit"
              disabled={isSubmitting}
              className={`w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-3 rounded-lg hover:shadow-md transition-all font-medium flex items-center justify-center ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Logging in...
                </>
              ) : 'Login to your account'}
            </button>
            
            <div className="text-center text-sm text-gray-500">
              Don't have an account?{' '}
              <a
                href="/signup"
                className="font-medium text-indigo-600 hover:text-indigo-500"
              >
                Sign up
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}