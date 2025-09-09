import React, { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import { getPendingArticles, approveArticle, declineArticle } from "../services/adminService";
import toast from "react-hot-toast";
import {
  ClockIcon,
  CheckIcon,
  XMarkIcon,
  ArrowPathIcon,
  EyeIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

export default function PendingArticles({ user }) {
  const [articles, setArticles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState({
    visible: false,
    articleId: null,
    title: "",
  });
  const [rejectionReason, setRejectionReason] = useState("");

  const loadArticles = async () => {
    setIsLoading(true);
    try {
      const data = await getPendingArticles();
      setArticles(data);
    } catch (err) {
      console.error("Error loading pending articles:", err);
      toast.error("Failed to load pending articles");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadArticles();
  }, []);

  const handleApprove = async (id) => {
    try {
      await approveArticle(id);
      toast.success("Article approved successfully");
      loadArticles();
    } catch (err) {
      console.error("Error approving article:", err);
      toast.error("Failed to approve article");
    }
  };

  const handleDecline = async (id, reason) => {
    if (!id) {
      toast.error("Invalid article ID");
      return;
    }
    try {
      await declineArticle(id, { reason });
      toast.success("Article rejected successfully");
      loadArticles();
    } catch (err) {
      console.error("Detailed error:", err);
      toast.error(`Failed to reject article: ${err.response?.data?.error || err.message || "Unknown error"}`);
    }
  };

  const viewArticle = (article) => {
    setSelectedArticle(article);
  };

  const openRejectModal = (id, title) => {
    setShowRejectModal({
      visible: true,
      articleId: id,
      title,
    });
    setRejectionReason("");
  };

  const confirmReject = () => {
    if (!rejectionReason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    handleDecline(showRejectModal.articleId, rejectionReason);
    setShowRejectModal({ visible: false, articleId: null, title: "" });
    setRejectionReason("");
    if (selectedArticle) {
      setSelectedArticle(null);
    }
  };

  const renderRejectModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full transform scale-95 animate-scale-in">
        <div className="flex items-center gap-3 mb-4">
          <ExclamationTriangleIcon className="h-6 w-6 text-yellow-500" />
          <h3 className="text-lg font-semibold text-gray-900">Reject Article</h3>
        </div>
        <p className="text-gray-600 mb-4">
          Are you sure you want to reject "{showRejectModal.title}"?
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason for rejection (required)</label>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            placeholder="Please explain why this article is being rejected..."
          />
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => {
              setShowRejectModal({ visible: false, articleId: null, title: "" });
              setRejectionReason("");
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={confirmReject}
            disabled={!rejectionReason.trim()}
            className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <XMarkIcon className="h-5 w-5" />
            Reject
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 font-inter">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="md:col-span-1">
          <Sidebar user={user} />
        </div>
        <div className="md:col-span-4 p-4 md:p-8">
          <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
                <ClockIcon className="h-7 w-7 text-yellow-500" />
                Pending Articles
              </h2>
              <button
                onClick={loadArticles}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-lg hover:from-indigo-600 hover:to-indigo-700 transition-all disabled:opacity-50"
              >
                <ArrowPathIcon className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>

            {isLoading && articles.length === 0 ? (
              <div className="flex justify-center py-12">
                <ArrowPathIcon className="h-10 w-10 animate-spin text-indigo-500" />
              </div>
            ) : articles.length === 0 ? (
              <div className="text-center py-16 bg-gray-100 rounded-xl">
                <p className="text-gray-500 text-lg">No pending articles for review</p>
              </div>
            ) : (
              <div className="space-y-6">
                {articles.map((article, index) => (
                  <div
                    key={article.id}
                    className="border border-gray-200 rounded-xl p-6 bg-white hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 animate-fade-in"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">{article.title}</h3>
                      <div className="flex gap-2">
                        <button
                          onClick={() => viewArticle(article)}
                          className="p-2 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-full transition-all"
                          title="View Article"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleApprove(article.id)}
                          className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-full transition-all"
                          title="Approve Article"
                        >
                          <CheckIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => openRejectModal(article.id, article.title)}
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full transition-all"
                          title="Decline Article"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                    <div className="mb-4">
                      <p className="text-gray-600 line-clamp-3 leading-relaxed">{article.content}</p>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                        <DocumentTextIcon className="h-4 w-4" />
                        <span>By {article.author?.username || "Unknown"}</span>
                      </div>
                      <span>{new Date(article.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedArticle && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white rounded-2xl p-6 md:p-8 max-w-3xl w-full max-h-[90vh] overflow-auto transform scale-95 animate-scale-in">
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-2xl font-bold text-gray-900">{selectedArticle.title}</h3>
                <button
                  onClick={() => setSelectedArticle(null)}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-all"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              <div className="mb-6 text-sm text-gray-500">
                <div className="flex items-center gap-2 mb-2">
                  <span>By {selectedArticle.author?.username || "Unknown"}</span>
                  <span>•</span>
                  <span>{new Date(selectedArticle.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="prose max-w-none text-gray-700 leading-relaxed mb-6">
                {selectedArticle.content.split("\n").map((paragraph, i) => (
                  <p key={i} className="mb-4">{paragraph}</p>
                ))}
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => openRejectModal(selectedArticle.id, selectedArticle.title)}
                  className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all flex items-center gap-2"
                >
                  <XMarkIcon className="h-5 w-5" />
                  Decline
                </button>
                <button
                  onClick={() => handleApprove(selectedArticle.id)}
                  className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all flex items-center gap-2"
                >
                  <CheckIcon className="h-5 w-5" />
                  Approve
                </button>
              </div>
            </div>
          </div>
        )}
        {showRejectModal.visible && renderRejectModal()}
      </div>

      <style jsx>{`
        @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");

        .font-inter {
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        .animate-fade-in {
          animation: fadeIn 0.5s ease-in-out;
        }

        .animate-scale-in {
          animation: scaleIn 0.3s ease-in-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes scaleIn {
          from {
            transform: scale(0.95);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}