import React, { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { getMyArticles, createArticle, updateArticle, deleteArticle } from "../services/articleService";
import ArticleForm from "../components/ArticleForm";
import ArticleCard from "../components/ArticleCard";
import toast from "react-hot-toast";
import {
  PlusIcon,
  XMarkIcon,
  PencilSquareIcon,
  TrashIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon
} from "@heroicons/react/24/outline";

// Custom date formatting function
const formatDate = (dateString) => {
  const date = new Date(dateString);
  const options = { day: '2-digit', month: 'long', year: 'numeric' };
  return date.toLocaleDateString('en-US', options).replace(/,/, '');
};

export default function MyArticles({ user }) {
  const [articles, setArticles] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState({ visible: false, id: null, title: "" });
  const articlesPerPage = 6;

  const load = () => {
    setIsLoading(true);
    getMyArticles()
      .then(data => {
        setArticles(data);
      })
      .catch(err => {
        console.error(err);
        toast.error("Failed to load articles", {
          icon: '⚠️',
          style: {
            borderRadius: '10px',
            background: '#F87171',
            color: '#fff',
          },
        });
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { load(); }, []);

  const indexOfLastArticle = currentPage * articlesPerPage;
  const indexOfFirstArticle = indexOfLastArticle - articlesPerPage;
  const currentArticles = articles.slice(indexOfFirstArticle, indexOfLastArticle);
  const totalPages = Math.ceil(articles.length / articlesPerPage);

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  const handleCreate = async (formData) => {
    try {
      await createArticle(formData);
      toast.success("Article created successfully!", {
        icon: '🎉',
        style: {
          borderRadius: '10px',
          background: '#4ADE80',
          color: '#fff',
        },
      });
      setShowForm(false);
      load();
      setCurrentPage(1);
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to create article", {
        icon: '⚠️',
        style: {
          borderRadius: '10px',
          background: '#F87171',
          color: '#fff',
        },
      });
    }
  };

  const handleUpdate = async (formData) => {
    try {
      await updateArticle(editing.id, formData);
      toast.success("Article updated successfully!", {
        icon: '👏',
        style: {
          borderRadius: '10px',
          background: '#4ADE80',
          color: '#fff',
        },
      });
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to update article", {
        icon: '⚠️',
        style: {
          borderRadius: '10px',
          background: '#F87171',
          color: '#fff',
        },
      });
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteArticle(id);
      toast.success("Article deleted successfully!", {
        icon: '🗑️',
        style: {
          borderRadius: '10px',
          background: '#4ADE80',
          color: '#fff',
        },
      });
      load();
      if (currentArticles.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to delete article", {
        icon: '⚠️',
        style: {
          borderRadius: '10px',
          background: '#F87171',
          color: '#fff',
        },
      });
    } finally {
      setShowDeleteModal({ visible: false, id: null, title: "" });
    }
  };

  const confirmDelete = (id, title) => {
    setShowDeleteModal({ visible: true, id, title });
  };

  const renderDeleteModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full mx-4 shadow-lg transform transition-all">
        <div className="flex items-center gap-3 mb-4">
          <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Delete Article</h3>
        </div>
        <p className="text-gray-600 text-sm sm:text-base mb-6">
          Are you sure you want to delete this article?
          <span className="font-medium block mt-2 text-gray-800">"{showDeleteModal.title}"</span>
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setShowDeleteModal({ visible: false, id: null, title: "" })}
            className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-all duration-200 shadow-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => handleDelete(showDeleteModal.id)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 transition-all duration-200 shadow-sm hover:shadow-md"
          >
            <TrashIcon className="h-5 w-5" />
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-6 min-h-screen bg-gradient-to-b from-indigo-50 to-gray-50">
      <div className="md:col-span-1">
        <Sidebar user={user} />
      </div>
      <div className="md:col-span-4 p-4 sm:p-6 lg:p-8">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 transform transition-all hover:shadow-xl">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 sm:mb-8 gap-4">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <DocumentTextIcon className="h-6 w-6 text-indigo-600" />
              <span>My Articles</span>
            </h2>
            <div className="flex gap-3">
              <button
                onClick={load}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 sm:px-5 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 hover:shadow-md transition-all duration-200 shadow-sm"
              >
                <ArrowPathIcon className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
              <button
                onClick={() => setShowForm(s => !s)}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 sm:px-5 py-2 rounded-lg hover:bg-indigo-700 hover:shadow-md transition-all duration-200 shadow-sm"
              >
                {showForm ? (
                  <>
                    <XMarkIcon className="h-5 w-5" />
                    <span>Close</span>
                  </>
                ) : (
                  <>
                    <PlusIcon className="h-5 w-5" />
                    <span>New Article</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {showForm && (
            <div className="mb-8 sm:mb-10 bg-gray-50 p-6 sm:p-8 rounded-xl border border-gray-100 shadow-sm">
              <h3 className="text-lg sm:text-xl font-semibold mb-4 sm:mb-6 text-gray-900">Create New Article</h3>
              <ArticleForm onSubmit={handleCreate} />
            </div>
          )}

          {editing && (
            <div className="mb-8 sm:mb-10 bg-indigo-50 p-6 sm:p-8 rounded-xl border border-indigo-100 shadow-sm">
              <div className="flex justify-between items-center mb-4 sm:mb-6">
                <h3 className="text-lg sm:text-xl font-semibold text-indigo-900">Editing Article</h3>
                <button
                  onClick={() => setEditing(null)}
                  className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-all duration-200"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
              <ArticleForm initial={editing} onSubmit={handleUpdate} submitLabel="Update Article" />
            </div>
          )}

          {isLoading && articles.length === 0 ? (
            <div className="flex justify-center py-12">
              <ArrowPathIcon className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : currentArticles.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-100 shadow-sm">
              <p className="text-gray-600 text-sm sm:text-base font-medium">You haven't created any articles yet</p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 sm:mt-6 inline-flex items-center gap-2 bg-indigo-600 text-white px-4 sm:px-5 py-2 sm:py-3 rounded-lg hover:bg-indigo-700 hover:shadow-md transition-all duration-200 shadow-sm"
              >
                <PlusIcon className="h-5 w-5" />
                <span>Create Your First Article</span>
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {currentArticles.map(a => (
                  <div key={a.id} className="bg-white border border-gray-100 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex flex-col">
                    <ArticleCard 
                      article={{ ...a, createdAt: formatDate(a.createdAt), updatedAt: a.updatedAt ? formatDate(a.updatedAt) : null }} 
                      onRead={() => setSelectedArticle({ ...a, createdAt: formatDate(a.createdAt), updatedAt: a.updatedAt ? formatDate(a.updatedAt) : null })} 
                    />
                    {a.status === "rejected" && a.rejectionReason && (
                      <div className="mx-4 sm:mx-6 mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 text-red-700 rounded-lg text-sm shadow-sm">
                        Rejection Reason: {a.rejectionReason}
                      </div>
                    )}
                    <div className="p-4 sm:p-6 border-t border-gray-100 flex flex-col items-center">
                      <div className="flex gap-2 sm:gap-3 mb-3 w-full justify-end">
                        <button
                          onClick={() => setEditing(a)}
                          className="inline-flex items-center gap-1 px-3 sm:px-4 py-1.5 sm:py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 hover:shadow-md transition-all duration-200 text-sm font-medium shadow-sm"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => confirmDelete(a.id, a.title)}
                          className="inline-flex items-center gap-1 px-3 sm:px-4 py-1.5 sm:py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 hover:shadow-md transition-all duration-200 text-sm font-medium shadow-sm"
                        >
                          <TrashIcon className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                      <span className="text-xs sm:text-sm text-gray-600 font-semibold text-center w-full">
                        Last updated: {formatDate(a.updatedAt || a.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {articles.length > articlesPerPage && (
                <div className="flex justify-center mt-8 sm:mt-10">
                  <nav className="inline-flex rounded-lg shadow-sm bg-white border border-gray-200 -space-x-px" aria-label="Pagination">
                    <button
                      onClick={() => paginate(currentPage > 1 ? currentPage - 1 : 1)}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-3 sm:px-4 py-2 rounded-l-lg border-r border-gray-200 text-sm font-medium text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      <span className="sr-only">Previous</span>
                      &larr; Prev
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNumber;
                      if (totalPages <= 5) {
                        pageNumber = i + 1;
                      } else if (currentPage <= 3) {
                        pageNumber = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNumber = totalPages - 4 + i;
                      } else {
                        pageNumber = currentPage - 2 + i;
                      }
                      return (
                        <button
                          key={pageNumber}
                          onClick={() => paginate(pageNumber)}
                          className={`relative inline-flex items-center px-4 sm:px-5 py-2 border-r border-gray-200 text-sm font-medium ${
                            currentPage === pageNumber
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white text-gray-600 hover:bg-indigo-50 hover:text-indigo-600'
                          } transition-all duration-200`}
                        >
                          {pageNumber}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => paginate(currentPage < totalPages ? currentPage + 1 : totalPages)}
                      disabled={currentPage === totalPages}
                      className="relative inline-flex items-center px-3 sm:px-4 py-2 rounded-r-lg text-sm font-medium text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      <span className="sr-only">Next</span>
                      Next &rarr;
                    </button>
                  </nav>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selectedArticle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 sm:p-6 z-50">
          <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-3xl w-full max-h-[90vh] overflow-auto shadow-2xl border border-gray-100">
            <div className="flex justify-between items-start mb-4 sm:mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 line-clamp-2">{selectedArticle.title}</h2>
              <button 
                onClick={() => setSelectedArticle(null)}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-all duration-200"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <div 
              className="prose prose-lg prose-gray max-w-none text-gray-700 mb-4 sm:mb-6" 
              dangerouslySetInnerHTML={{ __html: selectedArticle.content }} 
            />
            {selectedArticle.status === "rejected" && selectedArticle.rejectionReason && (
              <div className="p-3 sm:p-4 bg-red-50 text-red-700 rounded-lg text-sm shadow-sm mb-4 sm:mb-6">
                Rejection Reason: {selectedArticle.rejectionReason}
              </div>
            )}
            <div className="text-sm text-gray-600 font-semibold text-center mt-4 sm:mt-6">
              <span>Created: {selectedArticle.createdAt}</span>
              {selectedArticle.updatedAt && (
                <span className="block mt-2">Updated: {selectedArticle.updatedAt}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {showDeleteModal.visible && renderDeleteModal()}
    </div>
  );
}