'use client';
import { useState, useEffect } from 'react';
import HeroLogo from './HeroLogo';

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
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalArticles: 0,
    publishedArticles: 0,
    inProgress: 0,
    pending: 0,
    editorialQueue: 0,
    aiDrafts: 0,
    recentActivity: []
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Simulate loading dashboard data
    const loadDashboardData = async () => {
      try {
        setIsLoading(true);
        
        // Load editorial queue from localStorage (only on client)
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
        
        // Simulate some published articles and activity
        const mockStats: DashboardStats = {
          totalArticles: 1247,
          publishedArticles: 89,
          inProgress: 12,
          pending: 8,
          editorialQueue: editorialQueue.length,
          aiDrafts: aiDrafts.length,
          recentActivity: [
            {
              id: '1',
              title: 'Bon Iver hiver knebent sejren i hus',
              status: 'published',
              source: 'GAFFA',
              timestamp: '2025-01-15T14:30:00Z'
            },
            {
              id: '2',
              title: 'Klovn-seriens evolution gennem 10 sæsoner',
              status: 'in-progress',
              source: 'SOUNDVENUE',
              timestamp: '2025-01-15T13:15:00Z'
            },
            {
              id: '3',
              title: 'Ny dansk film bryder alle rekorder',
              status: 'queued',
              source: 'EUROMAN',
              timestamp: '2025-01-15T12:45:00Z'
            },
            {
              id: '4',
              title: 'Gaming-industrien i Danmark vokser',
              status: 'pending',
              source: 'GAFFA',
              timestamp: '2025-01-15T11:20:00Z'
            }
          ]
        };
        
        setStats(mockStats);
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading dashboard data:', error);
        setIsLoading(false);
      }
    };

    loadDashboardData();
  }, []);

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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10 dark:from-blue-400/5 dark:via-purple-400/5 dark:to-pink-400/5 rounded-3xl p-8">
          <div className="text-center">
            <div className="h-16 w-64 bg-slate-200 dark:bg-slate-700 rounded-2xl mx-auto mb-4 animate-pulse" />
            <div className="h-6 w-96 bg-slate-200 dark:bg-slate-700 rounded-lg mx-auto animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10 dark:from-blue-400/5 dark:via-purple-400/5 dark:to-pink-400/5 rounded-3xl p-8">
        <div className="text-center">
          <HeroLogo />
          <p className="text-xl text-slate-600 dark:text-slate-300 font-medium max-w-2xl mx-auto leading-relaxed mt-4">
            Dashboard for Apropos Editorial AI - Overvåg og administrer din content pipeline
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-8">
          {/* Total Articles */}
          <div className="bg-white/10 dark:bg-black/20 backdrop-blur-2xl rounded-3xl p-6 border border-white/10 dark:border-white/5 shadow-2xl hover:shadow-3xl transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 dark:from-blue-400/10 dark:to-blue-500/10 flex items-center justify-center">
                <span className="text-2xl">📊</span>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.totalArticles.toLocaleString()}</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Total artikler</div>
              </div>
            </div>
          </div>

          {/* Published */}
          <div className="bg-white/10 dark:bg-black/20 backdrop-blur-2xl rounded-3xl p-6 border border-white/10 dark:border-white/5 shadow-2xl hover:shadow-3xl transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-600/20 dark:from-green-400/10 dark:to-green-500/10 flex items-center justify-center">
                <span className="text-2xl">✅</span>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.publishedArticles}</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Publiceret</div>
              </div>
            </div>
          </div>

          {/* In Progress */}
          <div className="bg-white/10 dark:bg-black/20 backdrop-blur-2xl rounded-3xl p-6 border border-white/10 dark:border-white/5 shadow-2xl hover:shadow-3xl transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 dark:from-blue-400/10 dark:to-blue-500/10 flex items-center justify-center">
                <span className="text-2xl">⚡</span>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.inProgress}</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">I behandling</div>
              </div>
            </div>
          </div>

          {/* Pending */}
          <div className="bg-white/10 dark:bg-black/20 backdrop-blur-2xl rounded-3xl p-6 border border-white/10 dark:border-white/5 shadow-2xl hover:shadow-3xl transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 dark:from-yellow-400/10 dark:to-yellow-500/10 flex items-center justify-center">
                <span className="text-2xl">⏳</span>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.pending}</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Afventer</div>
              </div>
            </div>
          </div>

          {/* Editorial Queue */}
          <div className="bg-white/10 dark:bg-black/20 backdrop-blur-2xl rounded-3xl p-6 border border-white/10 dark:border-white/5 shadow-2xl hover:shadow-3xl transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-600/20 dark:from-purple-400/10 dark:to-purple-500/10 flex items-center justify-center">
                <span className="text-2xl">📝</span>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.editorialQueue}</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Editorial Queue</div>
              </div>
            </div>
          </div>

          {/* AI Drafts */}
          <div className="bg-white/10 dark:bg-black/20 backdrop-blur-2xl rounded-3xl p-6 border border-white/10 dark:border-white/5 shadow-2xl hover:shadow-3xl transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/20 dark:from-indigo-400/10 dark:to-indigo-500/10 flex items-center justify-center">
                <span className="text-2xl">🤖</span>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.aiDrafts}</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">AI Drafts</div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Recent Activity */}
          <div className="bg-white/10 dark:bg-black/20 backdrop-blur-2xl rounded-3xl p-6 border border-white/10 dark:border-white/5 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Seneste aktivitet</h3>
              <a href="/editorial-queue" className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
                Se alle →
              </a>
            </div>
            <div className="space-y-4">
              {stats.recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center gap-4 p-4 bg-white/5 dark:bg-black/10 rounded-2xl border border-white/10 dark:border-white/5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-500/20 to-slate-600/20 dark:from-slate-400/10 dark:to-slate-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg">📄</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                      {activity.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-500 dark:text-slate-400">{activity.source}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">•</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{formatTimeAgo(activity.timestamp)}</span>
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
          <div className="bg-white/10 dark:bg-black/20 backdrop-blur-2xl rounded-3xl p-6 border border-white/10 dark:border-white/5 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-6">Hurtige handlinger</h3>
            <div className="space-y-4">
              <a 
                href="/alle-medier" 
                className="flex items-center gap-4 p-4 bg-white/5 dark:bg-black/10 rounded-2xl border border-white/10 dark:border-white/5 hover:bg-white/10 dark:hover:bg-black/20 transition-all duration-300 group"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 dark:from-blue-400/10 dark:to-blue-500/10 flex items-center justify-center">
                  <span className="text-lg group-hover:scale-110 transition-transform">📰</span>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-slate-800 dark:text-slate-100">Alle medier</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Se alle artikler fra alle kilder</p>
                </div>
                <span className="text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300">→</span>
              </a>

              <a 
                href="/editorial-queue" 
                className="flex items-center gap-4 p-4 bg-white/5 dark:bg-black/10 rounded-2xl border border-white/10 dark:border-white/5 hover:bg-white/10 dark:hover:bg-black/20 transition-all duration-300 group"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/20 dark:from-purple-400/10 dark:to-purple-500/10 flex items-center justify-center">
                  <span className="text-lg group-hover:scale-110 transition-transform">📝</span>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-slate-800 dark:text-slate-100">Editorial Queue</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Administrer artikler til AI-behandling</p>
                </div>
                <span className="text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300">→</span>
              </a>

              <a 
                href="/ai-drafts" 
                className="flex items-center gap-4 p-4 bg-white/5 dark:bg-black/10 rounded-2xl border border-white/10 dark:border-white/5 hover:bg-white/10 dark:hover:bg-black/20 transition-all duration-300 group"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/20 dark:from-indigo-400/10 dark:to-indigo-500/10 flex items-center justify-center">
                  <span className="text-lg group-hover:scale-110 transition-transform">🤖</span>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-slate-800 dark:text-slate-100">AI Drafts</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Rediger og publicer AI-genererede artikler</p>
                </div>
                <span className="text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300">→</span>
              </a>
            </div>
          </div>
        </div>

        {/* Media Sources Overview */}
        <div className="bg-white/10 dark:bg-black/20 backdrop-blur-2xl rounded-3xl p-6 border border-white/10 dark:border-white/5 shadow-2xl">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-6">Medie kilder</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <a 
              href="/alle-medier?source=gaffa" 
              className="flex items-center gap-4 p-4 bg-white/5 dark:bg-black/10 rounded-2xl border border-white/10 dark:border-white/5 hover:bg-white/10 dark:hover:bg-black/20 transition-all duration-300 group"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/20 dark:from-red-400/10 dark:to-red-500/10 flex items-center justify-center">
                <span className="text-xl font-bold text-red-600 dark:text-red-400">G</span>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-slate-800 dark:text-slate-100">GAFFA</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">100 artikler</p>
              </div>
              <span className="text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300">→</span>
            </a>

            <a 
              href="/alle-medier?source=soundvenue" 
              className="flex items-center gap-4 p-4 bg-white/5 dark:bg-black/10 rounded-2xl border border-white/10 dark:border-white/5 hover:bg-white/10 dark:hover:bg-black/20 transition-all duration-300 group"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 dark:from-blue-400/10 dark:to-blue-500/10 flex items-center justify-center">
                <span className="text-xl font-bold text-blue-600 dark:text-blue-400">S</span>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-slate-800 dark:text-slate-100">Soundvenue</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">13 artikler</p>
              </div>
              <span className="text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300">→</span>
            </a>

            <a 
              href="/alle-medier?source=euroman" 
              className="flex items-center gap-4 p-4 bg-white/5 dark:bg-black/10 rounded-2xl border border-white/10 dark:border-white/5 hover:bg-white/10 dark:hover:bg-black/20 transition-all duration-300 group"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/20 dark:from-green-400/10 dark:to-green-500/10 flex items-center justify-center">
                <span className="text-xl font-bold text-green-600 dark:text-green-400">E</span>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-slate-800 dark:text-slate-100">EUROMAN</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">0 artikler</p>
              </div>
              <span className="text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300">→</span>
            </a>
          </div>
        </div>
    </div>
  );
}
