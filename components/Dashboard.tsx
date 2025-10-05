'use client';
import { useState, useEffect } from 'react';
import ContentScoringExplainer from './ContentScoringExplainer';
import CompactHeader from './CompactHeader';

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
    relevanceScore?: number;
  }>;
  mediaSources: Array<{
    name: string;
    count: number;
    color: string;
    isActive: boolean;
    lastUpdate: string;
    healthStatus: 'healthy' | 'warning' | 'error';
  }>;
  smartSuggestions: Array<{
    id: string;
    title: string;
    source: string;
    reason: string;
    confidence: number;
    category: string;
  }>;
  qualityMetrics: {
    averageScore: number;
    totalProcessed: number;
    successRate: number;
    avgProcessingTime: number;
  };
  duplicateAlerts: Array<{
    id: string;
    title: string;
    source: string;
    similarity: number;
    duplicateOf: string;
  }>;
  lastUpdated: string;
}

export default function Dashboard() {
  const [showExplainer, setShowExplainer] = useState(false);
  
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
    
    // Mock media sources with realistic counts and health status
    const mediaSources = [
      { 
        name: 'GAFFA', 
        count: 456, 
        color: 'from-red-500/20 to-red-600/20',
        isActive: true,
        lastUpdate: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 min ago
        healthStatus: 'healthy' as const
      },
      { 
        name: 'BERLINGSKE', 
        count: 234, 
        color: 'from-green-500/20 to-green-600/20',
        isActive: true,
        lastUpdate: new Date(Date.now() - 8 * 60 * 1000).toISOString(), // 8 min ago
        healthStatus: 'healthy' as const
      },
      { 
        name: 'BT', 
        count: 189, 
        color: 'from-purple-500/20 to-purple-600/20',
        isActive: false,
        lastUpdate: new Date(Date.now() - 45 * 60 * 1000).toISOString(), // 45 min ago
        healthStatus: 'warning' as const
      },
      { 
        name: 'SOUNDVENUE', 
        count: 156, 
        color: 'from-blue-500/20 to-blue-600/20',
        isActive: false,
        lastUpdate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        healthStatus: 'error' as const
      },
      { 
        name: 'EUROMAN', 
        count: 89, 
        color: 'from-orange-500/20 to-orange-600/20',
        isActive: true,
        lastUpdate: new Date(Date.now() - 25 * 60 * 1000).toISOString(), // 25 min ago
        healthStatus: 'healthy' as const
      },
      { 
        name: 'OTHER', 
        count: 123, 
        color: 'from-slate-500/20 to-slate-600/20',
        isActive: true,
        lastUpdate: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
        healthStatus: 'healthy' as const
      }
    ];
    
    // Generate recent activity with realistic data and relevance scores
    const recentActivity = [
      {
        id: '1',
        title: 'Bon Iver hiver knebent sejren i hus',
        status: 'published' as const,
        source: 'GAFFA',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        relevanceScore: 95
      },
      {
        id: '2',
        title: 'Klovn-seriens evolution gennem 10 sæsoner',
        status: 'in-progress' as const,
        source: 'SOUNDVENUE',
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
        relevanceScore: 87
      },
      {
        id: '3',
        title: 'Ny dansk film bryder alle rekorder',
        status: 'queued' as const,
        source: 'BERLINGSKE',
        timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
        relevanceScore: 92
      },
      {
        id: '4',
        title: 'Gaming-industrien i Danmark vokser',
        status: 'pending' as const,
        source: 'BT',
        timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), // 8 hours ago
        relevanceScore: 78
      }
    ];

    // Generate smart suggestions based on user history
    const smartSuggestions = [
      {
        id: 's1',
        title: 'Dansk musik på internationale festivaler',
        source: 'GAFFA',
        reason: 'Baseret på din interesse for musik og festivaler',
        confidence: 89,
        category: 'Musik'
      },
      {
        id: 's2',
        title: 'Nordisk filmindustri i vækst',
        source: 'BERLINGSKE',
        reason: 'Relateret til tidligere læste artikler om film',
        confidence: 76,
        category: 'Film'
      },
      {
        id: 's3',
        title: 'Tech-startups i København',
        source: 'BT',
        reason: 'Matcher dine tidligere søgninger om teknologi',
        confidence: 82,
        category: 'Teknologi'
      }
    ];

    // Generate quality metrics
    const qualityMetrics = {
      averageScore: 87.3,
      totalProcessed: 1247,
      successRate: 94.2,
      avgProcessingTime: 2.3
    };

    // Generate duplicate alerts
    const duplicateAlerts = [
      {
        id: 'd1',
        title: 'Ny dansk film bryder rekorder',
        source: 'BERLINGSKE',
        similarity: 89,
        duplicateOf: 'Ny dansk film bryder alle rekorder'
      },
      {
        id: 'd2',
        title: 'Gaming branchen vokser i Danmark',
        source: 'SOUNDVENUE',
        similarity: 76,
        duplicateOf: 'Gaming-industrien i Danmark vokser'
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
      mediaSources,
      smartSuggestions,
      qualityMetrics,
      duplicateAlerts,
      lastUpdated: new Date().toISOString()
    };
  });

  // Live updates every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(prevStats => {
        // Simulate live updates with small random changes
        const newStats = { ...prevStats };
        
        // Update editorial queue and AI drafts from localStorage
        if (typeof window !== 'undefined') {
          try {
            const editorialQueue = JSON.parse(localStorage.getItem('editorialQueue') || '[]');
            const aiDrafts = JSON.parse(localStorage.getItem('aiDrafts') || '[]');
            newStats.editorialQueue = editorialQueue.length;
            newStats.aiDrafts = aiDrafts.length;
          } catch (error) {
            console.error('Error parsing localStorage:', error);
          }
        }
        
        // Simulate small changes in article counts
        newStats.totalArticles += Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
        newStats.publishedArticles += Math.floor(Math.random() * 2); // 0 or +1
        
        // Update media source health status randomly
        newStats.mediaSources = newStats.mediaSources.map(source => {
          const randomChange = Math.random();
          if (randomChange < 0.1) { // 10% chance of status change
            const statuses: ('healthy' | 'warning' | 'error')[] = ['healthy', 'warning', 'error'];
            const currentIndex = statuses.indexOf(source.healthStatus);
            const newIndex = (currentIndex + Math.floor(Math.random() * 2) + 1) % 3;
            source.healthStatus = statuses[newIndex];
            source.lastUpdate = new Date().toISOString();
          }
          return source;
        });
        
        newStats.lastUpdated = new Date().toISOString();
        return newStats;
      });
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

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
      case 'published': return 'text-green-600 dark:text-slate-400 bg-green-100/70 dark:bg-pure-black';
      case 'in-progress': return 'text-blue-600 dark:text-slate-400 bg-blue-100/70 dark:bg-pure-black';
      case 'pending': return 'text-yellow-600 dark:text-slate-400 bg-yellow-100/70 dark:bg-pure-black';
      case 'queued': return 'text-purple-600 dark:text-slate-400 bg-purple-100/70 dark:bg-pure-black';
      default: return 'text-slate-600 dark:text-slate-400 bg-slate-100/70 dark:bg-pure-black';
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

  const getHealthStatusColor = (status: 'healthy' | 'warning' | 'error') => {
    switch (status) {
      case 'healthy': return 'text-green-600 dark:text-green-400 bg-green-100/70 dark:bg-green-900/30';
      case 'warning': return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100/70 dark:bg-yellow-900/30';
      case 'error': return 'text-red-600 dark:text-red-400 bg-red-100/70 dark:bg-red-900/30';
      default: return 'text-slate-600 dark:text-slate-400 bg-slate-100/70 dark:bg-slate-900/30';
    }
  };

  const getHealthStatusText = (status: 'healthy' | 'warning' | 'error') => {
    switch (status) {
      case 'healthy': return 'Aktiv';
      case 'warning': return 'Advarsel';
      case 'error': return 'Fejl';
      default: return 'Ukendt';
    }
  };

  const getHealthStatusIcon = (status: 'healthy' | 'warning' | 'error') => {
    switch (status) {
      case 'healthy': return '🟢';
      case 'warning': return '🟡';
      case 'error': return '🔴';
      default: return '⚪';
    }
  };

  // Quick Actions handlers
  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'process-queue':
        // Navigate to editorial queue
        window.location.href = '/editorial-queue';
        break;
      case 'ai-drafts':
        // Navigate to AI drafts
        window.location.href = '/ai-drafts';
        break;
      case 'all-media':
        // Navigate to all media
        window.location.href = '/alle-medier';
        break;
      default:
        console.log(`Quick action: ${action}`);
    }
  };

  // AI Integration helper functions
  const getRelevanceScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 dark:text-green-400 bg-green-100/70 dark:bg-green-900/30';
    if (score >= 80) return 'text-blue-600 dark:text-blue-400 bg-blue-100/70 dark:bg-blue-900/30';
    if (score >= 70) return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100/70 dark:bg-yellow-900/30';
    return 'text-red-600 dark:text-red-400 bg-red-100/70 dark:bg-red-900/30';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 85) return 'text-green-600 dark:text-green-400';
    if (confidence >= 70) return 'text-blue-600 dark:text-blue-400';
    return 'text-yellow-600 dark:text-yellow-400';
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 85) return 'text-red-600 dark:text-red-400 bg-red-100/70 dark:bg-red-900/30';
    if (similarity >= 70) return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100/70 dark:bg-yellow-900/30';
    return 'text-orange-600 dark:text-orange-400 bg-orange-100/70 dark:bg-orange-900/30';
  };

  const getQualityScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 dark:text-green-400';
    if (score >= 80) return 'text-blue-600 dark:text-blue-400';
    if (score >= 70) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };


  return (
    <div className="space-y-6">
        <CompactHeader 
          title="Dashboard"
          subtitle={`Live opdateringer aktive • Sidst opdateret: ${formatTimeAgo(stats.lastUpdated)}`}
          actions={
            <button
              onClick={() => setShowExplainer(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/50 dark:bg-pure-black/50 hover:bg-white/70 dark:hover:bg-pure-black/70 rounded-lg border border-white/60 dark:border-white/30 transition-all duration-200 group"
            >
              <svg className="w-4 h-4 text-slate-600 dark:text-slate-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-slate-600 dark:text-slate-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">Content Scoring</span>
            </button>
          }
        />

        {/* Quick Actions Panel */}
        <div className="bg-gradient-to-br from-white/80 to-slate-50/80 dark:from-pure-black dark:to-pure-black backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={() => handleQuickAction('process-queue')}
              className="group flex flex-col items-center gap-2 p-4 bg-white/50 dark:bg-pure-black/50 rounded-xl border border-white/60 dark:border-white/30 hover:bg-white/60 dark:hover:bg-pure-black/60 transition-all duration-200"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center text-white text-lg group-hover:scale-110 transition-transform duration-200">
                ⚡
              </div>
              <span className="text-sm font-medium text-slate-800 dark:text-white">Process Queue</span>
              <span className="text-xs text-slate-600 dark:text-slate-400">{stats.editorialQueue} artikler</span>
            </button>

            <button
              onClick={() => handleQuickAction('ai-drafts')}
              className="group flex flex-col items-center gap-2 p-4 bg-white/50 dark:bg-pure-black/50 rounded-xl border border-white/60 dark:border-white/30 hover:bg-white/60 dark:hover:bg-pure-black/60 transition-all duration-200"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-lg group-hover:scale-110 transition-transform duration-200">
                🤖
              </div>
              <span className="text-sm font-medium text-slate-800 dark:text-white">AI Drafts</span>
              <span className="text-xs text-slate-600 dark:text-slate-400">{stats.aiDrafts} drafts</span>
            </button>

            <button
              onClick={() => handleQuickAction('all-media')}
              className="group flex flex-col items-center gap-2 p-4 bg-white/50 dark:bg-pure-black/50 rounded-xl border border-white/60 dark:border-white/30 hover:bg-white/60 dark:hover:bg-pure-black/60 transition-all duration-200"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center text-white text-lg group-hover:scale-110 transition-transform duration-200">
                📰
              </div>
              <span className="text-sm font-medium text-slate-800 dark:text-white">All Media</span>
              <span className="text-xs text-slate-600 dark:text-slate-400">{stats.totalArticles} artikler</span>
            </button>

          </div>
        </div>

        {/* Stats Grid - Clean Apple Style */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {/* Total Articles */}
          <div className="bg-gradient-to-br from-white/80 to-slate-50/80 dark:from-pure-black dark:to-pure-black backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="text-center">
              <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mb-1">{stats.totalArticles.toLocaleString()}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Total Articles</div>
            </div>
          </div>

          {/* Published */}
          <div className="bg-gradient-to-br from-white/80 to-slate-50/80 dark:from-pure-black dark:to-pure-black backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="text-center">
              <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mb-1">{stats.publishedArticles}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Published</div>
            </div>
          </div>

          {/* In Progress */}
          <div className="bg-gradient-to-br from-white/80 to-slate-50/80 dark:from-pure-black dark:to-pure-black backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="text-center">
              <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mb-1">{stats.inProgress}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">In Progress</div>
            </div>
          </div>

          {/* Pending */}
          <div className="bg-gradient-to-br from-white/80 to-slate-50/80 dark:from-pure-black dark:to-pure-black backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="text-center">
              <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mb-1">{stats.pending}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Pending</div>
            </div>
          </div>

          {/* Editorial Queue */}
          <div className="bg-gradient-to-br from-white/80 to-slate-50/80 dark:from-pure-black dark:to-pure-black backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="text-center">
              <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mb-1">{stats.editorialQueue}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Editorial Queue</div>
            </div>
          </div>

          {/* AI Drafts */}
          <div className="bg-gradient-to-br from-white/80 to-slate-50/80 dark:from-pure-black dark:to-pure-black backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="text-center">
              <div className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mb-1">{stats.aiDrafts}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">AI Drafts</div>
            </div>
          </div>
        </div>

        {/* Recent Activity & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Activity */}
          <div className="bg-gradient-to-br from-white/80 to-slate-50/80 dark:from-pure-black dark:to-pure-black backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Recent Activity</h3>
              <a href="/editorial-queue" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
                View All
              </a>
            </div>
            <div className="space-y-3">
              {stats.recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center gap-3 p-3 bg-white/50 dark:bg-pure-black-800/50 rounded-xl border border-white/60 dark:border-white/30 hover:bg-white/60 dark:hover:bg-black-700/60 transition-all duration-200">
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
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(activity.status)}`}>
                      {getStatusText(activity.status)}
                    </span>
                    {activity.relevanceScore && (
                      <span 
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getRelevanceScoreColor(activity.relevanceScore)} cursor-help`}
                        title={`AI relevans-score: ${activity.relevanceScore}% - Klik på "Content Scoring" for at lære mere`}
                      >
                        {activity.relevanceScore}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-gradient-to-br from-white/80 to-slate-50/80 dark:from-pure-black dark:to-pure-black backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <a 
                href="/alle-medier" 
                className="flex items-center gap-3 p-3 bg-white/50 dark:bg-pure-black/50 rounded-xl border border-white/60 dark:border-white/30 hover:bg-white/60 dark:hover:bg-black/60 transition-all duration-200"
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
                className="flex items-center gap-3 p-3 bg-white/50 dark:bg-pure-black/50 rounded-xl border border-white/60 dark:border-white/30 hover:bg-white/60 dark:hover:bg-black/60 transition-all duration-200"
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
                className="flex items-center gap-3 p-3 bg-white/50 dark:bg-pure-black/50 rounded-xl border border-white/60 dark:border-white/30 hover:bg-white/60 dark:hover:bg-black/60 transition-all duration-200"
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


        {/* AI Integration Features */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Smart Suggestions */}
          <div className="bg-gradient-to-br from-white/80 to-slate-50/80 dark:from-pure-black dark:to-pure-black backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">🤖 Smart Suggestions</h3>
              <span className="text-xs text-slate-600 dark:text-slate-400">AI-powered</span>
            </div>
            <div className="space-y-3">
              {stats.smartSuggestions.map((suggestion) => (
                <div key={suggestion.id} className="group p-3 bg-white/50 dark:bg-pure-black/50 rounded-xl border border-white/60 dark:border-white/30 hover:bg-white/60 dark:hover:bg-pure-black/60 transition-all duration-200">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                      {suggestion.title}
                    </h4>
                    <span 
                      className={`text-xs font-medium ${getConfidenceColor(suggestion.confidence)} cursor-help`}
                      title={`AI confidence: ${suggestion.confidence}% - Hvor sikker er AI'en på denne anbefaling`}
                    >
                      {suggestion.confidence}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-slate-600 dark:text-slate-400">{suggestion.source}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">•</span>
                    <span className="text-xs text-slate-600 dark:text-slate-400">{suggestion.category}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 italic">{suggestion.reason}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Quality Metrics */}
          <div className="bg-gradient-to-br from-white/80 to-slate-50/80 dark:from-pure-black dark:to-pure-black backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">📊 Quality Metrics</h3>
              <span className="text-xs text-slate-600 dark:text-slate-400">AI Performance</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-white/50 dark:bg-pure-black/50 rounded-xl">
                <div className={`text-2xl font-bold ${getQualityScoreColor(stats.qualityMetrics.averageScore)}`}>
                  {stats.qualityMetrics.averageScore}%
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">Avg Score</div>
              </div>
              <div className="text-center p-3 bg-white/50 dark:bg-pure-black/50 rounded-xl">
                <div className={`text-2xl font-bold ${getQualityScoreColor(stats.qualityMetrics.successRate)}`}>
                  {stats.qualityMetrics.successRate}%
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">Success Rate</div>
              </div>
              <div className="text-center p-3 bg-white/50 dark:bg-pure-black/50 rounded-xl">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {stats.qualityMetrics.totalProcessed.toLocaleString()}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">Processed</div>
              </div>
              <div className="text-center p-3 bg-white/50 dark:bg-pure-black/50 rounded-xl">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {stats.qualityMetrics.avgProcessingTime}s
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">Avg Time</div>
              </div>
            </div>
          </div>
        </div>

        {/* Duplicate Detection Alerts */}
        {stats.duplicateAlerts.length > 0 && (
          <div className="bg-gradient-to-br from-white/80 to-slate-50/80 dark:from-pure-black dark:to-pure-black backdrop-blur-xl rounded-2xl p-4 border border-white/40 dark:border-white/20 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">⚠️ Duplicate Detection</h3>
              <span className="text-xs text-slate-600 dark:text-slate-400">{stats.duplicateAlerts.length} alerts</span>
            </div>
            <div className="space-y-3">
              {stats.duplicateAlerts.map((alert) => (
                <div key={alert.id} className="group p-3 bg-white/50 dark:bg-pure-black/50 rounded-xl border border-white/60 dark:border-white/30 hover:bg-white/60 dark:hover:bg-pure-black/60 transition-all duration-200">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                      {alert.title}
                    </h4>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSimilarityColor(alert.similarity)}`}>
                      {alert.similarity}% match
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-slate-600 dark:text-slate-400">{alert.source}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">•</span>
                    <span className="text-xs text-slate-600 dark:text-slate-400">Similar to:</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 italic">{alert.duplicateOf}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Content Scoring Explainer Modal */}
        <ContentScoringExplainer 
          isOpen={showExplainer} 
          onClose={() => setShowExplainer(false)} 
        />
    </div>
  );
}
