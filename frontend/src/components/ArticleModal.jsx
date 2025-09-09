import React from "react";
import {
  XMarkIcon,
  CalendarDaysIcon,
  UserIcon,
  BookOpenIcon,
  TagIcon,
  BookmarkIcon,
} from "@heroicons/react/24/outline";

export default function ArticleModal({ article, onClose }) {
  if (!article) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-white max-w-4xl w-full rounded-2xl shadow-2xl border border-gray-100 overflow-hidden max-h-[90vh] flex flex-col">
        
        <div className="sticky top-0 bg-white p-6 sm:p-8 border-b border-gray-100 flex justify-between items-start z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BookOpenIcon className="h-5 w-5 text-indigo-600" />
              <span className="text-sm font-medium text-indigo-600 uppercase tracking-wider">Featured Article</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight line-clamp-2">{article.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-800 transition-all duration-200 shadow-sm"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex flex-wrap items-center gap-4 sm:gap-6 text-sm">
          <div className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-gray-600" />
            <span className="text-gray-700 font-medium">{article.author?.username || "Unknown author"}</span>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDaysIcon className="h-4 w-4 text-gray-600" />
            <span className="text-gray-700">{new Date(article.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</span>
          </div>
          {article.tags && article.tags.length > 0 && (
            <div className="flex items-center gap-2">
              <TagIcon className="h-4 w-4 text-gray-600" />
              <div className="flex flex-wrap gap-2">
                {article.tags.map(tag => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
          {article.status && (
            <div className="flex items-center gap-2 ml-auto">
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  article.status === "published"
                    ? "bg-green-100 text-green-800"
                    : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {article.status.charAt(0).toUpperCase() + article.status.slice(1)}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {article.imageUrl && (
            <div className="relative aspect-video w-full">
              <img
                src={article.imageUrl}
                alt={article.title}
                className="w-full h-full object-cover transform transition-transform duration-300 hover:scale-105"
              />
              <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/50 to-transparent" />
            </div>
          )}

          <div className="p-6 sm:p-8">
            {article.summary && (
              <p className="text-lg sm:text-xl text-gray-800 font-medium mb-6 sm:mb-8 leading-relaxed">{article.summary}</p>
            )}

            <div className="prose prose-lg prose-gray max-w-none text-gray-700">
              {article.content.split("\n").map((line, i) => {
                if (line.startsWith("# ")) {
                  return <h2 key={i} className="text-2xl font-bold text-gray-900">{line.replace("# ", "")}</h2>;
                } else if (line.startsWith("## ")) {
                  return <h3 key={i} className="text-xl font-semibold text-gray-900">{line.replace("## ", "")}</h3>;
                } else if (line.startsWith(">")) {
                  return <blockquote key={i} className="border-l-4 border-indigo-500 pl-4 text-gray-700 italic">{line.replace(">", "").trim()}</blockquote>;
                } else if (line.trim() === "") {
                  return <div key={i} className="my-4 sm:my-6" />;
                } else {
                  return <p key={i} className="text-base sm:text-lg leading-relaxed">{line}</p>;
                }
              })}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white p-4 sm:p-6 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-800 transition-all duration-200 shadow-sm">
              <BookmarkIcon className="h-5 w-5" />
            </button>
            <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-800 transition-all duration-200 shadow-sm">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
            </button>
          </div>

          <div className="flex gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="px-4 sm:px-5 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 hover:shadow-md transition-all duration-200 font-medium shadow-sm w-full sm:w-auto"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}