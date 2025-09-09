import React, { useState } from "react";
import {
  PhotoIcon,
  DocumentTextIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";

export default function ArticleForm({ initial = {}, onSubmit, submitLabel = "Save" }) {
  const [title, setTitle] = useState(initial.title || "");
  const [content, setContent] = useState(initial.content || "");
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(initial.imageUrl || null);
  const [showPreview, setShowPreview] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("title", title);
    formData.append("content", content);
    if (image) formData.append("image", image);
    onSubmit(formData);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter article title"
          className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm transition-all duration-200"
          required
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-sm font-medium text-gray-700">Content</label>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-all duration-200"
          >
            {showPreview ? (
              <>
                <EyeSlashIcon className="h-4 w-4" />
                <span>Hide Preview</span>
              </>
            ) : (
              <>
                <EyeIcon className="h-4 w-4" />
                <span>Show Preview</span>
              </>
            )}
          </button>
        </div>
        {showPreview ? (
          <div className="bg-gray-50 p-4 sm:p-6 rounded-lg border border-gray-100 text-sm sm:text-base text-gray-700 whitespace-pre-line shadow-sm">
            {content || <span className="text-gray-400">No content to preview</span>}
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your article content here..."
            rows={8}
            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm transition-all duration-200"
            required
          />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Featured Image</label>
          <div className="flex items-center gap-4">
            <label className="cursor-pointer">
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all duration-200 shadow-sm">
                <PhotoIcon className="h-5 w-5 text-indigo-600" />
                <span className="text-sm font-medium text-gray-700">Choose Image</span>
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
              />
            </label>
            {preview && (
              <img
                src={preview}
                alt="Preview"
                className="w-12 h-12 rounded object-cover border-2 border-gray-100 shadow-sm transform transition-transform hover:scale-105"
              />
            )}
          </div>
        </div>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          className="flex items-center justify-center gap-2 w-full bg-indigo-600 text-white px-4 py-3 rounded-lg hover:bg-indigo-700 transition-all duration-200 font-medium shadow-sm hover:shadow-md"
        >
          <DocumentTextIcon className="h-5 w-5" />
          <span>{submitLabel}</span>
        </button>
      </div>
    </form>
  );
}