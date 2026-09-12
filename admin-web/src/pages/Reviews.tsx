import React, { useEffect, useState } from 'react';
import api from '../services/api';

const Reviews: React.FC = () => {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: '',
    rating: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalPages: 0,
    totalCount: 0,
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchReviews();
  }, [filters, pagination.page, pagination.limit]);

  const fetchReviews = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/admin/reviews', {
        params: {
          ...filters,
          page: pagination.page,
          limit: pagination.limit,
        },
      });
      setReviews(response.data.reviews);
      setPagination(response.data.pagination);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load reviews');
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

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this review?')) return;
    setDeletingId(id);
    try {
      await api.delete(`/api/admin/reviews/${id}`);
      setReviews(prev => prev.filter(r => String(r.id) !== String(id)));
      fetchReviews();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete review');
    } finally {
      setDeletingId(null);
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center" aria-label={`${rating} out of 5 stars`}>
        <span className="text-yellow-400 mr-1" aria-hidden="true">{'★'.repeat(rating)}</span>
        <span className="text-gray-300" aria-hidden="true">{'★'.repeat(5 - rating)}</span>
        <span className="ml-2 text-sm neu-cell-sub">{rating}.0</span>
      </div>
    );
  };

  return (
    <div className="neu-page">
      <div className="neu-page-head">
        <h1 className="neu-page-title">Reviews</h1>
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
              placeholder="Search by reviewer or reviewee..."
              className="neu-input"
            />
          </div>
          <div>
            <label htmlFor="rating" className="neu-label">
              Rating
            </label>
            <select
              id="rating"
              name="rating"
              value={filters.rating}
              onChange={handleFilterChange}
              className="neu-input"
            >
              <option value="">All Ratings</option>
              <option value="1">1 Star</option>
              <option value="2">2 Stars</option>
              <option value="3">3 Stars</option>
              <option value="4">4 Stars</option>
              <option value="5">5 Stars</option>
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
                    Reviewer
                  </th>
                  <th scope="col">
                    Reviewee
                  </th>
                  <th scope="col">
                    Job
                  </th>
                  <th scope="col">
                    Rating
                  </th>
                  <th scope="col">
                    Comment
                  </th>
                  <th scope="col">
                    Date
                  </th>
                  <th scope="col">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {reviews.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="neu-empty">
                        No reviews found
                      </div>
                    </td>
                  </tr>
                ) : (
                  reviews.map((review) => (
                    <tr key={review.id}>
                      <td>
                        <div className="neu-cell-main text-sm">{review.reviewerName}</div>
                        <div className="neu-cell-sub text-sm">{review.reviewerEmail}</div>
                      </td>
                      <td>
                        <div className="neu-cell-sub text-sm">{review.revieweeName}</div>
                      </td>
                      <td>
                        <div className="neu-cell-sub text-sm">{review.jobTitle}</div>
                      </td>
                      <td>
                        {renderStars(review.rating)}
                      </td>
                      <td>
                        <div className="neu-cell-sub text-sm max-w-xs truncate">{review.comment || 'No comment'}</div>
                      </td>
                      <td className="neu-cell-sub text-sm">
                        {new Date(review.createdAt).toLocaleDateString()}
                      </td>
                      <td className="text-sm font-medium">
                        <button
                          onClick={() => handleDelete(review.id)}
                          disabled={deletingId === review.id}
                          className="neu-link"
                        >
                          {deletingId === review.id ? 'Deleting...' : 'Delete'}
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
              } of {pagination.totalCount} reviews
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

export default Reviews;
