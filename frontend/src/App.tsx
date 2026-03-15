import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import CsvImport from './pages/CsvImport';
import Reports from './pages/Reports';

const getOnboardingKey = (userId: string) => `onboardingComplete:${userId}`;

const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [userId, setUserId] = useState<string | null>(() => {
    return localStorage.getItem('userId');
  });
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean>(() => {
    const rawUserId = localStorage.getItem('userId');
    const rawToken = localStorage.getItem('token');
    if (!rawToken || !rawUserId) return false;
    return localStorage.getItem(getOnboardingKey(rawUserId)) !== 'true';
  });

  const handleLogin = (newToken: string, loggedInUserId: string, isNewAccount: boolean) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('userId', loggedInUserId);

    const hasCompletedOnboarding =
      localStorage.getItem(getOnboardingKey(loggedInUserId)) === 'true';

    setToken(newToken);
    setUserId(loggedInUserId);
    setNeedsOnboarding(isNewAccount || !hasCompletedOnboarding);
  };

  const handleOnboardingComplete = () => {
    if (userId !== null) {
      localStorage.setItem(getOnboardingKey(userId), 'true');
    }
    setNeedsOnboarding(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    setToken(null);
    setUserId(null);
    setNeedsOnboarding(false);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            token ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Login onLogin={handleLogin} />
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            token ? (
              needsOnboarding ? (
                <Navigate to="/onboarding" replace />
              ) : (
                <Dashboard
                  token={token}
                  onLogout={handleLogout}
                  requireOnboarding={false}
                  onOnboardingComplete={handleOnboardingComplete}
                />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/onboarding"
          element={
            token ? (
              needsOnboarding ? (
                <Dashboard
                  token={token}
                  onLogout={handleLogout}
                  requireOnboarding={true}
                  onOnboardingComplete={handleOnboardingComplete}
                />
              ) : (
                <Navigate to="/dashboard" replace />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        {/* Profile Page */}
        <Route
          path="/profile"
          element={
            token ? (
              <Profile
                username={localStorage.getItem('username') || 'User'}
                onLogout={handleLogout}
                onNavigate={(page) => {
                  // Navigation handled by React Router
                }}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        {/* CSV Import Page */}
        <Route
          path="/csv-import"
          element={
            token ? (
              <CsvImport
                username={localStorage.getItem('username') || 'User'}
                onLogout={handleLogout}
                onNavigate={(page) => {
                  // Navigation handled by React Router
                }}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        {/* Reports Page */}
        <Route
          path="/reports"
          element={
            token ? (
              <Reports
                username={localStorage.getItem('username') || 'User'}
                onLogout={handleLogout}
                onNavigate={(page) => {
                  // Navigation handled by React Router
                }}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        {/* Redirect root to dashboard or login depending on auth state */}
        <Route
          path="/"
          element={
            <Navigate
              to={
                token ? (needsOnboarding ? '/onboarding' : '/dashboard') : '/login'
              }
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
