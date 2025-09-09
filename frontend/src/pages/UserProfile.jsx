import React, { useState, useEffect } from "react";
import { getProfile, deleteProfile } from "../services/authService";
import { toast } from "react-toastify";
import { PencilIcon, TrashIcon, ArrowLeftIcon, EnvelopeIcon, UserIcon, CalendarIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";

export default function UserProfile({ user, onLogout }) {
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = user || await getProfile();
        setProfileData({
          ...data,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date() // Ensure valid date
        });
      } catch (err) {
        toast.error("Failed to load profile");
        console.error(err);
      }
    };
    loadProfile();
  }, [user]);

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete your profile? This action cannot be undone.")) {
      try {
        setLoading(true);
        await deleteProfile();
        toast.success("Profile deleted successfully");
        localStorage.removeItem("token");
        if (onLogout) onLogout();
      } catch (err) {
        toast.error("Failed to delete profile");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
  };

  if (!profileData) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
      <button 
        onClick={() => window.history.back()} 
        className="flex items-center text-indigo-600 hover:text-indigo-800 mb-4 sm:mb-6 transition-colors duration-200 text-sm sm:text-base"
      >
        <ArrowLeftIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
        <span className="font-medium">Back</span>
      </button>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden transform transition-all hover:shadow-xl">
        <div className="h-32 sm:h-40 bg-gradient-to-r from-indigo-600 via-blue-500 to-teal-500 relative">
          <div className="absolute inset-0 bg-black/20"></div>
        </div>

        <div className="px-4 sm:px-6 py-6 relative">
          <div className="absolute -top-12 sm:-top-16 left-4 sm:left-6 border-4 border-white rounded-full overflow-hidden shadow-lg transform transition-transform hover:scale-105">
            <img
              src={profileData.profilePicture || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"}
              alt="Profile"
              className="h-20 w-20 sm:h-28 sm:w-28 object-cover"
              onError={(e) => {
                e.target.src = "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
              }}
            />
          </div>

          <div className="absolute top-4 right-4 flex flex-col sm:flex-row sm:space-x-3 space-y-2 sm:space-y-0">
            <Link
              to="/edit-profile"
              className="flex items-center space-x-2 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-200 transition-all duration-200 shadow-sm hover:shadow-md text-sm font-medium"
            >
              <PencilIcon className="h-4 w-4" />
              <span>Edit Profile</span>
            </Link>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="flex items-center space-x-2 bg-red-100 text-red-700 px-4 py-2 rounded-lg hover:bg-red-200 transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 text-sm font-medium"
            >
              <TrashIcon className="h-4 w-4" />
              <span>{loading ? "Deleting..." : "Delete Profile"}</span>
            </button>
          </div>

          <div className="ml-0 sm:ml-36 mt-16 sm:mt-2">
            <div className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{profileData.fullName}</h1>
              <p className="text-indigo-600 font-medium text-sm sm:text-base mt-1">@{profileData.username}</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 transition-all duration-200 hover:bg-gray-100">
                <div className="flex items-center mb-2">
                  <EnvelopeIcon className="h-5 w-5 text-gray-500 mr-2" />
                  <h3 className="text-sm font-medium text-gray-600">Email</h3>
                </div>
                <p className="text-gray-900 text-sm sm:text-base">{profileData.email}</p>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 transition-all duration-200 hover:bg-gray-100">
                <div className="flex items-center mb-2">
                  <UserIcon className="h-5 w-5 text-gray-500 mr-2" />
                  <h3 className="text-sm font-medium text-gray-600">Username</h3>
                </div>
                <p className="text-gray-900 text-sm sm:text-base">@{profileData.username}</p>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 transition-all duration-200 hover:bg-gray-100">
                <div className="flex items-center mb-2">
                  <CalendarIcon className="h-5 w-5 text-gray-500 mr-2" />
                  <h3 className="text-sm font-medium text-gray-600">Member Since</h3>
                </div>
                <p className="text-gray-900 text-sm sm:text-base">
                  {profileData.createdAt
                    ? new Date(profileData.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}