// src/components/Notifications.jsx
import React, { useEffect, useState } from "react";
import { getNotifications, markNotificationAsRead } from "../services/notificationService";
import toast from "react-hot-toast";
import { BellIcon, XMarkIcon } from "@heroicons/react/24/outline";

export default function Notifications({ user }) {
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadNotifications = async () => {
    setIsLoading(true);
    try {
      const data = await getNotifications();
      setNotifications(data);
      if (data.length > 0) {
        toast.success(`You have ${data.length} new notification(s)!`, {
          icon: "🔔",
          style: {
            borderRadius: "10px",
            background: "#4ADE80",
            color: "#fff",
          },
        });
      }
    } catch (err) {
      console.error("Error loading notifications:", err);
      toast.error("Failed to load notifications");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadNotifications();
    }
  }, [user]);

  const handleMarkAsRead = async (notificationId) => {
    try {
      await markNotificationAsRead(notificationId);
      setNotifications((prev) => prev.filter((n) => n.objectId !== notificationId));
      toast.success("Notification marked as read");
    } catch (err) {
      console.error("Error marking notification as read:", err);
      toast.error("Failed to mark notification as read");
    }
  };

  return (
    <div className="relative">
      <BellIcon className="h-6 w-6 text-gray-600 cursor-pointer" />
      {notifications.length > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
          {notifications.length}
        </span>
      )}
      {notifications.length > 0 && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Notifications</h3>
            {isLoading ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-600"></div>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.objectId}
                  className="p-3 border-b border-gray-100 last:border-b-0"
                >
                  <div className="flex justify-between items-start">
                    <p className="text-sm text-gray-600">{notification.message}</p>
                    <button
                      onClick={() => handleMarkAsRead(notification.objectId)}
                      className="p-1 text-gray-500 hover:text-gray-700"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(notification.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}