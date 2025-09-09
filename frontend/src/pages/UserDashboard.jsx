import React, { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { Link } from "react-router-dom";
import { getArticleStats, getNotifications, markAsRead } from "../services/articleService";
import toast from "react-hot-toast";
import {
  BellIcon,
  CheckIcon,
  DocumentTextIcon,
  ClockIcon,
  ExclamationCircleIcon
} from "@heroicons/react/24/outline";
import NotificationsModal from "../components/NotificationModal";

export default function UserDashboard({ user }) {
  const [articleStats, setArticleStats] = useState({
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0
  });
  const [notifications, setNotifications] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [error, setError] = useState(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      let statsError = false;
      let notifsError = false;

      try {
        setLoadingStats(true);
        const stats = await getArticleStats();
        if (typeof stats.total === 'undefined') throw new Error('Invalid stats format');
        setArticleStats(stats);
      } catch (err) {
        console.error("Stats fetch error:", err);
        statsError = true;
        setArticleStats({ total: 0, approved: 0, pending: 0, rejected: 0 });
      } finally {
        setLoadingStats(false);
      }

      try {
        setLoadingNotifications(true);
        const notifs = await getNotifications();
        if (!Array.isArray(notifs)) throw new Error('Invalid notifications format');
        setNotifications(notifs.filter(n => n.type === "article_rejected"));
      } catch (err) {
        console.error("Notifications fetch error:", err);
        notifsError = true;
        setNotifications([]);
      } finally {
        setLoadingNotifications(false);
      }

      if (statsError && notifsError) {
        setError("Failed to load dashboard data");
      } else if (statsError) {
        setError("Failed to load article statistics");
      } else if (notifsError) {
        setError("Failed to load notifications");
      } else {
        setError(null);
      }
    };

    fetchData();
  }, []);

  const handleMarkAsRead = async (id) => {
    try {
      await markAsRead(id);
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
      toast.success("Notification marked as read");
    } catch (err) {
      toast.error("Failed to mark as read", err);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-6 min-h-screen bg-gradient-to-b from-indigo-50 to-gray-50">
      <div className="md:col-span-1">
        <Sidebar user={user} />
      </div>
      <div className="md:col-span-4 p-4 sm:p-6 lg:p-8">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 transform transition-all hover:shadow-xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
            Welcome, {user?.username}!
          </h2>
          <p className="text-gray-600 text-sm sm:text-base mb-6">
            Your personal dashboard to manage articles and profile settings.
          </p>
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex justify-between items-center transition-all duration-200">
              {error}
              <button 
                onClick={() => window.location.reload()} 
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Retry
              </button>
            </div>
          )}
          
          {/* Article Statistics Section */}
          <div className="mb-10">
            <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-5 flex items-center gap-2">
              <DocumentTextIcon className="h-6 w-6 text-indigo-600" />
              Your Article Statistics
            </h3>
            
            {loadingStats ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="bg-gray-100 p-4 rounded-lg border border-gray-200 animate-pulse">
                    <div className="h-4 bg-gray-300 rounded w-3/4 mb-2"></div>
                    <div className="h-6 bg-gray-300 rounded w-1/2 mt-3"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 transition-all duration-200 hover:bg-blue-100 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-blue-800">Total Articles</h4>
                    <div className="bg-blue-100 p-2 rounded-full">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-blue-800 mt-2">{articleStats.total}</p>
                </div>
                
                <div className="bg-green-50 p-4 rounded-xl border border-green-100 transition-all duration-200 hover:bg-green-100 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-green-800">Approved</h4>
                    <div className="bg-green-100 p-2 rounded-full">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-green-800 mt-2">{articleStats.approved}</p>
                </div>
                
                <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 transition-all duration-200 hover:bg-yellow-100 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-yellow-800">Pending</h4>
                    <div className="bg-yellow-100 p-2 rounded-full">
                      <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-yellow-800 mt-2">{articleStats.pending}</p>
                </div>
                
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 transition-all duration-200 hover:bg-red-100 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-red-800">Rejected</h4>
                    <div className="bg-red-100 p-2 rounded-full">
                      <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-red-800 mt-2">{articleStats.rejected}</p>
                </div>
              </div>
            )}
          </div>

          {/* Notifications Section */}
          <div className="mb-10">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 flex items-center gap-2">
                <BellIcon className="h-6 w-6 text-indigo-600" />
                Notifications
              </h3>
              <button
                onClick={() => setIsNotificationsOpen(true)}
                className="bg-indigo-600 text-white px-4 sm:px-5 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2 transition-all duration-200 shadow-sm hover:shadow-md"
              >
                View Notifications
                {unreadCount > 0 && (
                  <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Notifications Modal */}
          <NotificationsModal
            isOpen={isNotificationsOpen}
            onClose={() => setIsNotificationsOpen(false)}
            notifications={notifications}
            loadingNotifications={loadingNotifications}
            handleMarkAsRead={handleMarkAsRead}
            unreadCount={unreadCount}
          />

          {/* Quick Actions Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 transition-all duration-200 hover:bg-blue-100 hover:shadow-md">
              <h3 className="text-lg font-semibold text-blue-800 mb-3">Your Articles</h3>
              <p className="text-blue-600 text-sm mb-4">Manage and create new articles</p>
              <Link 
                to="/my-articles" 
                className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-all duration-200 shadow-sm hover:shadow-md"
              >
                View My Articles
              </Link>
            </div>
            <div className="bg-green-50 p-6 rounded-xl border border-green-100 transition-all duration-200 hover:bg-green-100 hover:shadow-md">
              <h3 className="text-lg font-semibold text-green-800 mb-3">Profile Settings</h3>
              <p className="text-green-600 text-sm mb-4">Update your personal information</p>
              <Link 
                to="/profile" 
                className="inline-block bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-all duration-200 shadow-sm hover:shadow-md"
              >
                Edit Profile
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}