'use client';
import { useState, useEffect } from 'react';

interface DashboardStats {
  totalArticles: number;
  publishedArticles: number;
  inProgress: number;
  pending: number;
  editorialQueue: number;
  aiDrafts: number;
  recentActivity: Array<{
    id: string;
    title: string;
    status: 'published' | 'in-progress' | 'pending' | 'queued';
    source: string;
    timestamp: string;
  }>;
  mediaSources: Array<{
    name: string;
    count: number;
    color: string;
  }>;
}

export default function Dashboard() {
  // Initialize with default data immediately
  const [stats, setStats] = useState<DashboardStats>(() => {
    // Load editorial queue and AI drafts from localStorage
    let editorialQueue = [];
    let aiDrafts = [];
    
    if (typeof window !== 'undefined') {
      try {
        editorialQueue = JSON.parse(localStorage.getItem('editorialQueue') || '[]');
        aiDrafts = JSON.parse(localStorage.getItem('aiDrafts') || '[]');
      } catch (error) {
        console.error('Error parsing localStorage:', error);
        editorialQueue = [];
        aiDrafts = [];
      }
    }
        
    // Use realistic mock data based on typical content pipeline
    const totalArticles = 1247;
    const publishedArticles = Math.floor(totalArticles * 0.07); // 7% published
    const inProgress = Math.floor(totalArticles * 0.01); // 1% in progress
    const pending = Math.floor(totalArticles * 0.006); // 0.6% pending
    
    // Mock media sources with realistic counts
    const mediaSources = [
      { name: 'GAFFA', count: 456, color: 'from-red-500/20 to-red-600/20' },
      { name: 'BERLINGSKE', count: 234, color: 'from-green-500/20 to-green-600/20' },
      { name: 'BT', count: 189, color: 'from-purple-500/20 to-purple-600/20' },
      { name: 'SOUNDVENUE', count: 156, color: 'from-blue-500/20 to-blue-600/20' },
      { name: 'EUROMAN', count: 89, color: 'from-orange-500/20 to-orange-600/20' },
      { name: 'OTHER', count: 123, color: 'from-slate-500/20 to-slate-600/20' }
    ];
    
    // Generate recent activity with realistic data
    const recentActivity = [
      {
        id: '1',
        title: 'Bon Iver hiver knebent sejren i hus',
        status: 'published' as const,
        source: 'GAFFA',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
      },
      {
        id: '2',
        title: 'Klovn-seriens evolution gennem 10 sæsoner',
        status: 'in-progress' as const,
        source: 'SOUNDVENUE',
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() // 4 hours ago
      },
      {
        id: '3',
        title: 'Ny dansk film bryder alle rekorder',
        status: 'queued' as const,
        source: 'BERLINGSKE',
        timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() // 6 hours ago
      },
      {
        id: '4',
        title: 'Gaming-industrien i Danmark vokser',
        status: 'pending' as const,
        source: 'BT',
        timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString() // 8 hours ago
      }
    ];
    
    return {
      totalArticles,
      publishedArticles,
      inProgress,
      pending,
      editorialQueue: editorialQueue.length,
      aiDrafts: aiDrafts.length,
      recentActivity,
      mediaSources
    };
  });

  const getSourceColor = (source: string) => {
    const colors = {
      'gaffa': 'from-red-500/20 to-red-600/20',
      'soundvenue': 'from-blue-500/20 to-blue-600/20',
      'berlingske': 'from-green-500/20 to-green-600/20',
      'bt': 'from-purple-500/20 to-purple-600/20',
      'euroman': 'from-orange-500/20 to-orange-600/20',
      'unknown': 'from-slate-500/20 to-slate-600/20'
    };
    return colors[source.toLowerCase() as keyof typeof colors] || colors.unknown;
  };

  const getRandomStatus = () => {
    const statuses = ['published', 'in-progress', 'pending', 'queued'] as const;
    return statuses[Math.floor(Math.random() * statuses.length)];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'text-green-600 dark:text-green-400 bg-green-100/70 dark:bg-green-900/30';
      case 'in-progress': return 'text-blue-600 dark:text-blue-400 bg-blue-100/70 dark:bg-blue-900/30';
      case 'pending': return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100/70 dark:bg-yellow-900/30';
      case 'queued': return 'text-purple-600 dark:text-purple-400 bg-purple-100/70 dark:bg-purple-900/30';
      default: return 'text-slate-600 dark:text-slate-400 bg-slate-100/70 dark:bg-slate-800/70';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'published': return 'Publiceret';
      case 'in-progress': return 'I behandling';
      case 'pending': return 'Afventer';
      case 'queued': return 'I kø';
      default: return 'Ukendt';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - time.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 60) return `${diffInMinutes}m siden`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}t siden`;
    return `${Math.floor(diffInMinutes / 1440)}d siden`;
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <div className="space-y-4 p-4">

        {/* Stats Grid - Clean Apple Style */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {/* Total Articles */}
          <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="text-center">
              <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mb-1">{stats.totalArticles.toLocaleString()}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Total Articles</div>
            </div>
          </div>

          {/* Published */}
          <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="text-center">
              <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mb-1">{stats.publishedArticles}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Published</div>
            </div>
          </div>

          {/* In Progress */}
          <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="text-center">
              <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mb-1">{stats.inProgress}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">In Progress</div>
            </div>
          </div>

          {/* Pending */}
          <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="text-center">
              <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mb-1">{stats.pending}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Pending</div>
            </div>
          </div>

          {/* Editorial Queue */}
          <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="text-center">
              <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mb-1">{stats.editorialQueue}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Editorial Queue</div>
            </div>
          </div>

          {/* AI Drafts */}
          <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="text-center">
              <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mb-1">{stats.aiDrafts}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">AI Drafts</div>
            </div>
          </div>
        </div>

        {/* Recent Activity & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Activity */}
          <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Recent Activity</h3>
              <a href="/editorial-queue" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
                View All
              </a>
            </div>
            <div className="space-y-3">
              {stats.recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center gap-3 p-3 bg-white/50 dark:bg-slate-700/50 rounded-xl border border-white/60 dark:border-white/30 hover:bg-white/60 dark:hover:bg-slate-700/60 transition-all duration-200">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate mb-1">
                      {activity.title}
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 dark:text-slate-400">{activity.source}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">•</span>
                      <span className="text-xs text-slate-600 dark:text-slate-400">{formatTimeAgo(activity.timestamp)}</span>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(activity.status)}`}>
                    {getStatusText(activity.status)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <a 
                href="/alle-medier" 
                className="flex items-center gap-3 p-3 bg-white/50 dark:bg-slate-700/50 rounded-xl border border-white/60 dark:border-white/30 hover:bg-white/60 dark:hover:bg-slate-700/60 transition-all duration-200"
              >
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">All Media</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Browse articles from all sources</p>
                </div>
                <svg className="w-4 h-4 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>

              <a 
                href="/editorial-queue" 
                className="flex items-center gap-3 p-3 bg-white/50 dark:bg-slate-700/50 rounded-xl border border-white/60 dark:border-white/30 hover:bg-white/60 dark:hover:bg-slate-700/60 transition-all duration-200"
              >
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">Editorial Queue</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Manage articles for AI processing</p>
                </div>
                <svg className="w-4 h-4 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>

              <a 
                href="/ai-drafts" 
                className="flex items-center gap-3 p-3 bg-white/50 dark:bg-slate-700/50 rounded-xl border border-white/60 dark:border-white/30 hover:bg-white/60 dark:hover:bg-slate-700/60 transition-all duration-200"
              >
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">AI Drafts</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Edit and publish AI-generated articles</p>
                </div>
                <svg className="w-4 h-4 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Media Sources Overview */}
        <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Media Sources</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.mediaSources.map((source) => (
              <a 
                key={source.name}
                href={`/alle-medier?source=${source.name.toLowerCase()}`}
                className="flex items-center gap-3 p-3 bg-white/50 dark:bg-slate-700/50 rounded-xl border border-white/60 dark:border-white/30 hover:bg-white/60 dark:hover:bg-slate-700/60 transition-all duration-200"
              >
                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-600 flex items-center justify-center">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{source.name.charAt(0)}</span>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">{source.name}</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{source.count.toLocaleString()} articles</p>
                </div>
                <svg className="w-4 h-4 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
