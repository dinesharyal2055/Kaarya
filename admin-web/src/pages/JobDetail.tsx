import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useParams, useNavigate } from 'react-router-dom';

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
    return <div className="p-6 text-center py-10">Loading...</div>;
  }

  if (error) {
    return <div className="p-6"><div className="mb-4 p-3 bg-red-100 text-red-800 rounded">{error}</div></div>;
  }

  if (!job) {
    return <div className="p-6 text-center py-10">Job not found</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Job Detail</h1>
        <div className="flex space-x-3">
          <button
            onClick={() => navigate('/jobs')}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
          >
            Back to Jobs
          </button>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <div className="mb-4">
            <h2 className="text-xl font-bold">{job.title}</h2>
            <p className="text-gray-500 mt-1">Job ID: {job.id}</p>
          </div>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-2">Description</h3>
              <p className="text-gray-700">{job.description}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <h3 className="text-lg font-medium mb-2">Basic Information</h3>
                <p className="text-gray-600"><strong>Category:</strong> {job.category}</p>
                <p className="text-gray-600"><strong>Location:</strong> {job.location}</p>
                <p className="text-gray-600"><strong>Budget:</strong> ${job.budgetMin} - ${job.budgetMax}</p>
                <p className="text-gray-600"><strong>Urgency:</strong>
                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                    ${job.urgency === 'normal' ? 'bg-gray-100 text-gray-800'
                      : job.urgency === 'high' ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-blue-100 text-blue-800'}">
                    {job.urgency.charAt(0).toUpperCase() + job.urgency.slice(1)}
                  </span>
                </p>
                {job.scheduledDate && (
                  <p className="text-gray-600"><strong>Scheduled Date:</strong> {new Date(job.scheduledDate).toLocaleDateString()}</p>
                )}
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Status</h3>
                <p className="text-gray-600"><strong>Current Status:</strong>
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                    ${job.status === 'open' ? 'bg-blue-100 text-blue-800'
                      : job.status === 'assigned' ? 'bg-yellow-100 text-yellow-800'
                      : job.status === 'in_progress' ? 'bg-orange-100 text-orange-800'
                      : job.status === 'completed' ? 'bg-green-100 text-green-800'
                      : job.status === 'cancelled' ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'}`}>
                  {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                </span>
                </p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Timestamps</h3>
                <p className="text-gray-600"><strong>Created:</strong> {new Date(job.createdAt).toLocaleString()}</p>
                <p className="text-gray-600"><strong>Updated:</strong> {new Date(job.updatedAt).toLocaleString()}</p>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-medium mb-2">Poster Information</h3>
              <p className="text-gray-600"><strong>Name:</strong> {job.seekerName}</p>
              <p className="text-gray-600"><strong>Email:</strong> {job.seekerEmail}</p>
            </div>
            <div>
              <h3 className="text-lg font-medium mb-2">Assigned Provider</h3>
              {job.providerId ? (
                <>
                  <p className="text-gray-600"><strong>Name:</strong> {job.providerName}</p>
                  <p className="text-gray-600"><strong>Email:</strong> {job.providerEmail}</p>
                </>
              ) : (
                <p className="text-gray-600 italic">Not assigned yet</p>
              )}
            </div>
          </div>
          {job.offers && job.offers.length > 0 && (
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-medium mb-4">Offers ({job.offers.length})</h3>
              <div className="space-y-4">
                {job.offers.map((offer: any, index: number) => (
                  <div key={offer.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-gray-600"><strong>Offer #{index + 1}</strong></p>
                        <p className="text-gray-600"><strong>Amount:</strong> ${offer.amount}</p>
                        <p className="text-gray-600"><strong>Status:</strong>
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                            ${offer.status === 'pending' ? 'bg-yellow-100 text-yellow-800'
                              : offer.status === 'accepted' ? 'bg-green-100 text-green-800'
                              : offer.status === 'rejected' ? 'bg-red-100 text-red-800'
                              : offer.status === 'withdrawn' ? 'bg-gray-100 text-gray-800'
                              : offer.status === 'countered' ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'}">
                            {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
                          </span>
                        </p>
                        {offer.message && (
                          <p className="text-gray-700 mt-1">{offer.message}</p>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
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
    </div>
  );
};

export default JobDetail;