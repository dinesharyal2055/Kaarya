import React, { useEffect, useState } from 'react';
import api from '../services/api';

const STAT_ICONS: Record<string, JSX.Element> = {
  users: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  verified: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  pending: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  jobs: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  ),
};

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    verifiedUsers: 0,
    unverifiedUsers: 0,
    pendingVerifications: 0,
    totalJobs: 0,
    activeJobs: 0,
    completedJobs: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await api.get('/api/admin/dashboard');
        setStats(response.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const cards = [
    { label: 'Total Users', value: stats.totalUsers, icon: STAT_ICONS.users, color: 'text-primary' },
    { label: 'Verified Users', value: stats.verifiedUsers, icon: STAT_ICONS.verified, color: 'text-success' },
    { label: 'Unverified Users', value: stats.unverifiedUsers, icon: STAT_ICONS.users, color: 'text-warning' },
    { label: 'Pending Verifications', value: stats.pendingVerifications, icon: STAT_ICONS.pending, color: 'text-info' },
    { label: 'Total Jobs', value: stats.totalJobs, icon: STAT_ICONS.jobs, color: 'text-primary' },
    { label: 'Active Jobs', value: stats.activeJobs, icon: STAT_ICONS.jobs, color: 'text-success' },
    { label: 'Completed Jobs', value: stats.completedJobs, icon: STAT_ICONS.verified, color: 'text-muted' },
  ];

  return (
    <div className="neu-page">
      <div className="neu-page-head">
        <h1 className="neu-page-title">Dashboard</h1>
      </div>
      {error && <div className="neu-error" role="alert">{error}</div>}
      {loading ? (
        <div className="neu-card neu-loading">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => (
            <div key={card.label} className="neu-card neu-stat">
              <span className="neu-stat-icon" aria-hidden="true">{card.icon}</span>
              <span>
                <p className="neu-stat-label">{card.label}</p>
                <p className={`neu-stat-value ${card.color}`}>{card.value}</p>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
