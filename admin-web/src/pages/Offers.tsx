import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';

const Offers: React.FC = () => {
  const [offers, setOffers] = useState<any[]>([]);
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
    fetchOffers();
  }, [filters, pagination.page, pagination.limit]);

  const fetchOffers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/admin/offers', {
        params: {
          ...filters,
          page: pagination.page,
          limit: pagination.limit,
        },
      });
      setOffers(response.data.offers);
      setPagination(response.data.pagination);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load offers');
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
        return <span className="neu-badge neu-badge-blue">Pending</span>;
      case 'accepted':
        return <span className="neu-badge neu-badge-green">Accepted</span>;
      case 'rejected':
        return <span className="neu-badge neu-badge-red">Rejected</span>;
      case 'withdrawn':
        return <span className="neu-badge neu-badge-gray">Withdrawn</span>;
      case 'countered':
        return <span className="neu-badge neu-badge-yellow">Countered</span>;
      default:
        return <span className="neu-badge neu-badge-gray">{status}</span>;
    }
  };

  return (
    <div className="neu-page">
      <div className="neu-page-head">
        <h1 className="neu-page-title">Offers</h1>
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
              placeholder="Search by job title or provider..."
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
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="withdrawn">Withdrawn</option>
              <option value="countered">Countered</option>
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
                    Job
                  </th>
                  <th scope="col">
                    Provider
                  </th>
                  <th scope="col">
                    Amount
                  </th>
                  <th scope="col">
                    Status
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
                {offers.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="neu-empty">
                        No offers found
                      </div>
                    </td>
                  </tr>
                ) : (
                  offers.map((offer) => (
                    <tr key={offer.id}>
                      <td>
                        <div className="neu-cell-main text-sm">{offer.jobTitle}</div>
                        <div className="neu-cell-sub text-sm">{offer.jobCategory}</div>
                      </td>
                      <td>
                        <div className="neu-cell-sub text-sm">{offer.providerName}</div>
                      </td>
                      <td>
                        <div className="neu-cell-main text-sm">
                          Rs. {Number(offer.amount).toLocaleString()}
                        </div>
                      </td>
                      <td>
                        {getStatusBadge(offer.status)}
                      </td>
                      <td className="neu-cell-sub text-sm">
                        {new Date(offer.createdAt).toLocaleDateString()}
                      </td>
                      <td className="text-sm font-medium">
                        <button
                          onClick={() => navigate(`/offers/${offer.id}`)}
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
              } of {pagination.totalCount} offers
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

export default Offers;
