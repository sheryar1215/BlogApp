import React from "react";

export default function Layout({ children}) {
  return (
    <div className="min-h-screen flex flex-col">
      
      <main className="flex-grow container mx-auto px-4 py-6">
        {children}
      </main>
      
    </div>
  );
}