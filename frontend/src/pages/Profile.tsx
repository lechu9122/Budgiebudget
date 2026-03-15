import React, { useState, useEffect } from 'react';
import MainLayout from '../components/MainLayout';

interface ProfileProps {
  username: string;
  onLogout: () => void;
  onNavigate: (page: 'dashboard' | 'csv-import' | 'reports' | 'profile') => void;
}

const Profile: React.FC<ProfileProps> = ({ username, onLogout, onNavigate }) => {
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load user data
  useEffect(() => {
    // TODO: Fetch user profile data from backend
    const storedEmail = localStorage.getItem('email') || '';
    setEmail(storedEmail);
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      // TODO: Call API to update profile
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match!' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'New password must be at least 6 characters!' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      // TODO: Call API to change password
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      setMessage({ type: 'success', text: 'Password changed successfully!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to change password. Please check your current password.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout username={username} onLogout={onLogout} onNavigate={onNavigate}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-8 text-3xl font-bold text-gray-900">Profile Settings</h1>

        {/* Message Display */}
        {message && (
          <div
            className={`mb-6 rounded-lg border p-4 ${
              message.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="space-y-6">
          {/* Profile Information */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">Profile Information</h2>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  disabled
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500"
                />
                <p className="mt-1 text-xs text-gray-500">Username cannot be changed</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  placeholder="your.email@example.com"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>

          {/* Change Password */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">Change Password</h2>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  minLength={6}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  minLength={6}
                  required
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>

          {/* Account Statistics */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">Account Statistics</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-sm text-gray-600">Member Since</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-sm text-gray-600">Total Transactions</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">0</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-sm text-gray-600">Budget Categories</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">0</p>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="rounded-lg border-2 border-red-200 bg-red-50 p-6">
            <h2 className="mb-2 text-xl font-semibold text-red-900">Danger Zone</h2>
            <p className="mb-4 text-sm text-red-700">
              Once you delete your account, there is no going back. Please be certain.
            </p>
            <button
              type="button"
              className="rounded-lg border-2 border-red-600 bg-white px-4 py-2 text-red-600 transition hover:bg-red-600 hover:text-white"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete your account? This action cannot be undone!')) {
                  // TODO: Implement account deletion
                  alert('Account deletion not yet implemented');
                }
              }}
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Profile;
