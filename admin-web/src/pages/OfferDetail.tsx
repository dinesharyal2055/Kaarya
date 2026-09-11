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
        return <span className="px-3 py-1 inline-flex text-sm font-semibold rounded-full bg-blue-100 text-blue-800">Pending</span>;
      case 'accepted':
        return <span className="px-3 py-1 inline-flex text-sm font-semibold rounded-full bg-green-100 text-green-800">Accepted</span>;
      case 'rejected':
        return <span className="px-3 py-1 inline-flex text-sm font-semibold rounded-full bg-red-100 text-red-800">Rejected</span>;
      case 'withdrawn':
        return <span className="px-3 py-1 inline-flex text-sm font-semibold rounded-full bg-gray-100 text-gray-800">Withdrawn</span>;
      case 'countered':
        return <span className="px-3 py-1 inline-flex text-sm font-semibold rounded-full bg-yellow-100 text-yellow-800">Countered</span>;
      default:
        return <span className="px-3 py-1 inline-flex text-sm font-semibold rounded-full bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  if (error && !offer) {
    return (
      <div className="p-6">
        <div className="bg-red-100 text-red-800 p-4 rounded mb-4">{error}</div>
        <button onClick={() => navigate('/offers')} className="text-primary hover:underline">
          Back to Offers
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <button onClick={() => navigate('/offers')} className="text-primary hover:underline mb-4 inline-block">
          &larr; Back to Offers
        </button>
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Offer #{id}</h1>
          {offer && getStatusBadge(offer.status)}
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-100 text-red-800 rounded">{error}</div>}

      {offer && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Offer Details */}
          <div className="bg-white p-6 rounded-lg shadow lg:col-span-1">
            <h2 className="text-lg font-semibold mb-4">Offer Details</h2>
            <div className="space-y-3">
              <div>
                <span className="text-gray-500 text-sm">Amount:</span>
                <p className="text-xl font-bold">Rs. {Number(offer.amount).toLocaleString()}</p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Status:</span>
                <p className="font-medium capitalize">{offer.status}</p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Submitted:</span>
                <p className="font-medium">{new Date(offer.createdAt).toLocaleString()}</p>
              </div>
              {offer.message && (
                <div>
                  <span className="text-gray-500 text-sm">Message:</span>
                  <p className="font-medium">{offer.message}</p>
                </div>
              )}
            </div>
          </div>

          {/* Job Details */}
          <div className="bg-white p-6 rounded-lg shadow lg:col-span-1">
            <h2 className="text-lg font-semibold mb-4">Job Details</h2>
            <div className="space-y-3">
              <div>
                <span className="text-gray-500 text-sm">Title:</span>
                <p className="font-medium">{offer.job?.title}</p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Category:</span>
                <p className="font-medium capitalize">{offer.job?.category}</p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Location:</span>
                <p className="font-medium">{offer.job?.location || 'N/A'}</p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Budget:</span>
                <p className="font-medium">
                  Rs. {Number(offer.job?.budgetMin || 0).toLocaleString()} - Rs. {Number(offer.job?.budgetMax || 0).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Status:</span>
                <p className="font-medium capitalize">{offer.job?.status}</p>
              </div>
              {offer.job?.description && (
                <div>
                  <span className="text-gray-500 text-sm">Description:</span>
                  <p className="text-sm mt-1">{offer.job.description}</p>
                </div>
              )}
            </div>
          </div>

          {/* Provider Details */}
          <div className="bg-white p-6 rounded-lg shadow lg:col-span-1">
            <h2 className="text-lg font-semibold mb-4">Provider Details</h2>
            <div className="space-y-3">
              <div>
                <span className="text-gray-500 text-sm">Name:</span>
                <p className="font-medium">{offer.provider?.name}</p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Email:</span>
                <p className="font-medium">{offer.provider?.email}</p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Phone:</span>
                <p className="font-medium">{offer.provider?.phone || 'N/A'}</p>
              </div>
              <div className="flex items-center space-x-4">
                <div>
                  <span className="text-gray-500 text-sm">Rating:</span>
                  <p className="font-medium">
                    {offer.provider?.rating ? `${Number(offer.provider.rating).toFixed(1)}/5` : 'No ratings'}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500 text-sm">Reviews:</span>
                  <p className="font-medium">{offer.provider?.reviewCount || 0}</p>
                </div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Verified:</span>
                <p className="font-medium">
                  <span className={`px-2 py-0.5 inline-flex text-xs font-semibold rounded-full ${
                    offer.provider?.isVerified
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {offer.provider?.isVerified ? 'Verified' : 'Unverified'}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Negotiations */}
          {offer.negotiations && offer.negotiations.length > 0 && (
            <div className="bg-white p-6 rounded-lg shadow lg:col-span-3">
              <h2 className="text-lg font-semibold mb-4">Negotiation History</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Proposed Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {offer.negotiations.map((neg: any) => (
                      <tr key={neg.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">Rs. {Number(neg.proposedAmount).toLocaleString()}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            neg.status === 'accepted'
                              ? 'bg-green-100 text-green-800'
                              : neg.status === 'rejected'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {neg.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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