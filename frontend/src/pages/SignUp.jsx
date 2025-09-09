import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signup } from "../services/authService";
import toast from "react-hot-toast";
import {
  EnvelopeIcon,
  LockClosedIcon,
  UserIcon,
  IdentificationIcon,
  PhotoIcon,
  UserCircleIcon,
  ExclamationCircleIcon,
  EyeIcon,
  EyeSlashIcon
} from "@heroicons/react/24/outline";

const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
};

const validatePassword = (password) => {
  return password.length >= 6;
};

const validateUsername = (username) => {
  const re = /^[a-zA-Z0-9_]+$/;
  return re.test(username) && username.length >= 3;
};

const validateFullName = (name) => {
  return name.trim().length >= 2;
};

export default function Signup({ onLogin }) {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [signupData, setSignupData] = useState({
    fullName: "",
    userName: "",
    email: "",
    password: "",
  });
  const [signupErrors, setSignupErrors] = useState({
    fullName: "",
    userName: "",
    email: "",
    password: "",
    profilePicture: ""
  });

  const [profilePicture, setProfilePicture] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);

  const validateSignupForm = () => {
    let isValid = true;
    const newErrors = {
      fullName: "",
      userName: "",
      email: "",
      password: "",
      profilePicture: ""
    };

    if (!signupData.fullName.trim()) {
      newErrors.fullName = "Full name is required";
      isValid = false;
    } else if (!validateFullName(signupData.fullName)) {
      newErrors.fullName = "Please enter a valid name";
      isValid = false;
    }

    if (!signupData.userName.trim()) {
      newErrors.userName = "Username is required";
      isValid = false;
    } else if (!validateUsername(signupData.userName)) {
      newErrors.userName = "Username must be at least 3 characters and contain only letters, numbers, and underscores";
      isValid = false;
    }

    if (!signupData.email.trim()) {
      newErrors.email = "Email is required";
      isValid = false;
    } else if (!validateEmail(signupData.email)) {
      newErrors.email = "Please enter a valid email address";
      isValid = false;
    }

    if (!signupData.password) {
      newErrors.password = "Password is required";
      isValid = false;
    } else if (!validatePassword(signupData.password)) {
      newErrors.password = "Password must be at least 6 characters";
      isValid = false;
    }

    setSignupErrors(newErrors);
    return isValid;
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!validateSignupForm()) return;
    
    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("fullName", signupData.fullName);
      fd.append("userName", signupData.userName);
      fd.append("email", signupData.email);
      fd.append("password", signupData.password);
      if (profilePicture) fd.append("profilePicture", profilePicture);
      
      const data = await signup(fd);
      toast.success("Account created successfully!", {
        icon: '🎉',
        style: {
          borderRadius: '10px',
          background: '#4ADE80',
          color: '#fff',
        },
      });
      if (data.token) localStorage.setItem("token", data.token);
      onLogin(data);
      navigate("/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Registration failed. Please try again.", {
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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
      const maxSize = 2 * 1024 * 1024; 
      
      if (!validTypes.includes(file.type)) {
        setSignupErrors({
          ...signupErrors,
          profilePicture: "Please upload a valid image (JPEG, PNG, GIF)"
        });
        return;
      }
      
      if (file.size > maxSize) {
        setSignupErrors({
          ...signupErrors,
          profilePicture: "Image size should be less than 2MB"
        });
        return;
      }
      
      setProfilePicture(file);
      setPreviewImage(URL.createObjectURL(file));
      setSignupErrors({
        ...signupErrors,
        profilePicture: ""
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-center">
          <h1 className="text-2xl font-bold text-white">Welcome to ParseBlog</h1>
          <p className="text-indigo-100 mt-1">Create your account</p>
        </div>

        <div className="p-6">
          <form onSubmit={handleSignup} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <IdentificationIcon className={`h-5 w-5 ${signupErrors.fullName ? 'text-red-500' : 'text-gray-400'}`} />
                </div>
                <input
                  required
                  placeholder="Your full name"
                  value={signupData.fullName}
                  onChange={(e) => {
                    setSignupData({ ...signupData, fullName: e.target.value });
                    if (signupErrors.fullName) {
                      setSignupErrors({ ...signupErrors, fullName: "" });
                    }
                  }}
                  className={`pl-10 w-full border ${signupErrors.fullName ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'} rounded-lg px-4 py-2.5 focus:ring-2 focus:border-indigo-500 outline-none transition`}
                />
              </div>
              {signupErrors.fullName && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <ExclamationCircleIcon className="h-4 w-4 mr-1" />
                  {signupErrors.fullName}
                </p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon className={`h-5 w-5 ${signupErrors.userName ? 'text-red-500' : 'text-gray-400'}`} />
                </div>
                <input
                  required
                  placeholder="Choose a username"
                  value={signupData.userName}
                  onChange={(e) => {
                    setSignupData({ ...signupData, userName: e.target.value });
                    if (signupErrors.userName) {
                      setSignupErrors({ ...signupErrors, userName: "" });
                    }
                  }}
                  className={`pl-10 w-full border ${signupErrors.userName ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'} rounded-lg px-4 py-2.5 focus:ring-2 focus:border-indigo-500 outline-none transition`}
                />
              </div>
              {signupErrors.userName && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <ExclamationCircleIcon className="h-4 w-4 mr-1" />
                  {signupErrors.userName}
                </p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <EnvelopeIcon className={`h-5 w-5 ${signupErrors.email ? 'text-red-500' : 'text-gray-400'}`} />
                </div>
                <input
                  required
                  type="email"
                  placeholder="Your email address"
                  value={signupData.email}
                  onChange={(e) => {
                    setSignupData({ ...signupData, email: e.target.value });
                    if (signupErrors.email) {
                      setSignupErrors({ ...signupErrors, email: "" });
                    }
                  }}
                  className={`pl-10 w-full border ${signupErrors.email ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'} rounded-lg px-4 py-2.5 focus:ring-2 focus:border-indigo-500 outline-none transition`}
                />
              </div>
              {signupErrors.email && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <ExclamationCircleIcon className="h-4 w-4 mr-1" />
                  {signupErrors.email}
                </p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <LockClosedIcon className={`h-5 w-5 ${signupErrors.password ? 'text-red-500' : 'text-gray-400'}`} />
                </div>
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a password"
                  value={signupData.password}
                  onChange={(e) => {
                    setSignupData({ ...signupData, password: e.target.value });
                    if (signupErrors.password) {
                      setSignupErrors({ ...signupErrors, password: "" });
                    }
                  }}
                  className={`pl-10 pr-10 w-full border ${signupErrors.password ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'} rounded-lg px-4 py-2.5 focus:ring-2 focus:border-indigo-500 outline-none transition`}
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
              {signupErrors.password && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <ExclamationCircleIcon className="h-4 w-4 mr-1" />
                  {signupErrors.password}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">Password must be at least 6 characters</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Profile Picture</label>
              <div className="flex items-center gap-4">
                <label className="cursor-pointer">
                  <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition border border-gray-300">
                    <PhotoIcon className="h-5 w-5 text-indigo-600" />
                    <span className="text-sm font-medium">Choose Image</span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
                {previewImage ? (
                  <img
                    src={previewImage}
                    alt="Preview"
                    className="w-12 h-12 rounded-full object-cover border-2 border-indigo-100"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-200 border-2 border-dashed border-gray-300 flex items-center justify-center">
                    <PhotoIcon className="h-5 w-5 text-gray-400" />
                  </div>
                )}
              </div>
              {signupErrors.profilePicture && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <ExclamationCircleIcon className="h-4 w-4 mr-1" />
                  {signupErrors.profilePicture}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">Optional. Max size: 2MB (JPEG, PNG, GIF)</p>
            </div>
            
            <div className="flex items-center">
              <input
                id="terms"
                name="terms"
                type="checkbox"
                required
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <label htmlFor="terms" className="ml-2 block text-sm text-gray-700">
                I agree to the <a href="#" className="text-indigo-600 hover:text-indigo-500">Terms</a> and <a href="#" className="text-indigo-600 hover:text-indigo-500">Privacy Policy</a>
              </label>
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
                  Creating account...
                </>
              ) : 'Create your account'}
            </button>
            
            <div className="text-center text-sm text-gray-500">
              Already have an account?{' '}
              <a
                href="/login"
                className="font-medium text-indigo-600 hover:text-indigo-500"
              >
                Sign in
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}