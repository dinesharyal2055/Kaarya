import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useParams, useNavigate } from 'react-router-dom';

const getJobStatusBadge = (status: string) => {
  const tone =
    status === 'open' ? 'neu-badge-blue'
      : status === 'assigned' ? 'neu-badge-yellow'
        : status === 'in_progress' ? 'neu-badge-orange'
          : status === 'completed' ? 'neu-badge-green'
            : status === 'cancelled' ? 'neu-badge-red'
              : 'neu-badge-gray';
  return (
    <span className={`neu-badge ${tone}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const getOfferStatusBadge = (status: string) => {
  const tone =
    status === 'pending' ? 'neu-badge-yellow'
      : status === 'accepted' ? 'neu-badge-green'
        : status === 'rejected' ? 'neu-badge-red'
          : status === 'withdrawn' ? 'neu-badge-gray'
            : status === 'countered' ? 'neu-badge-blue'
              : 'neu-badge-gray';
  return (
    <span className={`neu-badge ${tone}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const getUrgencyBadge = (urgency: string) => {
  const tone =
    urgency === 'normal' ? 'neu-badge-gray'
      : urgency === 'high' ? 'neu-badge-yellow'
        : 'neu-badge-blue';
  return (
    <span className={`neu-badge ${tone}`}>
      {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
    </span>
  );
};

const JobDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchJob = async () => {
      if (!id) {
        navigate('/jobs');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(`/api/admin/jobs/${id}`);
        setJob(response.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load job detail');
        navigate('/jobs');
      } finally {
        setLoading(false);
      }
    };

    fetchJob();
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="neu-page">
        <div className="neu-card neu-loading">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="neu-page">
        <div className="neu-error" role="alert">{error}</div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="neu-page">
        <div className="neu-card neu-empty">Job not found</div>
      </div>
    );
  }

  return (
    <div className="neu-page">
      <div className="neu-page-head">
        <h1 className="neu-page-title">Job Detail</h1>
        <button
          onClick={() => navigate('/jobs')}
          className="neu-btn neu-btn-sm"
        >
          Back to Jobs
        </button>
      </div>
      <div className="neu-card">
        <div className="mb-4">
          <h2 className="text-xl font-bold">{job.title}</h2>
          <p className="neu-cell-sub mt-1">Job ID: {job.id}</p>
        </div>
        <div className="neu-stack">
          <div>
            <h3 className="neu-section-title">Description</h3>
            <p className="neu-cell-sub">{job.description}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <h3 className="neu-section-title">Basic Information</h3>
              <div className="neu-stack">
                <p className="neu-cell-sub text-sm"><strong>Category:</strong> {job.category}</p>
                <p className="neu-cell-sub text-sm"><strong>Location:</strong> {job.location}</p>
                <p className="neu-cell-sub text-sm"><strong>Budget:</strong> ${job.budgetMin} - ${job.budgetMax}</p>
                <p className="neu-cell-sub text-sm"><strong>Urgency:</strong>{' '}
                  {getUrgencyBadge(job.urgency)}
                </p>
                {job.scheduledDate && (
                  <p className="neu-cell-sub text-sm"><strong>Scheduled Date:</strong> {new Date(job.scheduledDate).toLocaleDateString()}</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="neu-section-title">Status</h3>
              <p className="neu-cell-sub text-sm"><strong>Current Status:</strong>{' '}
                {getJobStatusBadge(job.status)}
              </p>
            </div>
            <div>
              <h3 className="neu-section-title">Timestamps</h3>
              <div className="neu-stack">
                <p className="neu-cell-sub text-sm"><strong>Created:</strong> {new Date(job.createdAt).toLocaleString()}</p>
                <p className="neu-cell-sub text-sm"><strong>Updated:</strong> {new Date(job.updatedAt).toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div>
            <h3 className="neu-section-title">Poster Information</h3>
            <div className="neu-stack">
              <p className="neu-cell-sub text-sm"><strong>Name:</strong> {job.seekerName}</p>
              <p className="neu-cell-sub text-sm"><strong>Email:</strong> {job.seekerEmail}</p>
            </div>
          </div>
          <div>
            <h3 className="neu-section-title">Assigned Provider</h3>
            {job.providerId ? (
              <div className="neu-stack">
                <p className="neu-cell-sub text-sm"><strong>Name:</strong> {job.providerName}</p>
                <p className="neu-cell-sub text-sm"><strong>Email:</strong> {job.providerEmail}</p>
              </div>
            ) : (
              <p className="neu-cell-sub italic">Not assigned yet</p>
            )}
          </div>
        </div>
        {job.offers && job.offers.length > 0 && (
          <div className="neu-divider">
            <h3 className="neu-section-title">Offers ({job.offers.length})</h3>
            <div className="neu-stack">
              {job.offers.map((offer: any, index: number) => (
                <div key={offer.id} className="neu-card">
                  <div className="flex justify-between items-start gap-4">
                    <div className="neu-stack">
                      <p className="neu-cell-sub text-sm"><strong>Offer #{index + 1}</strong></p>
                      <p className="neu-cell-sub text-sm"><strong>Amount:</strong> ${offer.amount}</p>
                      <p className="neu-cell-sub text-sm"><strong>Status:</strong>{' '}
                        {getOfferStatusBadge(offer.status)}
                      </p>
                      {offer.message && (
                        <p className="neu-cell-sub mt-1">{offer.message}</p>
                      )}
                    </div>
                    <div className="text-sm neu-cell-sub whitespace-nowrap">
                      {new Date(offer.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default JobDetail;
