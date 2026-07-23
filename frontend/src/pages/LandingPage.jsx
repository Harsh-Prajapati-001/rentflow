import React from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import ThemeToggle from '../components/ThemeToggle';

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Redirect to dashboard if already logged in
  if (user) {
    return <Navigate to={`/${user.role}-dashboard`} replace />;
  }

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="landing-brand">
          <span className="brand-icon">✨</span>
          RentFlow
        </div>
        <div className="landing-nav-actions">
          <ThemeToggle />
          <button className="btn-primary" onClick={() => navigate('/login')}>
            Sign In
          </button>
        </div>
      </nav>

      <main className="hero-section">
        <div className="hero-content">
          <h1>Modern Property<br/><span>Management</span></h1>
          <p>
            RentFlow is the smart, automated way to manage your multi-building properties. 
            Track rent, read meters automatically, and handle tenant requests without the headache.
          </p>
          <button className="btn-primary" style={{ padding: '14px 24px', fontSize: '1rem' }} onClick={() => navigate('/login')}>
            Get Started
          </button>
        </div>
        
        <div className="hero-visual">
          <div className="floating-card">
            <div className="floating-card-header">
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent-grad)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.2rem' }}>💰</div>
              <div>
                <div style={{ fontWeight: '700' }}>Rent Paid</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Just now</div>
              </div>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '8px' }}>₹15,000</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Room 101, Building A</div>
          </div>
        </div>
      </main>

      <section className="features-section">
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🏢</div>
            <h3>Multi-Building Management</h3>
            <p>Manage multiple properties from a single dashboard. Easily switch between buildings and view aggregated stats.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3>Smart Meter Readings</h3>
            <p>Automatically calculate electricity bills based on previous and current meter readings for each room.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📱</div>
            <h3>Tenant Portal</h3>
            <p>Tenants can view their dues, download receipts, and submit maintenance requests directly from their phone.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔐</div>
            <h3>Secure Document Locker</h3>
            <p>Safely store and access tenant ID proofs and rental agreements in the cloud.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
