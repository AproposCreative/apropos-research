'use client';
import { useState, useEffect } from 'react';
import AddMediaModal from './AddMediaModal';
import EditMediaModal from './EditMediaModal';

interface MediaSource {
  id: string;
  name: string;
  baseUrl: string;
  sitemapIndex: string;
  enabled: boolean;
  addedAt: string;
}

export default function MediaManagementClient() {
  const [sources, setSources] = useState<MediaSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSource, setEditingSource] = useState<MediaSource | null>(null);
  const [error, setError] = useState('');

  // Load media sources
  const loadSources = async () => {
    try {
      const response = await fetch('/api/media-sources');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Fejl ved indlæsning af mediekilder');
      }
      
      setSources(data.sources);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'En fejl opstod');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  // Handle adding new source
  const handleAddSuccess = (newSource: MediaSource) => {
    setSources(prev => [...prev, newSource]);
    setShowAddModal(false);
    // Trigger a page refresh to reload data
    window.location.reload();
  };

  // Handle editing source
  const handleEdit = (source: MediaSource) => {
    setEditingSource(source);
    setShowEditModal(true);
  };

  // Handle edit success
  const handleEditSuccess = (updatedSource: MediaSource) => {
    setSources(prev => prev.map(source => 
      source.id === updatedSource.id ? updatedSource : source
    ));
    setShowEditModal(false);
    setEditingSource(null);
    // Trigger a page refresh to reload data
    window.location.reload();
  };

  // Handle deleting source
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Er du sikker på at du vil fjerne "${name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/media-sources?id=${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Fejl ved sletning af mediekilde');
      }

      setSources(prev => prev.filter(source => source.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'En fejl opstod');
    }
  };

  // Handle toggling source
  const handleToggle = async (id: string, enabled: boolean) => {
    // TODO: Implement toggle functionality in API
    console.log('Toggle source:', id, enabled);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 animate-pulse">
              <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded mb-4"></div>
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded mb-2"></div>
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded mb-4"></div>
              <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Mediekilder ({sources.length})
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            Administrer hvilke mediekilder der skal bruges til at hente artikler
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors flex items-center gap-2 shadow-lg hover:shadow-xl"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Tilføj mediekilde
        </button>
      </div>

      {/* Media Sources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sources.map((source) => (
          <div key={source.id} className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {source.name}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Tilføjet {new Date(source.addedAt).toLocaleDateString('da-DK')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Toggle Switch */}
                <button
                  onClick={() => handleToggle(source.id, !source.enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                    source.enabled
                      ? 'bg-primary-600' 
                      : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                  role="switch"
                  aria-checked={source.enabled}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform duration-300 ease-out ${
                      source.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                {/* Edit Button */}
                <button
                  onClick={() => handleEdit(source)}
                  className="p-1 text-slate-400 hover:text-blue-500 transition-colors"
                  title="Rediger mediekilde"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                {/* Delete Button */}
                <button
                  onClick={() => handleDelete(source.id, source.name)}
                  className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                  title="Slet mediekilde"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Hjemmeside URL
                </label>
                <p className="text-sm text-slate-700 dark:text-slate-300 font-mono bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-lg">
                  {source.baseUrl}
                </p>
              </div>
              
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Sitemap URL
                </label>
                <p className="text-sm text-slate-700 dark:text-slate-300 font-mono bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-lg">
                  {source.sitemapIndex}
                </p>
              </div>
            </div>

            {/* Status */}
            <div className="mt-4 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${source.enabled ? 'bg-green-500' : 'bg-slate-400'}`}></div>
              <span className={`text-sm font-medium ${source.enabled ? 'text-green-700 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {source.enabled ? 'Aktiveret' : 'Deaktiveret'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {sources.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Ingen mediekilder
          </h3>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Tilføj din første mediekilde for at komme i gang
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors"
          >
            Tilføj mediekilde
          </button>
        </div>
      )}

      {/* Add Media Modal */}
      <AddMediaModal 
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
      />

      {/* Edit Media Modal */}
      {editingSource && (
        <EditMediaModal 
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingSource(null);
          }}
          onSuccess={handleEditSuccess}
          source={editingSource}
        />
      )}
    </div>
  );
}
