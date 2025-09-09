import React, { useState } from "react";
import { Link } from "react-router-dom";
import { HomeIcon, UserCircleIcon, CogIcon, BookOpenIcon, ArrowLeftOnRectangleIcon, Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";

export default function Header({ user, onLogout }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50 border-b border-gray-100">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            className="md:hidden text-gray-700 hover:text-indigo-600 transition-colors duration-200"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
          </button>
          <Link to="/" className="flex items-center gap-2">
            <BookOpenIcon className="h-7 w-7 text-indigo-600" />
            <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent transition-transform duration-200 hover:scale-105">ParseBlog</span>
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          {renderNavItems(user, onLogout)}
        </nav>

        {mobileMenuOpen && (
          <div className="absolute top-full left-0 right-0 bg-white shadow-lg md:hidden py-6 px-6 space-y-4 border-t border-gray-100 z-40">
            {renderNavItems(user, onLogout, true)}
          </div>
        )}
      </div> 
    </header>
  );
}

function renderNavItems(user, onLogout, isMobile = false) {
  return (
    <>
      <Link to="/" className={`flex items-center gap-2 ${isMobile ? 'py-3 text-base' : 'text-sm font-medium'} text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-all duration-200`}>
        <HomeIcon className="h-5 w-5" />
        <span>Home</span>
      </Link>
      {user ? (
        <>
          <Link to="/dashboard" className={`flex items-center gap-2 ${isMobile ? 'py-3 text-base' : 'text-sm font-medium'} text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-all duration-200`}>
            <CogIcon className="h-5 w-5" />
            <span>Dashboard</span>
          </Link>
          <button 
            onClick={onLogout} 
            className={`flex items-center gap-2 ${isMobile ? 'py-3 text-base' : 'text-sm font-medium'} text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-all duration-200`}
          >
            <ArrowLeftOnRectangleIcon className="h-5 w-5" />
            <span>Logout</span>
          </button>
          <Link to="/profile" className="flex items-center gap-2 group">
            <img 
              src={user.profilePicture || "/default-avatar.png"} 
              alt="avatar" 
              className="w-9 h-9 rounded-full object-cover border-2 border-indigo-100 shadow-sm group-hover:scale-105 transition-transform duration-200" 
            />
            {!isMobile && <span className="text-sm font-medium text-gray-600 group-hover:text-indigo-600 transition-colors duration-200">{user.username}</span>}
          </Link>
        </>
      ) :  (
        <div className={`flex ${isMobile ? 'flex-col space-y-4' : 'items-center gap-4'}`}>
          <Link 
            to="/login" 
            className={`flex items-center gap-2 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-3 py-2 rounded-lg ${isMobile ? 'py-3 text-base' : 'text-sm font-medium'} transition-all duration-200`}
          >
            <UserCircleIcon className="h-5 w-5" />
            <span>Login</span>
          </Link>
          <Link 
            to="/signup" 
            className={`bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 sm:px-5 py-2 rounded-lg hover:shadow-md transition-all duration-200 shadow-sm flex items-center gap-2 ${isMobile ? 'w-full justify-center' : ''}`}
          >
            <span>Sign Up</span>
          </Link>
        </div>
      )}
    </>
  );
}