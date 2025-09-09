import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  HomeIcon,
  DocumentTextIcon,
  UserIcon,
  ShieldCheckIcon,
  ArrowRightOnRectangleIcon,
  ClockIcon,
  CheckBadgeIcon,
  Bars3Icon,
  XMarkIcon
} from "@heroicons/react/24/outline";

const Sidebar = ({ user, onLogout }) => {
  const location = useLocation();
  const [isOpen, setIsOpen] = React.useState(false);

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    console.log("Logout button clicked");
    if (onLogout && typeof onLogout === 'function') {
      onLogout();
    } else {
      console.error("onLogout is not a function or not provided");
      localStorage.removeItem("token");
      window.location.href = "/";
    }
  };

  const menuItems = [
    {
      name: "Home",
      path: "/",
      icon: HomeIcon,
      show: true
    },
    {
      name: user?.role === 'admin' ? "Admin Dashboard" : "Dashboard",
      path: "/dashboard",
      icon: user?.role === 'admin' ? ShieldCheckIcon : DocumentTextIcon,
      show: !!user
    },
    {
      name: "Pending Articles",
      path: "/admin/pending-articles",
      icon: ClockIcon,
      show: !!user && user.role === 'admin'
    },
    {
      name: "Approved Articles",
      path: "/admin/approved-articles",
      icon: CheckBadgeIcon,
      show: !!user && user.role === 'admin'
    },
    {
      name: "My Articles",
      path: "/my-articles",
      icon: DocumentTextIcon,
      show: !!user && user.role !== 'admin' 
    },
    {
      name: "Profile",
      path: "/profile",
      icon: UserIcon,
      show: !!user
    }
  ];

  React.useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
      >
        {isOpen ? (
          <XMarkIcon className="h-6 w-6 text-gray-700" />
        ) : (
          <Bars3Icon className="h-6 w-6 text-gray-700" />
        )}
      </button>

      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div className={`
        bg-white rounded-xl shadow-lg border border-gray-100 p-4 sm:p-6 h-screen lg:h-[calc(100vh-48px)] 
        fixed lg:sticky top-0 left-0 z-40 lg:z-auto
        transform transition-transform duration-300 ease-in-out
        w-64 lg:translate-x-0 lg:static
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        flex flex-col
      `}>
        <div className="flex justify-between items-center mb-6 sm:mb-8 lg:hidden">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Parse Articles</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-all duration-200"
          >
            <XMarkIcon className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        <div className="hidden lg:block mb-8 sm:mb-10 p-4">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Parse Articles</h2>
        </div>
        
        <nav className="flex-1 space-y-2 overflow-y-auto">
          {menuItems.map((item) => {
            if (!item.show) return null;
            
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive(item.path)
                    ? "bg-indigo-50 text-indigo-600 border-r-4 border-indigo-600 shadow-sm"
                    : "text-gray-600 hover:bg-gray-50 hover:text-indigo-600 hover:shadow-sm"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {user && (
          <div className="mt-auto pt-4 sm:pt-6 border-t border-gray-100">
            <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg transition-all duration-200 hover:shadow-sm">
              <img
                src={user.profilePicture || "/default-avatar.png"}
                alt={user.username}
                className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm transform transition-transform hover:scale-105"
                onError={(e) => {
                  e.target.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNEQUVBRkYiLz4KPHBhdGggZD0iTTIwIDIyQzIyLjIwOTEgMjIgMjQgMjAuMjA5MSAyNCAxOEMyNCAxNS43OTA5IDIyLjIwOTEgMTQgMjAgMTRDMTcuNzkwOSAxNCAxNiAxNS43OTA5IDE2IDE4QzE2IDIwLjIwOTEgMTcuNzkwOSAyMiAyMCAyMloiIGZpbGw9IiM5QzhBOEIiLz4KPHBhdGggZD0iTTIwIDI2QzE1LjU4IDI2IDEyLjA4IDI4LjY0IDExIDMyLjMyQzEzLjM2IDMzLjkyIDE2LjQ2IDM1IDIwIDM1QzIzLjU0IDM1IDI2LjY0IDMzLjkyIDI5IDMyLjMyQzI3LjkyIDI4LjY0IDI0LjQyIDI2IDIwIDI2WiIgZmlsbD0iIzlDOEE4QiIvPgo8L3N2Zz4K";
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user.username}</p>
                <p className="text-xs text-gray-600 capitalize">{user.role}</p>
              </div>
            </div>
            
            <button
              onClick={handleLogout} 
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-indigo-600 transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5" />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default Sidebar;