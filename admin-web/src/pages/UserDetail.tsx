import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useParams, useNavigate } from 'react-router-dom';

const UserDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = async () => {
    const response = await api.get(`/api/admin/users/${id}`);
    setUser(response.data);
  };

  useEffect(() => {
    const fetchUser = async () => {
      if (!id) {
        navigate('/users');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(`/api/admin/users/${id}`);
        setUser(response.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load user detail');
        navigate('/users');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [id, navigate]);

  const verificationStatus = user?.verificationStatus || 'unverified';

  const handleVerify = async () => {
    try {
      const pendingRequest = user?.verificationRequest?.status === 'pending' ? user.verificationRequest : null;
      if (pendingRequest) {
        // A pending request exists — approve the actual verification request
        await api.post(`/api/admin/verifications/${pendingRequest.id}/review`, {
          status: 'approved',
          adminNotes: 'Verified via admin panel'
        });
      } else {
        // No pending request — direct admin override
        await api.put(`/api/admin/users/${id}`, {
          isVerified: true
        });
      }
      await refreshUser();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update verification status');
    }
  };

  const handleUnverify = async () => {
    try {
      await api.put(`/api/admin/users/${id}`, {
        isVerified: false
      });
      await refreshUser();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to unverify user');
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm('Are you sure you want to deactivate this user? This action cannot be undone.')) {
      return;
    }
    try {
      await api.delete(`/api/admin/users/${id}`);
      navigate('/users');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to deactivate user');
    }
  };

  if (loading) {
    return <div className="p-6 text-center py-10">Loading...</div>;
  }

  if (error) {
    return <div className="p-6"><div className="mb-4 p-3 bg-red-100 text-red-800 rounded">{error}</div></div>;
  }

  if (!user) {
    return <div className="p-6 text-center py-10">User not found</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">User Detail</h1>
        <div className="flex space-x-3">
          <button
            onClick={() => navigate('/users')}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
          >
            Back to Users
          </button>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <div className="mb-4">
            <h2 className="text-xl font-bold">{user.name}</h2>
            <p className="text-gray-500 mt-1">{user.email}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <h3 className="text-lg font-medium mb-2">Contact Information</h3>
              <p className="text-gray-600"><strong>Phone:</strong> {user.phone}</p>
              <p className="text-gray-600"><strong>Role:</strong>
                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                  {user.role}
                </span>
              </p>
            </div>
            <div>
              <h3 className="text-lg font-medium mb-2">Account Status</h3>
              <p className="text-gray-600"><strong>Verification:</strong>
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                  ${verificationStatus === 'verified' ? 'bg-green-100 text-green-800'
                    : verificationStatus === 'pending' ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'}`}>
                  {verificationStatus.charAt(0).toUpperCase() + verificationStatus.slice(1)}
                </span>
              </p>
              <p className="text-gray-600"><strong>Active:</strong>
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                  ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {user.isActive ? 'Yes' : 'No'}
                </span>
              </p>
            </div>
            <div>
              <h3 className="text-lg font-medium mb-2">Timestamps</h3>
              <p className="text-gray-600"><strong>Created:</strong> {new Date(user.createdAt).toLocaleString()}</p>
              <p className="text-gray-600"><strong>Updated:</strong> {new Date(user.updatedAt).toLocaleString()}</p>
            </div>
          </div>
          {user.bio && (
            <div className="mt-6">
              <h3 className="text-lg font-medium mb-2">Bio</h3>
              <p className="text-gray-700">{user.bio}</p>
            </div>
          )}
        </div>
        <div className="border-t border-gray-200">
          <div className="p-6">
            <h3 className="text-lg font-medium mb-4">Verification Actions</h3>
            <div className="space-y-3">
              {verificationStatus !== 'verified' && (
                <button
                  onClick={handleVerify}
                  className="w-full bg-primary text-white py-2 px-4 rounded-md hover:bg-primary/90 transition-colors"
                >
                  Verify User
                </button>
              )}
              {verificationStatus === 'verified' && (
                <button
                  onClick={handleUnverify}
                  className="w-full bg-yellow-500 text-white py-2 px-4 rounded-md hover:bg-yellow-600 transition-colors"
                >
                  Unverify User
                </button>
              )}
              {!user.isActive && (
                <button
                  onClick={() => {
                    // Reactivate user
                    api.put(`/api/admin/users/${id}`, { isActive: true })
                      .then(() => {
                        setUser(prev => ({ ...prev, isActive: true }));
                      })
                      .catch(err => {
                        setError(err.response?.data?.error || 'Failed to reactivate user');
                      });
                  }}
                  className="w-full bg-green-500 text-white py-2 px-4 rounded-md hover:bg-green-600 transition-colors"
                >
                  Reactivate User
                </button>
              )}
              {user.isActive && (
                <button
                  onClick={handleDeactivate}
                  className="w-full bg-red-500 text-white py-2 px-4 rounded-md hover:bg-red-600 transition-colors"
                >
                  Deactivate User
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserDetail;