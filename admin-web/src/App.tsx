import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <Layout />
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/verifications" element={<Verifications />} />
          <Route path="/verifications/:id" element={<VerificationDetail />} />
          <Route path="/users" element={<Users />} />
          <Route path="/users/:id" element={<UserDetail />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/offers" element={<Offers />} />
          <Route path="/offers/:id" element={<OfferDetail />} />
          <Route path="/reviews" element={<Reviews />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

// Lazy load pages to reduce initial bundle size
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Verifications = React.lazy(() => import('./pages/Verifications'));
const VerificationDetail = React.lazy(() => import('./pages/VerificationDetail'));
const Users = React.lazy(() => import('./pages/Users'));
const UserDetail = React.lazy(() => import('./pages/UserDetail'));
const Jobs = React.lazy(() => import('./pages/Jobs'));
const JobDetail = React.lazy(() => import('./pages/JobDetail'));
const Offers = React.lazy(() => import('./pages/Offers'));
const OfferDetail = React.lazy(() => import('./pages/OfferDetail'));
const Reviews = React.lazy(() => import('./pages/Reviews'));

export default App;