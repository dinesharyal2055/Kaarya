import React, { useEffect, useState } from 'react';
import api from '../services/api';

const Users: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: '',
    role: '',
    verified: '',
    active: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalPages: 0,
    totalCount: 0,
  });

  useEffect(() => {
    fetchUsers();
  }, [filters, pagination.page, pagination.limit]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/admin/users', {
        params: {
          ...filters,
          page: pagination.page,
          limit: pagination.limit,
        },
      });
      setUsers(response.data.users);
      setPagination(response.data.pagination);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    // Reset to first page when filters change
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  return (
    <div className="neu-page">
      <div className="neu-page-head">
        <h1 className="neu-page-title">Users</h1>
      </div>
      {error && <div className="neu-error" role="alert">{error}</div>}
      <div className="neu-card neu-filters">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="search" className="neu-label">
              Search
            </label>
            <input
              id="search"
              type="text"
              name="search"
              value={filters.search}
              onChange={handleFilterChange}
              className="neu-input"
            />
          </div>
          <div>
            <label htmlFor="role" className="neu-label">
              Role
            </label>
            <select
              id="role"
              name="role"
              value={filters.role}
              onChange={handleFilterChange}
              className="neu-input"
            >
              <option value="">All Roles</option>
              <option value="seeker">Seeker</option>
              <option value="provider">Provider</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label htmlFor="verified" className="neu-label">
              Verification Status
            </label>
            <select
              id="verified"
              name="verified"
              value={filters.verified}
              onChange={handleFilterChange}
              className="neu-input"
            >
              <option value="">All</option>
              <option value="true">Verified</option>
              <option value="false">Unverified</option>
            </select>
          </div>
          <div>
            <label htmlFor="active" className="neu-label">
              Account Status
            </label>
            <select
              id="active"
              name="active"
              value={filters.active}
              onChange={handleFilterChange}
              className="neu-input"
            >
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>
      </div>
      {loading ? (
        <div className="neu-card neu-loading">Loading...</div>
      ) : (
        <div className="neu-card neu-table-wrap">
          <div className="neu-table-scroll">
            <table className="neu-table">
              <thead>
                <tr>
                  <th scope="col">
                    Name
                  </th>
                  <th scope="col">
                    Email
                  </th>
                  <th scope="col">
                    Phone
                  </th>
                  <th scope="col">
                    Role
                  </th>
                  <th scope="col">
                    Verified
                  </th>
                  <th scope="col">
                    Active
                  </th>
                  <th scope="col">
                    Created
                  </th>
                  <th scope="col">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="neu-empty">
                        No users found
                      </div>
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="neu-cell-main text-sm">{user.name}</div>
                      </td>
                      <td>
                        <div className="neu-cell-sub text-sm">{user.email}</div>
                      </td>
                      <td>
                        <div className="neu-cell-sub text-sm">{user.phone}</div>
                      </td>
                      <td>
                        <span className="neu-badge neu-badge-gray">
                          {user.role}
                        </span>
                      </td>
                      <td>
                        {user.isVerified ? (
                          <span className="neu-badge neu-badge-green">
                            Verified
                          </span>
                        ) : (
                          <span className="neu-badge neu-badge-red">
                            Unverified
                          </span>
                        )}
                      </td>
                      <td>
                        {user.isActive ? (
                          <span className="neu-badge neu-badge-green">
                            Active
                          </span>
                        ) : (
                          <span className="neu-badge neu-badge-red">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="neu-cell-sub text-sm">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="text-sm font-medium">
                        <button
                          onClick={() => {
                            // Navigate to user detail
                            window.location.href = `/users/${user.id}`;
                          }}
                          className="neu-link"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="neu-pagination">
            <div className="neu-pagination-count">
              Showing {pagination.page * pagination.limit - pagination.limit + 1}-{
                Math.min(pagination.page * pagination.limit, pagination.totalCount)
              } of {pagination.totalCount} users
            </div>
            <div className="neu-pagination-actions">
              <button
                onClick={() => {
                  if (pagination.page > 1) {
                    setPagination(prev => ({ ...prev, page: prev.page - 1 }));
                  }
                }}
                disabled={pagination.page === 1}
                className="neu-btn neu-btn-primary neu-btn-sm"
              >
                Previous
              </button>
              <button
                onClick={() => {
                  if (pagination.page < pagination.totalPages) {
                    setPagination(prev => ({ ...prev, page: prev.page + 1 }));
                  }
                }}
                disabled={pagination.page === pagination.totalPages}
                className="neu-btn neu-btn-primary neu-btn-sm"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
