import React from "react";
import { Navigate, useLocation } from "react-router-dom";

export default function ProtectedRoute({ children, user, requireAdmin = false }) {
  const location = useLocation();
  if (!user) {
  
    return <Navigate to={`/auth?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (requireAdmin && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return children;
}
