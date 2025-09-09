import React from "react";
import { Link } from "react-router-dom";
import { BellIcon, CheckIcon, ClockIcon, DocumentTextIcon, ExclamationCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";

const NotificationsModal = ({ isOpen, onClose, notifications, loadingNotifications, handleMarkAsRead, unreadCount }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <BellIcon className="h-6 w-6 text-indigo-600" />
            Notifications
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {unreadCount > 0 && (
          <div className="mb-4">
            <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
              {unreadCount} unread
            </span>
          </div>
        )}

        {loadingNotifications ? (
          <div className="space-y-4">
            {[1, 2, 3].map((item) => (
              <div key={item} className="bg-gray-100 p-4 rounded-lg border border-gray-200 animate-pulse">
                <div className="h-4 bg-gray-300 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-300 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 text-center text-gray-500">
            No notifications yet
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={`p-4 rounded-lg border ${
                  notif.read ? "bg-gray-50 border-gray-200" : "bg-red-50 border-red-200"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <ExclamationCircleIcon className="h-5 w-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{notif.message}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <ClockIcon className="h-4 w-4" />
                        {new Date(notif.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {!notif.read && (
                    <button
                      onClick={() => handleMarkAsRead(notif.id)}
                      className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    >
                      <CheckIcon className="h-4 w-4" />
                      Mark as read
                    </button>
                  )}
                </div>
                {notif.articleId && (
                  <Link
                    to={`/my-articles`}
                    className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    onClick={onClose}
                  >
                    <DocumentTextIcon className="h-4 w-4" />
                    View Article
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationsModal;