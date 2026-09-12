import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useParams, useNavigate } from 'react-router-dom';

const OfferDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [offer, setOffer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOffer();
  }, [id]);

  const fetchOffer = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/admin/offers/${id}`);
      setOffer(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load offer');
    } finally {
      setLoading(false);
    }
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

  if (loading) {
    return (
      <div className="neu-page">
        <div className="neu-card neu-loading">Loading...</div>
      </div>
    );
  }

  if (error && !offer) {
    return (
      <div className="neu-page">
        <div className="neu-error" role="alert">{error}</div>
        <button onClick={() => navigate('/offers')} className="neu-link">
          Back to Offers
        </button>
      </div>
    );
  }

  return (
    <div className="neu-page">
      <div className="neu-page-head">
        <div>
          <button onClick={() => navigate('/offers')} className="neu-link">
            &larr; Back to Offers
          </button>
          <h1 className="neu-page-title">Offer #{id}</h1>
        </div>
        {offer && getStatusBadge(offer.status)}
      </div>

      {error && <div className="neu-error" role="alert">{error}</div>}

      {offer && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Offer Details */}
          <div className="neu-card lg:col-span-1">
            <h2 className="neu-card-title">Offer Details</h2>
            <div className="neu-stack">
              <div>
                <span className="neu-field-label">Amount</span>
                <p className="text-xl font-bold">Rs. {Number(offer.amount).toLocaleString()}</p>
              </div>
              <div>
                <span className="neu-field-label">Status</span>
                <p className="neu-field-value capitalize">{offer.status}</p>
              </div>
              <div>
                <span className="neu-field-label">Submitted</span>
                <p className="neu-field-value">{new Date(offer.createdAt).toLocaleString()}</p>
              </div>
              {offer.message && (
                <div>
                  <span className="neu-field-label">Message</span>
                  <p className="neu-field-value">{offer.message}</p>
                </div>
              )}
            </div>
          </div>

          {/* Job Details */}
          <div className="neu-card lg:col-span-1">
            <h2 className="neu-card-title">Job Details</h2>
            <div className="neu-stack">
              <div>
                <span className="neu-field-label">Title</span>
                <p className="neu-field-value">{offer.job?.title}</p>
              </div>
              <div>
                <span className="neu-field-label">Category</span>
                <p className="neu-field-value capitalize">{offer.job?.category}</p>
              </div>
              <div>
                <span className="neu-field-label">Location</span>
                <p className="neu-field-value">{offer.job?.location || 'N/A'}</p>
              </div>
              <div>
                <span className="neu-field-label">Budget</span>
                <p className="neu-field-value">
                  Rs. {Number(offer.job?.budgetMin || 0).toLocaleString()} - Rs. {Number(offer.job?.budgetMax || 0).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="neu-field-label">Status</span>
                <p className="neu-field-value capitalize">{offer.job?.status}</p>
              </div>
              {offer.job?.description && (
                <div>
                  <span className="neu-field-label">Description</span>
                  <p className="text-sm mt-1 neu-cell-sub">{offer.job.description}</p>
                </div>
              )}
            </div>
          </div>

          {/* Provider Details */}
          <div className="neu-card lg:col-span-1">
            <h2 className="neu-card-title">Provider Details</h2>
            <div className="neu-stack">
              <div>
                <span className="neu-field-label">Name</span>
                <p className="neu-field-value">{offer.provider?.name}</p>
              </div>
              <div>
                <span className="neu-field-label">Email</span>
                <p className="neu-field-value">{offer.provider?.email}</p>
              </div>
              <div>
                <span className="neu-field-label">Phone</span>
                <p className="neu-field-value">{offer.provider?.phone || 'N/A'}</p>
              </div>
              <div className="flex items-center space-x-4">
                <div>
                  <span className="neu-field-label">Rating</span>
                  <p className="neu-field-value">
                    {offer.provider?.rating ? `${Number(offer.provider.rating).toFixed(1)}/5` : 'No ratings'}
                  </p>
                </div>
                <div>
                  <span className="neu-field-label">Reviews</span>
                  <p className="neu-field-value">{offer.provider?.reviewCount || 0}</p>
                </div>
              </div>
              <div>
                <span className="neu-field-label">Verified</span>
                <p className="neu-field-value">
                  <span className={`neu-badge ${
                    offer.provider?.isVerified
                      ? 'neu-badge-green'
                      : 'neu-badge-red'
                  }`}>
                    {offer.provider?.isVerified ? 'Verified' : 'Unverified'}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Negotiations */}
          {offer.negotiations && offer.negotiations.length > 0 && (
            <div className="neu-card neu-table-wrap lg:col-span-3">
              <div className="p-5 pb-1">
                <h2 className="neu-card-title">Negotiation History</h2>
              </div>
              <div className="neu-table-scroll">
                <table className="neu-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        Proposed Amount
                      </th>
                      <th scope="col">
                        Status
                      </th>
                      <th scope="col">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {offer.negotiations.map((neg: any) => (
                      <tr key={neg.id}>
                        <td>
                          <div className="neu-cell-main text-sm">Rs. {Number(neg.proposedAmount).toLocaleString()}</div>
                        </td>
                        <td>
                          <span className={`neu-badge ${
                            neg.status === 'accepted'
                              ? 'neu-badge-green'
                              : neg.status === 'rejected'
                                ? 'neu-badge-red'
                                : 'neu-badge-yellow'
                          }`}>
                            {neg.status}
                          </span>
                        </td>
                        <td className="neu-cell-sub text-sm">
                          {new Date(neg.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OfferDetail;
