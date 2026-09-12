import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useParams, useNavigate } from 'react-router-dom';

const documentTypeLabel = (documentType?: string) => {
  switch ((documentType || '').toLowerCase()) {
    case 'nid': return 'NID';
    case 'citizenship':
    case 'citizenship_card': return 'Citizenship';
    default: return documentType || '—';
  }
};

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

  if (loading) {
    return (
      <div className="neu-page">
        <div className="neu-card neu-loading">Loading...</div>
      </div>
    );
  }

  if (error && !verification) {
    return (
      <div className="neu-page">
        <div className="neu-error" role="alert">{error}</div>
        <button onClick={() => navigate('/verifications')} className="neu-link">
          Back to Verifications
        </button>
      </div>
    );
  }

  return (
    <div className="neu-page">
      <div className="neu-page-head">
        <div>
          <button onClick={() => navigate('/verifications')} className="neu-link">
            &larr; Back to Verifications
          </button>
          <h1 className="neu-page-title">Verification Request #{id}</h1>
        </div>
        {verification && getStatusBadge(verification.status)}
      </div>

      {error && <div className="neu-error" role="alert">{error}</div>}

      {verification && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Info */}
          <div className="neu-card">
            <h2 className="neu-card-title">User Information</h2>
            <div className="neu-stack">
              <div>
                <span className="neu-field-label">Name</span>
                <p className="neu-field-value">{verification.userName}</p>
              </div>
              <div>
                <span className="neu-field-label">Email</span>
                <p className="neu-field-value">{verification.userEmail}</p>
              </div>
              <div>
                <span className="neu-field-label">Phone</span>
                <p className="neu-field-value">{verification.userPhone || 'N/A'}</p>
              </div>
              <div>
                <span className="neu-field-label">Role</span>
                <p className="neu-field-value capitalize">{verification.userRole}</p>
              </div>
            </div>
          </div>

          {/* Verification Details */}
          <div className="neu-card">
            <h2 className="neu-card-title">Verification Details</h2>
            <div className="neu-stack">
              <div>
                <span className="neu-field-label">Level</span>
                <p className="neu-field-value capitalize">{verification.level}</p>
              </div>
              <div>
                <span className="neu-field-label">Document Type</span>
                <p className="neu-field-value">{documentTypeLabel(verification.documentType)}</p>
              </div>
              <div>
                <span className="neu-field-label">Submitted</span>
                <p className="neu-field-value">{new Date(verification.createdAt).toLocaleString()}</p>
              </div>
              {verification.notes && (
                <div>
                  <span className="neu-field-label">User Notes</span>
                  <p className="neu-field-value">{verification.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Uploaded Documents */}
          <div className="neu-card lg:col-span-2">
            <h2 className="neu-card-title">Uploaded Documents</h2>
            {verification.documents && verification.documents.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {verification.documents.map((doc: string, index: number) => (
                  <div
                    key={index}
                    className="neu-doc-thumb"
                    onClick={() => setSelectedImage(doc)}
                  >
                    <img
                      src={doc.startsWith('http') ? doc : `https://kaarya-4qft.onrender.com${doc}`}
                      alt={`Document ${index + 1}`}
                    />
                    <div className="neu-doc-thumb-caption">
                      Document {index + 1}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="neu-cell-sub">No documents uploaded</p>
            )}
          </div>

          {/* Review Form (only for pending requests) */}
          {verification.status === 'pending' && (
            <div className="neu-card lg:col-span-2">
              <h2 className="neu-card-title">Review Decision</h2>
              <div className="neu-login-form">
                <div>
                  <label className="neu-label">
                    Decision
                  </label>
                  <select
                    value={reviewStatus}
                    onChange={(e) => setReviewStatus(e.target.value)}
                    className="neu-input"
                  >
                    <option value="approved">Approve</option>
                    <option value="rejected">Reject</option>
                    <option value="more_info_needed">Request More Info</option>
                  </select>
                </div>
                <div>
                  <label className="neu-label">
                    Admin Notes (optional)
                  </label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={4}
                    placeholder="Add notes about this decision..."
                    className="neu-input"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleReview}
                    disabled={submitting}
                    className={`neu-btn ${
                      reviewStatus === 'approved'
                        ? 'neu-btn-success'
                        : reviewStatus === 'rejected'
                          ? 'neu-btn-danger'
                          : 'neu-btn-info'
                    }`}
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
              aria-label="Close document preview"
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
