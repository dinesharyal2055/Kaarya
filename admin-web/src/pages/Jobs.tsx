import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';

const getJobStatusBadge = (status: string) => {
  const tone =
    status === 'open' ? 'neu-badge-blue'
      : status === 'assigned' ? 'neu-badge-yellow'
        : status === 'in_progress' ? 'neu-badge-orange'
          : status === 'completed' ? 'neu-badge-green'
            : 'neu-badge-red';
  return (
    <span className={`neu-badge ${tone}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const Jobs: React.FC = () => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    category: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalPages: 0,
    totalCount: 0,
  });
  const navigate = useNavigate();

  useEffect(() => {
    fetchJobs();
  }, [filters, pagination.page, pagination.limit]);

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/admin/jobs', {
        params: {
          ...filters,
          page: pagination.page,
          limit: pagination.limit,
        },
      });
      setJobs(response.data.jobs);
      setPagination(response.data.pagination);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load jobs');
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
        <h1 className="neu-page-title">Jobs</h1>
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
              <option value="open">Open</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label htmlFor="category" className="neu-label">
              Category
            </label>
            <select
              id="category"
              name="category"
              value={filters.category}
              onChange={handleFilterChange}
              className="neu-input"
            >
              <option value="">All Categories</option>
              {/* These categories should match the ones in the backend seed data */}
              <option value="plumbing">Plumbing</option>
              <option value="painting">Painting</option>
              <option value="appliance">Appliance</option>
              <option value="moving">Moving</option>
              <option value="cleaning">Cleaning</option>
              <option value="electrical">Electrical</option>
              <option value="carpentry">Carpentry</option>
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
                    Title
                  </th>
                  <th scope="col">
                    Category
                  </th>
                  <th scope="col">
                    Budget
                  </th>
                  <th scope="col">
                    Status
                  </th>
                  <th scope="col">
                    Poster
                  </th>
                  <th scope="col">
                    Provider
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
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="neu-empty">
                        No jobs found
                      </div>
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <div className="neu-cell-main text-sm">{job.title}</div>
                      </td>
                      <td>
                        <div className="neu-cell-sub text-sm">{job.category}</div>
                      </td>
                      <td>
                        <div className="neu-cell-sub text-sm">
                          ${job.budgetMin} - ${job.budgetMax}
                        </div>
                      </td>
                      <td>
                        {getJobStatusBadge(job.status)}
                      </td>
                      <td>
                        <div className="neu-cell-sub text-sm">{job.seekerName}</div>
                      </td>
                      <td>
                        <div className="neu-cell-sub text-sm">
                          {job.providerName || 'Not assigned'}
                        </div>
                      </td>
                      <td className="neu-cell-sub text-sm">
                        {new Date(job.createdAt).toLocaleDateString()}
                      </td>
                      <td className="text-sm font-medium">
                        <button
                          onClick={() => {
                            navigate(`/jobs/${job.id}`);
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
              } of {pagination.totalCount} jobs
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

export default Jobs;
