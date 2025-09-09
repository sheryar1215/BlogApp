import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllArticles } from "../services/articleService";
import ArticleCard from "../components/ArticleCard";
import ArticleModal from "../components/ArticleModal";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import Layout from "../components/Layout";
import { toast } from "react-toastify";

export default function Home({ user }) {
  const [articles, setArticles] = useState([]);
  const [filteredArticles, setFilteredArticles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const articlesPerPage = 9;
  const navigate = useNavigate();

  useEffect(() => {
    getAllArticles()
      .then(data => {
        setArticles(data);
        setFilteredArticles(data);
      })
      .catch(err => {
        console.error(err);
        toast.error("Failed to load articles");
      });
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredArticles(articles);
      setCurrentPage(1);
    } else {
      const filtered = articles.filter(article =>
        article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        article.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (article.author?.username && article.author.username.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      setFilteredArticles(filtered);
      setCurrentPage(1);
    }
  }, [searchTerm, articles]);

  const handleRead = (article) => {
    if (!user) {
      navigate(`/auth?redirect=/dashboard`);
      return;
    }
    setSelected(article);
  };

  const indexOfLastArticle = currentPage * articlesPerPage;
  const indexOfFirstArticle = indexOfLastArticle - articlesPerPage;
  const currentArticles = filteredArticles.slice(indexOfFirstArticle, indexOfLastArticle);
  const totalPages = Math.ceil(filteredArticles.length / articlesPerPage);

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  return (
    <Layout user={user}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header Section */}
        <div className="text-center py-12 sm:py-16 bg-gradient-to-b from-indigo-50 to-white rounded-2xl shadow-sm">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight">
            Welcome to ParseBlog
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-lg sm:text-xl text-gray-600">
            Discover and share knowledge with a vibrant community
          </p>
        </div>

        {/* Search Bar */}
        <div className="mt-8 mb-10 max-w-3xl mx-auto">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-500 transition-colors duration-200 group-hover:text-indigo-600" />
            </div>
            <input
              type="text"
              placeholder="Search articles by title, content, or author..."
              className="block w-full pl-12 pr-4 py-3.5 text-sm border border-gray-200 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Articles Section */}
        {currentArticles.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-gray-600 text-lg font-medium">No articles found. Try a different search term.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 pb-8">
              {currentArticles.map(a => (
                <div
                  key={a.id}
                  className="transform transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg"
                >
                  <ArticleCard article={a} onRead={handleRead} />
                </div>
              ))}
            </div>

            {/* Pagination */}
            {filteredArticles.length > articlesPerPage && (
              <div className="flex justify-center pt-8 pb-12">
                <nav className="inline-flex rounded-lg shadow-sm -space-x-px bg-white border border-gray-200" aria-label="Pagination">
                  <button
                    onClick={() => paginate(currentPage > 1 ? currentPage - 1 : 1)}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-3 sm:px-4 py-2 rounded-l-lg border-r border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
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
                        className={`relative inline-flex items-center px-4 sm:px-5 py-2 text-sm font-medium border-r border-gray-200 ${
                          currentPage === pageNumber
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-gray-700 hover:bg-indigo-50 hover:text-indigo-600'
                        } transition-colors duration-200`}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => paginate(currentPage < totalPages ? currentPage + 1 : totalPages)}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-3 sm:px-4 py-2 rounded-r-lg bg-white text-sm font-medium text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                  >
                    <span className="sr-only">Next</span>
                    Next &rarr;
                  </button>
                </nav>
              </div>
            )}
          </>
        )}

        <ArticleModal article={selected} onClose={() => setSelected(null)} />
      </div>
    </Layout>
  );
}