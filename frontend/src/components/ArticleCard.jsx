import React from "react";
import { CalendarDaysIcon, UserIcon } from "@heroicons/react/24/outline";

export default function ArticleCard({ article, onRead }) {
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-200 h-full flex flex-col">
      {article.imageUrl && (
        <img 
          src={article.imageUrl} 
          alt={article.title} 
          className="w-full h-48 sm:h-56 object-cover transform transition-transform duration-300 hover:scale-105"
        />
      )}
      <div className="p-5 sm:p-6 flex-grow flex flex-col">
        <h4 className="font-semibold text-lg sm:text-xl text-gray-900 mb-2 line-clamp-2">{article.title}</h4>
        <p className="text-gray-600 text-sm sm:text-base mb-4 line-clamp-3">{article.content}</p>
        
        <div className="mt-auto pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between text-xs sm:text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <UserIcon className="h-4 w-4" />
              <span>{article.author?.username || "Unknown"}</span>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDaysIcon className="h-4 w-4" />
              <span>{new Date(article.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
            </div>
          </div>
        </div>
        
        <button 
          onClick={() => onRead(article)} 
          className="mt-4 w-full bg-indigo-50 text-indigo-600 py-2 sm:py-3 rounded-lg text-sm sm:text-base font-medium hover:bg-indigo-100 hover:shadow-md transition-all duration-200 shadow-sm"
        >
          Read More
        </button>
      </div>
    </div>
  );
}