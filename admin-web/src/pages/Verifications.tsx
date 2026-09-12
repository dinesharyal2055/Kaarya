import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';

const documentTypeLabel = (documentType?: string) => {
  switch ((documentType || '').toLowerCase()) {
    case 'nid': return 'NID';
    case 'citizenship':
    case 'citizenship_card': return 'Citizenship';
    default: return documentType || '—';
  }
};

const Verifications: React.FC = () => {
  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: '',
    status: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalPages: 0,
    totalCount: 0,
  });
  const navigate = useNavigate();

  useEffect(() => {
    fetchVerifications();
  }, [filters, pagination.page, pagination.limit]);

  const fetchVerifications = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/admin/verifications', {
        params: {
          ...filters,
          page: pagination.page,
          limit: pagination.limit,
        },
      });
      setVerifications(response.data.requests);
      setPagination(response.data.pagination);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load verifications');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value,
    }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="neu-badge neu-badge-yellow">Pending</span>;
      case 'approved':
        return <span className="neu-badge neu-badge-green">Approved</span>;
      case 'rejected':
        return <span className="neu-badge neu-badge-red">Rejected</span>;
      case 'more_info_needed':
        return <span className="neu-badge neu-badge-blue">More Info Needed</span>;
      default:
        return <span className="neu-badge neu-badge-gray">{status}</span>;
    }
  };

  return (
    <div className="neu-page">
      <div className="neu-page-head">
        <h1 className="neu-page-title">Verification Requests</h1>
      </div>
      {error && <div className="neu-error" role="alert">{error}</div>}
      <div className="neu-card neu-filters">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              placeholder="Search by name or email..."
              className="neu-input"
            />
          </div>
          <div>
            <label htmlFor="status" className="neu-label">
              Status
            </label>
            <select
              id="status"
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              className="neu-input"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="more_info_needed">More Info Needed</option>
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
                    User
                  </th>
                  <th scope="col">
                    Level
                  </th>
                  <th scope="col">
                    Document Type
                  </th>
                  <th scope="col">
                    Status
                  </th>
                  <th scope="col">
                    Submitted
                  </th>
                  <th scope="col">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {verifications.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="neu-empty">
                        No verification requests found
                      </div>
                    </td>
                  </tr>
                ) : (
                  verifications.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <div className="neu-cell-main">{v.userName}</div>
                        <div className="neu-cell-sub text-sm">{v.userEmail}</div>
                      </td>
                      <td>
                        <span className="neu-badge neu-badge-gray capitalize">
                          {v.level}
                        </span>
                      </td>
                      <td>
                        <div className="neu-cell-sub text-sm">{documentTypeLabel(v.documentType)}</div>
                      </td>
                      <td>
                        {getStatusBadge(v.status)}
                      </td>
                      <td className="neu-cell-sub text-sm">
                        {new Date(v.createdAt).toLocaleDateString()}
                      </td>
                      <td className="text-sm font-medium">
                        <button
                          onClick={() => navigate(`/verifications/${v.id}`)}
                          className="neu-link"
                        >
                          Review
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
              } of {pagination.totalCount} requests
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

export default Verifications;
