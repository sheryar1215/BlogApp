import { BookOpenIcon } from '@heroicons/react/24/outline';

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 mt-12 sm:mt-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 sm:gap-8">
          <div className="flex items-center gap-3">
            <BookOpenIcon className="h-7 w-7 text-indigo-600 transition-transform duration-200 hover:scale-105" />
            <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent transition-transform duration-200 hover:scale-105">
              ParseBlog
            </span>
          </div>
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
            <a href="#" className="text-sm font-medium text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-all duration-200">
              Terms
            </a>
            <a href="#" className="text-sm font-medium text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-all duration-200">
              Privacy
            </a>
            <a href="#" className="text-sm font-medium text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-all duration-200">
              Contact
            </a>
            <a href="#" className="text-sm font-medium text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-all duration-200">
              About
            </a>
          </div>
        </div>
        <div className="mt-6 sm:mt-8 text-center text-xs sm:text-sm text-gray-500">
          © {new Date().getFullYear()} ParseBlog. All rights reserved.
        </div>
      </div>
    </footer>
  );
}