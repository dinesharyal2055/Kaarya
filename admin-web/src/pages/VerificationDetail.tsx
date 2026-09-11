import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useParams, useNavigate } from 'react-router-dom';

const VerificationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [verification, setVerification] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState('approved');
  const [adminNotes, setAdminNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    fetchVerification();
  }, [id]);

  const fetchVerification = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/admin/verifications/${id}`);
      setVerification(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load verification');
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async () => {
    if (!id) return;
    setSubmitting(true);
    try {
      await api.post(`/api/admin/verifications/${id}/review`, {
        status: reviewStatus,
        adminNotes: adminNotes.trim() || undefined,
      });
      navigate('/verifications');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-3 py-1 inline-flex text-sm font-semibold rounded-full bg-yellow-100 text-yellow-800">Pending</span>;
      case 'approved':
        return <span className="px-3 py-1 inline-flex text-sm font-semibold rounded-full bg-green-100 text-green-800">Approved</span>;
      case 'rejected':
        return <span className="px-3 py-1 inline-flex text-sm font-semibold rounded-full bg-red-100 text-red-800">Rejected</span>;
      case 'more_info_needed':
        return <span className="px-3 py-1 inline-flex text-sm font-semibold rounded-full bg-blue-100 text-blue-800">More Info Needed</span>;
      default:
        return <span className="px-3 py-1 inline-flex text-sm font-semibold rounded-full bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  if (error && !verification) {
    return (
      <div className="p-6">
        <div className="bg-red-100 text-red-800 p-4 rounded mb-4">{error}</div>
        <button onClick={() => navigate('/verifications')} className="text-primary hover:underline">
          Back to Verifications
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <button onClick={() => navigate('/verifications')} className="text-primary hover:underline mb-4 inline-block">
          &larr; Back to Verifications
        </button>
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Verification Request #{id}</h1>
          {verification && getStatusBadge(verification.status)}
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-100 text-red-800 rounded">{error}</div>}

      {verification && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Info */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">User Information</h2>
            <div className="space-y-3">
              <div>
                <span className="text-gray-500 text-sm">Name:</span>
                <p className="font-medium">{verification.userName}</p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Email:</span>
                <p className="font-medium">{verification.userEmail}</p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Phone:</span>
                <p className="font-medium">{verification.userPhone || 'N/A'}</p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Role:</span>
                <p className="font-medium capitalize">{verification.userRole}</p>
              </div>
            </div>
          </div>

          {/* Verification Details */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Verification Details</h2>
            <div className="space-y-3">
              <div>
                <span className="text-gray-500 text-sm">Level:</span>
                <p className="font-medium capitalize">{verification.level}</p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Document Type:</span>
                <p className="font-medium">{verification.documentType}</p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Submitted:</span>
                <p className="font-medium">{new Date(verification.createdAt).toLocaleString()}</p>
              </div>
              {verification.notes && (
                <div>
                  <span className="text-gray-500 text-sm">User Notes:</span>
                  <p className="font-medium">{verification.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Uploaded Documents */}
          <div className="bg-white p-6 rounded-lg shadow lg:col-span-2">
            <h2 className="text-lg font-semibold mb-4">Uploaded Documents</h2>
            {verification.documents && verification.documents.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {verification.documents.map((doc: string, index: number) => (
                  <div
                    key={index}
                    className="cursor-pointer border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                    onClick={() => setSelectedImage(doc)}
                  >
                    <img
                      src={doc.startsWith('http') ? doc : `https://kaarya-4qft.onrender.com${doc}`}
                      alt={`Document ${index + 1}`}
                      className="w-full h-40 object-cover"
                    />
                    <div className="p-2 text-center text-sm text-gray-500">
                      Document {index + 1}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No documents uploaded</p>
            )}
          </div>

          {/* Review Form (only for pending requests) */}
          {verification.status === 'pending' && (
            <div className="bg-white p-6 rounded-lg shadow lg:col-span-2">
              <h2 className="text-lg font-semibold mb-4">Review Decision</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Decision
                  </label>
                  <select
                    value={reviewStatus}
                    onChange={(e) => setReviewStatus(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="approved">Approve</option>
                    <option value="rejected">Reject</option>
                    <option value="more_info_needed">Request More Info</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Admin Notes (optional)
                  </label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={4}
                    placeholder="Add notes about this decision..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleReview}
                    disabled={submitting}
                    className={`px-6 py-2 text-white rounded-md transition-colors ${
                      reviewStatus === 'approved'
                        ? 'bg-green-500 hover:bg-green-600'
                        : reviewStatus === 'rejected'
                          ? 'bg-red-500 hover:bg-red-600'
                          : 'bg-blue-500 hover:bg-blue-600'
                    } disabled:opacity-50`}
                  >
                    {submitting ? 'Submitting...' : 'Submit Review'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Image Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-full">
            <button
              className="absolute -top-10 right-0 text-white text-2xl"
              onClick={() => setSelectedImage(null)}
            >
              &times;
            </button>
            <img
              src={selectedImage.startsWith('http') ? selectedImage : `https://kaarya-4qft.onrender.com${selectedImage}`}
              alt="Document"
              className="max-w-full max-h-[80vh] object-contain rounded"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default VerificationDetail;
