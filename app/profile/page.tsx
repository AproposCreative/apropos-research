'use client';
import toolStyles from '@/components/tool-surface.module.css';
import { useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import ToolTabs from '@/components/embedded-app/ToolTabs';
import CompactHeader from '../../components/embedded-app/ToolPageHeader';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState({
    displayName: user?.displayName || 'Frederik Kragh',
    email: user?.email || 'frederik.emil.kragh@gmail.com',
    bio: 'Content creator and journalist',
    location: 'Copenhagen, Denmark',
    website: 'https://aproposmagazine.com',
    notifications: {
      email: true,
      push: true,
      weekly: false
    }
  });

  const handleSave = () => {
    setIsEditing(false);
    // Here you would typically save to your backend
    console.log('Profile saved:', profileData);
  };

  const tabs = [
    { id: 'profile', label: 'Profil' },
    { id: 'settings', label: 'Indstillinger' },
    { id: 'notifications', label: 'Notifikationer' },
    { id: 'security', label: 'Sikkerhed' }
  ];

  return (
    <div className={`${toolStyles.legacy} max-w-6xl mx-auto p-2 sm:p-3 space-y-3`}>
      <CompactHeader title="Profil" actions={<ToolTabs value={activeTab} options={tabs} onChange={setActiveTab} label="Profilvisning" />} />

      {/* Content */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-2xl border border-white/20 dark:border-slate-700/50 shadow-2xl ring-1 ring-white/10 dark:ring-slate-700/20 p-8">
        {activeTab === 'profile' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Profile Information</h2>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="px-4 py-2 bg-slate-600 dark:bg-slate-500 text-white rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-400 transition-colors"
              >
                {isEditing ? 'Cancel' : 'Edit Profile'}
              </button>
            </div>

            {/* Avatar */}
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold">
                {profileData.displayName.charAt(0)}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{profileData.displayName}</h3>
                <p className="text-slate-600 dark:text-slate-400">{profileData.email}</p>
                <p className="text-sm text-slate-500 dark:text-slate-500">{profileData.bio}</p>
              </div>
            </div>

            {/* Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Display Name</label>
                <input
                  type="text"
                  value={profileData.displayName}
                  onChange={(e) => setProfileData({...profileData, displayName: e.target.value})}
                  disabled={!isEditing}
                  className="w-full px-4 py-3 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-slate-500 dark:focus:ring-slate-400 focus:border-transparent transition-all duration-200 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email</label>
                <input
                  type="email"
                  value={profileData.email}
                  onChange={(e) => setProfileData({...profileData, email: e.target.value})}
                  disabled={!isEditing}
                  className="w-full px-4 py-3 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-slate-500 dark:focus:ring-slate-400 focus:border-transparent transition-all duration-200 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Bio</label>
                <textarea
                  value={profileData.bio}
                  onChange={(e) => setProfileData({...profileData, bio: e.target.value})}
                  disabled={!isEditing}
                  rows={3}
                  className="w-full px-4 py-3 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-slate-500 dark:focus:ring-slate-400 focus:border-transparent transition-all duration-200 disabled:opacity-50 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Location</label>
                <input
                  type="text"
                  value={profileData.location}
                  onChange={(e) => setProfileData({...profileData, location: e.target.value})}
                  disabled={!isEditing}
                  className="w-full px-4 py-3 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400 focus:ring-2 focus:ring-slate-500 dark:focus:ring-slate-400 focus:border-transparent transition-all duration-200 disabled:opacity-50"
                />
              </div>
            </div>

            {isEditing && (
              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  className="px-3 py-3 bg-slate-600 dark:bg-slate-500 text-white rounded-xl font-medium hover:bg-slate-700 dark:hover:bg-slate-400 transition-colors"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-3 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-white/70 dark:hover:bg-slate-700/70 transition-all duration-200 border border-white/30 dark:border-slate-600/30"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">App Settings</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm rounded-xl border border-white/30 dark:border-slate-600/30">
                <div>
                  <h3 className="font-medium text-slate-800 dark:text-slate-100">Dark Mode</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Toggle between light and dark themes</p>
                </div>
                <button className="px-4 py-2 bg-slate-600 dark:bg-slate-500 text-white rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-400 transition-colors">
                  Toggle
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm rounded-xl border border-white/30 dark:border-slate-600/30">
                <div>
                  <h3 className="font-medium text-slate-800 dark:text-slate-100">Language</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Choose your preferred language</p>
                </div>
                <select className="px-4 py-2 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm border border-white/30 dark:border-slate-600/30 rounded-lg text-slate-800 dark:text-slate-100">
                  <option>English</option>
                  <option>Dansk</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Notification Preferences</h2>
            
            <div className="space-y-4">
              {Object.entries(profileData.notifications).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between p-4 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm rounded-xl border border-white/30 dark:border-slate-600/30">
                  <div>
                    <h3 className="font-medium text-slate-800 dark:text-slate-100 capitalize">{key} Notifications</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {key === 'email' && 'Receive notifications via email'}
                      {key === 'push' && 'Receive push notifications'}
                      {key === 'weekly' && 'Receive weekly digest'}
                    </p>
                  </div>
                  <button
                    onClick={() => setProfileData({
                      ...profileData,
                      notifications: { ...profileData.notifications, [key]: !value }
                    })}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      value 
                        ? 'bg-slate-600 dark:bg-slate-500 text-white hover:bg-slate-700 dark:hover:bg-slate-400'
                        : 'bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm text-slate-700 dark:text-slate-300 border border-white/30 dark:border-slate-600/30'
                    }`}
                  >
                    {value ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Security Settings</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm rounded-xl border border-white/30 dark:border-slate-600/30">
                <div>
                  <h3 className="font-medium text-slate-800 dark:text-slate-100">Change Password</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Update your account password</p>
                </div>
                <button className="px-4 py-2 bg-slate-600 dark:bg-slate-500 text-white rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-400 transition-colors">
                  Change
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm rounded-xl border border-white/30 dark:border-slate-600/30">
                <div>
                  <h3 className="font-medium text-slate-800 dark:text-slate-100">Two-Factor Authentication</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Add an extra layer of security</p>
                </div>
                <button className="px-4 py-2 bg-white/50 dark:bg-pure-black/50 backdrop-blur-sm text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-white/70 dark:hover:bg-slate-700/70 transition-all duration-200 border border-white/30 dark:border-slate-600/30">
                  Enable
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 backdrop-blur-sm rounded-xl border border-red-200 dark:border-red-800/30">
                <div>
                  <h3 className="font-medium text-red-800 dark:text-red-200">Delete Account</h3>
                  <p className="text-sm text-red-600 dark:text-red-400">Permanently delete your account and all data</p>
                </div>
                <button className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
