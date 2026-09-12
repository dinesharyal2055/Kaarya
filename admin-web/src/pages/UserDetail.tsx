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

  if (!user) {
    return (
      <div className="neu-page">
        <div className="neu-card neu-empty">User not found</div>
      </div>
    );
  }

  return (
    <div className="neu-page">
      <div className="neu-page-head">
        <h1 className="neu-page-title">User Detail</h1>
        <button
          onClick={() => navigate('/users')}
          className="neu-btn neu-btn-sm"
        >
          Back to Users
        </button>
      </div>
      {error && <div className="neu-error" role="alert">{error}</div>}
      <div className="neu-card">
        <div className="mb-4">
          <h2 className="text-xl font-bold">{user.name}</h2>
          <p className="neu-cell-sub mt-1">{user.email}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <h3 className="neu-section-title">Contact Information</h3>
            <div className="neu-stack">
              <p className="neu-cell-sub text-sm"><strong>Phone:</strong> {user.phone}</p>
              <p className="neu-cell-sub text-sm"><strong>Role:</strong>{' '}
                <span className="neu-badge neu-badge-gray">
                  {user.role}
                </span>
              </p>
            </div>
          </div>
          <div>
            <h3 className="neu-section-title">Account Status</h3>
            <div className="neu-stack">
              <p className="neu-cell-sub text-sm"><strong>Verification:</strong>{' '}
                <span className={`neu-badge
                  ${verificationStatus === 'verified' ? 'neu-badge-green'
                    : verificationStatus === 'pending' ? 'neu-badge-yellow'
                    : 'neu-badge-red'}`}>
                  {verificationStatus.charAt(0).toUpperCase() + verificationStatus.slice(1)}
                </span>
              </p>
              <p className="neu-cell-sub text-sm"><strong>Active:</strong>{' '}
                <span className={`neu-badge
                  ${user.isActive ? 'neu-badge-green' : 'neu-badge-red'}`}>
                  {user.isActive ? 'Yes' : 'No'}
                </span>
              </p>
            </div>
          </div>
          <div>
            <h3 className="neu-section-title">Timestamps</h3>
            <div className="neu-stack">
              <p className="neu-cell-sub text-sm"><strong>Created:</strong> {new Date(user.createdAt).toLocaleString()}</p>
              <p className="neu-cell-sub text-sm"><strong>Updated:</strong> {new Date(user.updatedAt).toLocaleString()}</p>
            </div>
          </div>
        </div>
        {user.bio && (
          <div className="mt-6">
            <h3 className="neu-section-title">Bio</h3>
            <p className="neu-cell-sub">{user.bio}</p>
          </div>
        )}
        <hr className="neu-divider" />
        <h3 className="neu-section-title">Verification Actions</h3>
        <div className="neu-login-form">
          {verificationStatus !== 'verified' && (
            <button
              onClick={handleVerify}
              className="neu-btn neu-btn-primary neu-btn-block"
            >
              Verify User
            </button>
          )}
          {verificationStatus === 'verified' && (
            <button
              onClick={handleUnverify}
              className="neu-btn neu-btn-warn neu-btn-block"
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
              className="neu-btn neu-btn-success neu-btn-block"
            >
              Reactivate User
            </button>
          )}
          {user.isActive && (
            <button
              onClick={handleDeactivate}
              className="neu-btn neu-btn-danger neu-btn-block"
            >
              Deactivate User
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserDetail;
