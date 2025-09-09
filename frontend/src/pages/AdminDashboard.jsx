import React, { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { getAllUsers, deleteUser, deleteAnyArticle, updateAnyArticle, getStatistics, declineArticle } from "../services/adminService";
import toast from "react-hot-toast";
import {
  ShieldCheckIcon,
  TrashIcon,
  UserIcon,
  EnvelopeIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  XMarkIcon,
  CheckIcon,
  ChevronLeftIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  ClockIcon,
  ChartBarIcon
} from "@heroicons/react/24/outline";
import { FunnelIcon } from "@heroicons/react/20/solid";

export default function AdminDashboard({ user }) {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editingArticle, setEditingArticle] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [editForm, setEditForm] = useState({
    title: "",
    content: ""
  });
  const [showDeleteModal, setShowDeleteModal] = useState({
    visible: false,
    type: "",
    id: null,
    title: ""
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    itemsPerPage: 10
  });
  const [statistics, setStatistics] = useState({
    totalArticles: 0,
    pendingArticles: 0,
    approvedArticles: 0,
    totalUsers: 0
  });

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const [usersData, statsData] = await Promise.all([
        getAllUsers(),
        getStatistics()
      ]);
      setUsers(usersData);
      setFilteredUsers(usersData);
      setStatistics(statsData);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load data", {
        style: {
          borderRadius: '10px',
          background: '#F87171',
          color: '#fff',
        },
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [user]);

  useEffect(() => {
    let results = users;
    
    if (searchTerm) {
      results = results.filter(u => 
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.fullName && u.fullName.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    if (filterRole !== "all") {
      results = results.filter(u => u.role === filterRole);
    }
    
    setFilteredUsers(results);
  }, [searchTerm, filterRole, users]);

  const handleDeleteUser = async (id) => {
    try {
      await deleteUser(id);
      toast.success("User deleted successfully", {
        icon: '🗑️',
        style: {
          borderRadius: '10px',
          background: '#4ADE80',
          color: '#fff',
        },
      });
      if (selectedUser?.id === id) {
        setSelectedUser(null);
      }
      loadUsers();
    } catch (err) {
      toast.error("Failed to delete user",err, {
        icon: '⚠️',
        style: {
          borderRadius: '10px',
          background: '#F87171',
          color: '#fff',
        },
      });
    } finally {
      setShowDeleteModal({ visible: false, type: "", id: null, title: "" });
    }
  };

  const handleDeleteArticle = async (id) => {
    try {
      await deleteAnyArticle(id);
      toast.success("Article deleted successfully", {
        style: {
          borderRadius: '10px',
          background: '#4ADE80',
          color: '#fff',
        },
      });
      loadUsers();
      setSelectedUser(prev => ({
        ...prev,
        articles: prev.articles.filter(a => a.id !== id)
      }));
    } catch (err) {
      toast.error("Failed to delete article", err,{
        style: {
          borderRadius: '10px',
          background: '#F87171',
          color: '#fff',
        },
      });
    } finally {
      setShowDeleteModal({ visible: false, type: "", id: null, title: "" });
    }
  };

  const handleDecline = async (id) => {
    try {
      await declineArticle(id);
      toast.success("Article rejected successfully", {
        style: {
          borderRadius: '10px',
          background: '#4ADE80',
          color: '#fff',
        },
      });
      loadUsers();
      if (selectedUser) {
        setSelectedUser(prev => ({
          ...prev,
          articles: prev.articles.map(a => 
            a.id === id ? { ...a, status: "rejected", isApproved: false } : a
          )
        }));
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to reject article", {
        style: {
          borderRadius: '10px',
          background: '#F87171',
          color: '#fff',
        },
      });
    }
  };

  const handleEditArticle = (article) => {
    setEditingArticle(article.id);
    setEditForm({
      title: article.title,
      content: article.content
    });
  };

  const handleUpdateArticle = async () => {
    try {
      await updateAnyArticle(editingArticle, editForm);
      toast.success("Article updated successfully", {
        style: {
          borderRadius: '10px',
          background: '#4ADE80',
          color: '#fff',
        },
      });
      setEditingArticle(null);
      loadUsers();
      setSelectedUser(prev => ({
        ...prev,
        articles: prev.articles.map(a => 
          a.id === editingArticle ? { ...a, ...editForm } : a
        )
      }));
    } catch (err) {
      toast.error("Failed to update article",err, {
        style: {
          borderRadius: '10px',
          background: '#F87171',
          color: '#fff',
        },
      });
    }
  };

  const confirmDelete = (type, id, title) => {
    setShowDeleteModal({
      visible: true,
      type,
      id,
      title
    });
  };

  const confirmDecline = (id, title) => {
    setShowDeleteModal({
      visible: true,
      type: 'decline',
      id,
      title
    });
  };

  const handlePageChange = (page) => {
    setPagination(prev => ({ ...prev, currentPage: page }));
  };

  const paginatedArticles = selectedUser?.articles?.slice(
    (pagination.currentPage - 1) * pagination.itemsPerPage,
    pagination.currentPage * pagination.itemsPerPage
  ) || [];

  const renderUserStats = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
      <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 transition-all duration-200 hover:bg-indigo-100 hover:shadow-md">
        <div className="flex items-center gap-2 text-indigo-600 font-medium">
          <UserIcon className="h-5 w-5" />
          <span>Total Users</span>
        </div>
        <div className="text-2xl font-bold text-gray-900 mt-2">{statistics.totalUsers}</div>
      </div>
      <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 transition-all duration-200 hover:bg-blue-100 hover:shadow-md">
        <div className="flex items-center gap-2 text-blue-600 font-medium">
          <DocumentTextIcon className="h-5 w-5" />
          <span>Total Articles</span>
        </div>
        <div className="text-2xl font-bold text-gray-900 mt-2">{statistics.totalArticles}</div>
      </div>
      <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 transition-all duration-200 hover:bg-yellow-100 hover:shadow-md">
        <div className="flex items-center gap-2 text-yellow-600 font-medium">
          <ClockIcon className="h-5 w-5" />
          <span>Pending Articles</span>
        </div>
        <div className="text-2xl font-bold text-gray-900 mt-2">{statistics.pendingArticles}</div>
      </div>
      <div className="bg-green-50 p-4 rounded-xl border border-green-100 transition-all duration-200 hover:bg-green-100 hover:shadow-md">
        <div className="flex items-center gap-2 text-green-600 font-medium">
          <CheckIcon className="h-5 w-5" />
          <span>Approved Articles</span>
        </div>
        <div className="text-2xl font-bold text-gray-900 mt-2">{statistics.approvedArticles}</div>
      </div>
    </div>
  );

  const renderDeleteModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full mx-4 shadow-lg transform transition-all">
        <div className="flex items-center gap-3 mb-4">
          <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900">
            {showDeleteModal.type === 'decline' ? 'Reject Article' : `Delete ${showDeleteModal.type}`}
          </h3>
        </div>
        <p className="text-gray-600 text-sm sm:text-base mb-6">
          {showDeleteModal.type === 'decline' 
            ? "Are you sure you want to reject this article?"
            : `Are you sure you want to delete this ${showDeleteModal.type}?`
          }
          {showDeleteModal.type === 'user' && " All their articles will also be deleted."}
          {showDeleteModal.title && (
            <span className="font-medium block mt-2 text-gray-800">"{showDeleteModal.title}"</span>
          )}
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setShowDeleteModal({ visible: false, type: "", id: null, title: "" })}
            className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (showDeleteModal.type === 'user') {
                handleDeleteUser(showDeleteModal.id);
              } else if (showDeleteModal.type === 'article') {
                handleDeleteArticle(showDeleteModal.id);
              } else if (showDeleteModal.type === 'decline') {
                handleDecline(showDeleteModal.id);
                setShowDeleteModal({ visible: false, type: "", id: null, title: "" });
              }
            }}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm hover:shadow-md transition-all duration-200 ${
              showDeleteModal.type === 'decline' 
                ? "bg-yellow-600 text-white hover:bg-yellow-700"
                : "bg-red-600 text-white hover:bg-red-700"
            }`}
          >
            {showDeleteModal.type === 'decline' ? (
              <>
                <XMarkIcon className="h-5 w-5" />
                <span>Reject</span>
              </>
            ) : (
              <>
                <TrashIcon className="h-5 w-5" />
                <span>Delete</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  const renderArticleCards = () => {
    if (selectedUser.articles?.length === 0) {
      return (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-100">
          <p className="text-gray-600 text-sm sm:text-base font-medium">This user hasn't written any articles yet</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {paginatedArticles.map(article => (
            <div key={article.id} className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-200 h-full flex flex-col bg-white">
              {editingArticle === article.id ? (
                <div className="p-4 sm:p-6 bg-gray-50 flex-grow flex flex-col">
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                    />
                  </div>
                  <div className="mb-4 flex-grow">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                    <textarea
                      value={editForm.content}
                      onChange={(e) => setEditForm({...editForm, content: e.target.value})}
                      rows={5}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                    />
                  </div>
                  <div className="flex justify-end gap-2 mt-auto">
                    <button
                      onClick={() => setEditingArticle(null)}
                      className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 flex items-center gap-2 transition-all duration-200 shadow-sm"
                    >
                      <XMarkIcon className="h-5 w-5" />
                      Cancel
                    </button>
                    <button
                      onClick={handleUpdateArticle}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      <CheckIcon className="h-5 w-5" />
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 sm:p-6 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="text-lg font-semibold text-gray-900 line-clamp-2">{article.title}</h4>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditArticle(article)}
                        className="p-2 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-full transition-all duration-200"
                        title="Edit Article"
                      >
                        <PencilSquareIcon className="h-5 w-5" />
                      </button>
                      {article.status !== "rejected" && !article.isApproved && (
                        <button
                          onClick={() => confirmDecline(article.id, article.title)}
                          className="p-2 text-yellow-600 hover:text-yellow-800 hover:bg-yellow-50 rounded-full transition-all duration-200"
                          title="Reject Article"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      )}
                      <button
                        onClick={() => confirmDelete('article', article.id, article.title)}
                        className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-full transition-all duration-200"
                        title="Delete Article"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex-grow">
                    <p className="text-gray-600 text-sm line-clamp-4 mb-4">{article.content}</p>
                  </div>
                  <div className="mt-auto pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <CalendarIcon className="h-4 w-4" />
                      <span>{new Date(article.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </div>
                    {article.updatedAt !== article.createdAt && (
                      <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                        <ClockIcon className="h-4 w-4" />
                        <span>Updated: {new Date(article.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                      </div>
                    )}
                    <div className="mt-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        article.isApproved 
                          ? "bg-green-100 text-green-800" 
                          : article.status === "rejected"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}>
                        {article.isApproved ? "Approved" : 
                         article.status === "rejected" ? "Rejected" : "Pending Approval"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {selectedUser.articles?.length > pagination.itemsPerPage && (
          <div className="flex justify-center mt-8">
            <nav className="inline-flex rounded-lg shadow-sm bg-white border border-gray-200 -space-x-px" aria-label="Pagination">
              <button
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                disabled={pagination.currentPage === 1}
                className="relative inline-flex items-center px-3 sm:px-4 py-2 rounded-l-lg border-r border-gray-200 text-sm font-medium text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                <span className="sr-only">Previous</span>
                &larr; Prev
              </button>
              {Array.from({ length: Math.ceil(selectedUser.articles.length / pagination.itemsPerPage) }).map((_, index) => (
                <button
                  key={index}
                  onClick={() => handlePageChange(index + 1)}
                  className={`relative inline-flex items-center px-4 sm:px-5 py-2 border-r border-gray-200 text-sm font-medium ${
                    pagination.currentPage === index + 1
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-indigo-50 hover:text-indigo-600'
                  } transition-all duration-200`}
                >
                  {index + 1}
                </button>
              ))}
              <button
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                disabled={pagination.currentPage === Math.ceil(selectedUser.articles.length / pagination.itemsPerPage)}
                className="relative inline-flex items-center px-3 sm:px-4 py-2 rounded-r-lg text-sm font-medium text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                <span className="sr-only">Next</span>
                Next &rarr;
              </button>
            </nav>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-6 min-h-screen bg-gradient-to-b from-indigo-50 to-gray-50">
      <div className="md:col-span-1">
        <Sidebar user={user} />
      </div>
      <div className="md:col-span-4 p-4 sm:p-6 lg:p-8">
        {!selectedUser ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 transform transition-all hover:shadow-xl">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 sm:mb-8 gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
                  <ShieldCheckIcon className="h-6 w-6 text-indigo-600" />
                  <span>Admin Dashboard</span>
                </h2>
                <p className="text-gray-600 text-sm sm:text-base mt-2">
                  Manage all users and their content
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={loadUsers}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-4 sm:px-5 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 hover:shadow-md transition-all duration-200"
                >
                  <ArrowPathIcon className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {renderUserStats()}

            <div className="mb-6 sm:mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <MagnifyingGlassIcon className="h-5 w-5 text-gray-500 group-hover:text-indigo-600 transition-colors duration-200" />
                </div>
                <input
                  type="text"
                  placeholder="Search users by name, username, or email..."
                  className="pl-12 w-full px-4 py-3 text-sm border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <FunnelIcon className="h-5 w-5 text-gray-500 group-hover:text-indigo-600 transition-colors duration-200" />
                </div>
                <select
                  className="pl-12 w-full px-4 py-3 text-sm border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 appearance-none"
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                >
                  <option value="all">All Roles</option>
                  <option value="user">Regular Users</option>
                  <option value="admin">Admins</option>
                </select>
              </div>
            </div>

            {isLoading && filteredUsers.length === 0 ? (
              <div className="flex justify-center py-12">
                <ArrowPathIcon className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-gray-600 text-sm sm:text-base font-medium">No users found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredUsers.map(u => (
                  <div
                    key={u.id}
                    onClick={() => {
                      setSelectedUser(u);
                      setPagination({ currentPage: 1, itemsPerPage: 10 });
                    }}
                    className="group bg-white p-4 sm:p-5 rounded-xl border border-gray-100 flex items-center justify-between hover:shadow-lg cursor-pointer transition-all duration-200"
                  >
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <img
                          src={u.profilePicture || "/default-avatar.png"}
                          alt={u.username}
                          className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm transform transition-transform group-hover:scale-105"
                        />
                        {u.role === 'admin' && (
                          <div className="absolute -bottom-1 -right-1 bg-purple-500 rounded-full p-1">
                            <ShieldCheckIcon className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 text-sm sm:text-base group-hover:text-indigo-600 transition-colors duration-200">
                          {u.fullName || "No name"} (@{u.username})
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                          <EnvelopeIcon className="h-4 w-4" />
                          <span>{u.email}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span
                            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                              u.role === "admin"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {u.role}
                          </span>
                          <span className="flex items-center gap-1 text-xs px-2.5 py-1 bg-gray-100 text-gray-800 rounded-full">
                            <DocumentTextIcon className="h-3 w-3" />
                            {u.articles?.length || 0} articles
                          </span>
                          <span className="flex items-center gap-1 text-xs px-2.5 py-1 bg-green-100 text-green-800 rounded-full">
                            <CheckIcon className="h-3 w-3" />
                            {u.approvedArticlesCount || 0} approved
                          </span>
                          <span className="flex items-center gap-1 text-xs px-2.5 py-1 bg-yellow-100 text-yellow-800 rounded-full">
                            <ClockIcon className="h-3 w-3" />
                            {u.pendingArticlesCount || 0} pending
                          </span>
                          <span className="flex items-center gap-1 text-xs px-2.5 py-1 bg-red-100 text-red-800 rounded-full">
                            <XMarkIcon className="h-3 w-3" />
                            {u.rejectedArticlesCount || 0} rejected
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDelete('user', u.id, u.username);
                        }}
                        className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200"
                        title="Delete User"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 transform transition-all hover:shadow-xl">
            <div className="flex justify-between items-center mb-6 sm:mb-8">
              <button
                onClick={() => setSelectedUser(null)}
                className="flex items-center gap-2 text-gray-600 hover:text-indigo-600 px-3 py-2 rounded-lg hover:bg-gray-50 transition-all duration-200"
              >
                <ChevronLeftIcon className="h-5 w-5" />
                <span>Back to all users</span>
              </button>
              <button
                onClick={loadUsers}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 sm:px-5 py-2 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-all duration-200"
              >
                <ArrowPathIcon className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-4 sm:gap-6 mb-8 sm:mb-10 pb-6 border-b border-gray-100">
              <div className="relative">
                <img
                  src={selectedUser.profilePicture || "/default-avatar.png"}
                  alt={selectedUser.username}
                  className="w-16 h-16 rounded-full object-cover border-4 border-white shadow-lg transform transition-transform hover:scale-105"
                />
                {selectedUser.role === 'admin' && (
                  <div className="absolute -bottom-1 -right-1 bg-purple-500 rounded-full p-1.5">
                    <ShieldCheckIcon className="h-4 w-4 text-white" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  {selectedUser.fullName || "No name"} (@{selectedUser.username})
                </h2>
                <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 mt-2">
                  <span className="flex items-center gap-2 text-gray-600 text-sm sm:text-base">
                    <EnvelopeIcon className="h-5 w-5" />
                    {selectedUser.email}
                  </span>
                  <span
                    className={`text-sm px-3 py-1 rounded-full font-medium mt-2 sm:mt-0 ${
                      selectedUser.role === "admin"
                        ? "bg-purple-100 text-purple-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {selectedUser.role}
                  </span>
                </div>
              </div>
              <button
                onClick={() => confirmDelete('user', selectedUser.id, selectedUser.username)}
                className="flex items-center gap-2 px-4 sm:px-5 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 hover:shadow-md transition-all duration-200 shadow-sm self-start sm:self-center"
              >
                <TrashIcon className="h-5 w-5" />
                Delete User
              </button>
            </div>

            <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-4 sm:mb-5 flex items-center gap-2">
              <DocumentTextIcon className="h-6 w-6 text-indigo-600" />
              Articles ({selectedUser.articles?.length || 0})
              <span className="text-sm font-normal text-gray-600 ml-2">
                (Showing {paginatedArticles.length} of {selectedUser.articles?.length})
              </span>
            </h3>

            {renderArticleCards()}
          </div>
        )}
      </div>
      {showDeleteModal.visible && renderDeleteModal()}
    </div>
  );
}