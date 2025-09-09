import React, { useEffect, useState } from "react";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/SignIn"; 
import Signup from "./pages/SignUp";
import AdminDashboard from "./pages/AdminDashboard"; 
import UserDashboard from "./pages/UserDashboard";
import MyArticles from "./pages/Articles";
import UserProfile from "./pages/UserProfile"; 
import EditProfile from "./pages/EditProfile"; 
import PendingArticles from "./pages/PendingArticles";
import ApprovedArticles from "./pages/ApprovedArticles";
import ProtectedRoute from "./components/ProtectedRoute";
import { getProfile } from "./services/authService";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { toast } from "react-toastify";
import ResetPassword from "./pages/ResetPassword";
import ForgotPassword from "./pages/ForgotPassword";

export default function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      getProfile()
        .then((data) => {
          setUser({
            ...data,
            token 
          });
        })
        .catch((err) => {
          console.error("Authentication error:", err);
          localStorage.removeItem("token");
          setUser(null);
          toast.error("Session expired. Please login again.");
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  const handleLogin = (data) => {
    if (data.token) {
      localStorage.setItem("token", data.token);
    }
    setUser({
      ...(data.user || data),
      token: data.token
    });
    navigate("/dashboard");
    toast.success("Login successful!");
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
    navigate("/");
    toast.success("Logged out successfully");
  };

  const handleProfileUpdate = (updatedUser) => {
    setUser(prev => ({
      ...prev,
      ...updatedUser
    }));
    toast.success("Profile updated successfully!");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header user={user} onLogout={logout} />
      <main className="flex-1 container mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Home user={user} />} />
          <Route 
            path="/login" 
            element={
              user ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Login onLogin={handleLogin} />
              )
            } 
          />
          <Route 
            path="/signup" 
            element={
              user ? (
                <Navigate to="/login" replace /> 
              ) : (
                <Signup onLogin={handleLogin} />
              )
            } 
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute user={user}>
                {user?.role === 'admin' ? <AdminDashboard user={user} /> : <UserDashboard user={user} />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-articles"
            element={
              <ProtectedRoute user={user}>
                <MyArticles user={user} />
              </ProtectedRoute>
            }
          />
          {/* User Profile Route */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute user={user}>
                <UserProfile 
                  user={user} 
                  onProfileUpdate={handleProfileUpdate} 
                  onLogout={logout} 
                />
              </ProtectedRoute>
            }
          />
          {/* Edit Profile Route */}
          <Route
            path="/edit-profile"
            element={
              <ProtectedRoute user={user}>
                <EditProfile 
                  onProfileUpdate={handleProfileUpdate} 
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/pending-articles"
            element={
              <ProtectedRoute user={user}>
                {user?.role === 'admin' ? <PendingArticles user={user} /> : <Navigate to="/dashboard" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/approved-articles"
            element={
              <ProtectedRoute user={user}>
                {user?.role === 'admin' ? <ApprovedArticles user={user} /> : <Navigate to="/dashboard" replace />}
              </ProtectedRoute>
            }
          />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
} 