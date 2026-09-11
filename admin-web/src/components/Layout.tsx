import React, { useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';

const Layout: React.FC = () => {
  useEffect(() => {
    const token = localStorage.getItem('kaarya_admin_token');
    if (!token) {
      window.location.href = '/login';
    }
  }, []);

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r p-4">
        <div>
          <h1 className="text-xl font-bold text-primary mb-6">Kaarya Admin</h1>
          <nav className="space-y-2">
            <a
              href="/dashboard"
              className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-primary hover:text-white transition-colors">
              Dashboard
            </a>
            <a
              href="/verifications"
              className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-primary hover:text-white transition-colors">
              Verifications
            </a>
            <a
              href="/users"
              className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-primary hover:text-white transition-colors">
              Users
            </a>
            <a
              href="/jobs"
              className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-primary hover:text-white transition-colors">
              Jobs
            </a>
            <a
              href="/offers"
              className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-primary hover:text-white transition-colors">
              Offers
            </a>
            <a
              href="/reviews"
              className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-primary hover:text-white transition-colors">
              Reviews
            </a>
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6">
        <header className="mb-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => {
                localStorage.removeItem('kaarya_admin_token');
                window.location.href = '/login';
              }}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors">
              Logout
            </button>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
};

export default Layout;