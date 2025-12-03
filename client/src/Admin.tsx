import { useState, useEffect } from 'react';
import axios from 'axios';
import DeepDive from './DeepDive';
import BlogManagement from './BlogManagement';
import MenuBar from './MenuBar';
import Footer from './Footer';
import './App.css';

// EST timezone helpers (America/New_York handles EST/EDT automatically)
const EST_TIMEZONE = 'America/New_York';

// Convert EST datetime-local string to UTC ISO string
function estToUTC(estDateTime: string): string {
  const [datePart, timePart] = estDateTime.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  
  const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  
  const testDate = new Date(dateString);
  const estOffsetMs = getESTOffsetMs(testDate);
  const utcDate = new Date(testDate.getTime() - estOffsetMs);
  return utcDate.toISOString();
}

function getESTOffsetMs(date: Date): number {
  const estTimeString = date.toLocaleString('en-US', { 
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const utcString = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const estDate = new Date(estTimeString);
  const utcDate = new Date(utcString);
  return estDate.getTime() - utcDate.getTime();
}

function formatEST(dateISO: string): string {
  return new Date(dateISO).toLocaleString('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

interface JobProgress {
  jobId: string;
  status: 'pending' | 'scraping' | 'analyzing' | 'fetching_prices' | 'fetching_nfts' | 'generating_script' | 'creating_video' | 'updating_timestamps' | 'creating_thumbnail' | 'ready' | 'uploading' | 'generating_blog' | 'posting_blog' | 'completed' | 'error';
  progress: number;
  message: string;
  result?: {
    success: boolean;
    videoId?: string;
    videoUrl?: string;
    script?: {
      title: string;
      description: string;
      tags: string[];
    };
    videoPath?: string;
    thumbnailPath?: string;
    readyForApproval?: boolean;
    blogUrl?: string;
    blogId?: string;
    error?: string;
  };
}

interface AutomationState {
  isRunning: boolean;
  cadenceHours: number;
  lastRun?: string;
  nextRun?: string;
  currentJobId?: string;
}

function Admin() {
  // Load saved tab from localStorage, default to 'news'
  const getInitialTab = (): 'news' | 'deepdive' | 'blog' => {
    try {
      const savedTab = localStorage.getItem('adminActiveTab');
      if (savedTab === 'news' || savedTab === 'deepdive' || savedTab === 'blog') {
        return savedTab;
      }
    } catch (error) {
      // localStorage might not be available (SSR, private browsing, etc.)
      console.warn('Could not access localStorage:', error);
    }
    return 'news';
  };

  const [activeTab, setActiveTab] = useState<'news' | 'deepdive' | 'blog'>(getInitialTab);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [automationState, setAutomationState] = useState<AutomationState | null>(null);
  const [cadenceInput, setCadenceInput] = useState<string>('6');
  const [startTimeInput, setStartTimeInput] = useState<string>('');
  const [automationLoading, setAutomationLoading] = useState(false);

  const handleCreateVideo = async () => {
    setLoading(true);
    setError(null);
    
    const initialProgress: JobProgress = {
      jobId: '',
      status: 'pending',
      progress: 0,
      message: 'Initializing video creation...'
    };
    setProgress(initialProgress);

    try {
      const response = await axios.post<{ success: boolean; jobId: string; message: string }>('/api/video/create');
      
      if (response.data.jobId) {
        setProgress(prev => prev ? { ...prev, jobId: response.data.jobId } : initialProgress);
        pollStatus(response.data.jobId);
      }
    } catch (err) {
      const errorMessage = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : 'Unknown error occurred';
      setError(errorMessage);
      setLoading(false);
      setProgress(null);
    }
  };

  const pollStatus = async (jobId: string) => {
    const maxAttempts = 120;
    let attempts = 0;
    let consecutive404s = 0;
    let interval: NodeJS.Timeout | null = null;

    const poll = async () => {
      attempts++;
      
      try {
        const response = await axios.get<JobProgress>(`/api/video/status/${jobId}`);
        consecutive404s = 0;
        setProgress(response.data);
        setLoading(response.data.status !== 'ready' && response.data.status !== 'completed' && response.data.status !== 'error');

        if (response.data.status === 'error') {
          if (interval) clearInterval(interval);
          setLoading(false);
          if (response.data.result?.error) {
            setError(response.data.result.error);
          } else if (response.data.message) {
            setError(response.data.message);
          }
        } else if (response.data.status === 'completed' || response.data.status === 'ready') {
          if (interval) clearInterval(interval);
          setLoading(false);
        } else if (attempts >= maxAttempts) {
          if (interval) clearInterval(interval);
          setLoading(false);
          setError('Video creation is taking longer than expected. Check server logs.');
        }
      } catch (err) {
        if (err && axios.isAxiosError(err) && err.response?.status === 404) {
          consecutive404s++;
          if (consecutive404s <= 15) {
            setProgress(prev => prev ? {
              ...prev,
              message: 'Waiting for job to initialize...',
              progress: 0
            } : {
              jobId,
              status: 'pending',
              progress: 0,
              message: 'Waiting for job to initialize...'
            });
            return;
          } else {
            if (interval) clearInterval(interval);
            setLoading(false);
            setError('Job not found. The server may have restarted. Please try creating a new video.');
            setProgress(null);
          }
        } else {
          console.error('Error polling status:', err);
          const errorMessage = axios.isAxiosError(err)
            ? err.response?.data?.message || err.message
            : 'Error checking status';
          
          if (attempts >= maxAttempts) {
            if (interval) clearInterval(interval);
            setLoading(false);
            setError(errorMessage);
          }
        }
      }
    };

    await poll();
    interval = setInterval(poll, 2000);
  };

  const handleApproveAndUpload = async (jobId: string) => {
    setUploading(true);
    setError(null);

    try {
      const response = await axios.post(`/api/video/approve/${jobId}`);
      
      if (response.data.success) {
        setProgress(prev => prev ? {
          ...prev,
          status: 'completed',
          progress: 100,
          message: `Upload successful! Video is live on YouTube.`,
          result: response.data
        } : null);
      }
    } catch (err) {
      const errorMessage = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : 'Unknown error occurred';
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const getStatusIcon = (status: JobProgress['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'scraping': return '🔍';
      case 'analyzing': return '🤖';
      case 'fetching_prices': return '📊';
      case 'fetching_nfts': return '🖼️';
      case 'generating_script': return '✍️';
      case 'creating_video': return '🎬';
      case 'updating_timestamps': return '⏱️';
      case 'creating_thumbnail': return '🖼️';
      case 'ready': return '✅';
      case 'uploading': return '📤';
      case 'generating_blog': return '✍️';
      case 'posting_blog': return '📝';
      case 'completed': return '🎉';
      case 'error': return '❌';
      default: return '⏳';
    }
  };

  const getVideoPreviewUrl = (videoPath?: string) => {
    if (!videoPath) return null;
    const filename = videoPath.split('/').pop() || videoPath.split('\\').pop();
    return `/api/video/preview/video/${filename}`;
  };

  const getThumbnailPreviewUrl = (thumbnailPath?: string) => {
    if (!thumbnailPath) return null;
    const filename = thumbnailPath.split('/').pop() || thumbnailPath.split('\\').pop();
    return `/api/video/preview/thumbnail/${filename}`;
  };

  const fetchAutomationStatus = async () => {
    try {
      const response = await axios.get<{ success: boolean; isRunning: boolean; cadenceHours: number; lastRun?: string; nextRun?: string; currentJobId?: string }>('/api/automation/status');
      if (response.data.success) {
        setAutomationState({
          isRunning: response.data.isRunning,
          cadenceHours: response.data.cadenceHours,
          lastRun: response.data.lastRun,
          nextRun: response.data.nextRun,
          currentJobId: response.data.currentJobId
        });
      }
    } catch (err) {
      console.error('Error fetching automation status:', err);
    }
  };

  useEffect(() => {
    fetchAutomationStatus();
    const interval = setInterval(fetchAutomationStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Save active tab to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('adminActiveTab', activeTab);
    } catch (error) {
      // localStorage might not be available (SSR, private browsing, etc.)
      console.warn('Could not save to localStorage:', error);
    }
  }, [activeTab]);

  const handleStartAutomation = async () => {
    setAutomationLoading(true);
    try {
      const cadence = parseInt(cadenceInput);
      if (isNaN(cadence) || cadence < 1) {
        setError('Cadence must be a number greater than 0');
        setAutomationLoading(false);
        return;
      }

      const startTime = startTimeInput ? estToUTC(startTimeInput) : undefined;

      const response = await axios.post('/api/automation/start', {
        cadenceHours: cadence,
        startTime
      });

      if (response.data.success) {
        await fetchAutomationStatus();
        setError(null);
      } else {
        setError(response.data.error || 'Failed to start automation');
      }
    } catch (err) {
      const errorMessage = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : 'Unknown error occurred';
      setError(errorMessage);
    } finally {
      setAutomationLoading(false);
    }
  };

  const handleStopAutomation = async () => {
    setAutomationLoading(true);
    try {
      const response = await axios.post('/api/automation/stop');
      if (response.data.success) {
        await fetchAutomationStatus();
        setError(null);
      } else {
        setError(response.data.error || 'Failed to stop automation');
      }
    } catch (err) {
      const errorMessage = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : 'Unknown error occurred';
      setError(errorMessage);
    } finally {
      setAutomationLoading(false);
    }
  };

  return (
    <>
      <MenuBar />
      <div className="app">
        <div className="container">
          <header className="header">
            <h1 className="title">
              <span className="crypto-icon">₿</span>
              Crypto B - Admin Panel
            </h1>
            <p className="subtitle">Automated YouTube Crypto News Bot</p>
          </header>

        <div className="tabs">
          <button
            className={`tab ${activeTab === 'news' ? 'active' : ''}`}
            onClick={() => setActiveTab('news')}
          >
            📰 News Updates
          </button>
          <button
            className={`tab ${activeTab === 'deepdive' ? 'active' : ''}`}
            onClick={() => setActiveTab('deepdive')}
          >
            🎯 Deep Dive Videos
          </button>
          <button
            className={`tab ${activeTab === 'blog' ? 'active' : ''}`}
            onClick={() => setActiveTab('blog')}
          >
            📝 Blog Management
          </button>
        </div>

        {activeTab === 'deepdive' ? (
          <DeepDive />
        ) : activeTab === 'blog' ? (
          <BlogManagement />
        ) : (
          <main className="main">
            {/* Automation Section */}
            <div className="card">
              <div className="card-header">
                <h2>🤖 Automated Video Creation</h2>
                <p className="card-description">
                  Set up automatic video creation and upload. Videos will be created and uploaded automatically at the specified interval.
                </p>
              </div>

              <div className="automation-controls">
                <div className="automation-status">
                  <div className="status-indicator">
                    <span className={`status-dot ${automationState?.isRunning ? 'running' : 'stopped'}`}></span>
                    <span className="status-text">
                      {automationState?.isRunning ? '🟢 Running' : '🔴 Stopped'}
                    </span>
                  </div>
                  {automationState?.isRunning && (
                    <div className="automation-info">
                      <p><strong>Cadence:</strong> Every {automationState.cadenceHours} hour{automationState.cadenceHours !== 1 ? 's' : ''}</p>
                      {automationState.lastRun && (
                        <p><strong>Last Run:</strong> {formatEST(automationState.lastRun)} EST</p>
                      )}
                      {automationState.nextRun && (
                        <p><strong>Next Run:</strong> {formatEST(automationState.nextRun)} EST</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="automation-settings">
                  <div className="form-group">
                    <label htmlFor="cadence">Cadence (hours):</label>
                    <input
                      id="cadence"
                      type="number"
                      min="1"
                      value={cadenceInput}
                      onChange={(e) => setCadenceInput(e.target.value)}
                      disabled={automationState?.isRunning || automationLoading}
                      placeholder="6"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="startTime">Start Time (EST, optional):</label>
                    <input
                      id="startTime"
                      type="datetime-local"
                      value={startTimeInput}
                      onChange={(e) => setStartTimeInput(e.target.value)}
                      disabled={automationState?.isRunning || automationLoading}
                    />
                  </div>

                  {!automationState?.isRunning ? (
                    <button
                      onClick={handleStartAutomation}
                      disabled={automationLoading}
                      className="start-automation-button"
                    >
                      {automationLoading ? (
                        <>
                          <span className="spinner"></span>
                          Starting...
                        </>
                      ) : (
                        <>
                          <span>▶️</span>
                          Start Automation
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={handleStopAutomation}
                      disabled={automationLoading}
                      className="stop-automation-button"
                    >
                      {automationLoading ? (
                        <>
                          <span className="spinner"></span>
                          Stopping...
                        </>
                      ) : (
                        <>
                          <span>⏹️</span>
                          Stop Automation
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Manual Video Creation Section */}
            <div className="card">
              <div className="card-header">
                <h2>Create New Video</h2>
                <p className="card-description">
                  Generate a YouTube video with the latest crypto news from the last 6 hours.
                  Preview and approve before uploading to YouTube.
                </p>
              </div>

              <button
                onClick={handleCreateVideo}
                disabled={loading || uploading}
                className="create-button"
              >
                {loading ? (
                  <>
                    <span className="spinner"></span>
                    Creating Video...
                  </>
                ) : (
                  <>
                    <span>🎬</span>
                    Create Video
                  </>
                )}
              </button>

              {error && (
                <div className="error-message">
                  <p>❌ {error}</p>
                </div>
              )}

              {progress && (
                <div className="progress-section">
                  <div className="progress-header">
                    <span className="status-icon">{getStatusIcon(progress.status)}</span>
                    <div className="progress-info">
                      <h3>{progress.message}</h3>
                      <p className="progress-status">Status: {progress.status}</p>
                    </div>
                  </div>
                  <div className="progress-bar-container">
                    <div
                      className="progress-bar"
                      style={{ width: `${progress.progress}%` }}
                    ></div>
                  </div>
                  <p className="progress-percentage">{progress.progress}%</p>

                  {progress.status === 'ready' && progress.result?.readyForApproval && (
                    <div className="preview-section">
                      <h3>Preview</h3>
                      {progress.result.videoPath && (
                        <div className="preview-item">
                          <h4>Video:</h4>
                          <video
                            src={getVideoPreviewUrl(progress.result.videoPath) || undefined}
                            controls
                            style={{ maxWidth: '100%', borderRadius: '8px' }}
                          />
                        </div>
                      )}
                      {progress.result.thumbnailPath && (
                        <div className="preview-item">
                          <h4>Thumbnail:</h4>
                          <img
                            src={getThumbnailPreviewUrl(progress.result.thumbnailPath) || undefined}
                            alt="Thumbnail"
                            style={{ maxWidth: '100%', borderRadius: '8px' }}
                          />
                        </div>
                      )}
                      {progress.result.script && (
                        <div className="preview-item">
                          <h4>Script Details:</h4>
                          <p><strong>Title:</strong> {progress.result.script.title}</p>
                          <p><strong>Description:</strong></p>
                          <pre style={{ whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: '1rem', borderRadius: '8px', color: '#000000' }}>
                            {progress.result.script.description}
                          </pre>
                        </div>
                      )}
                      <div className="approval-buttons">
                        <button
                          onClick={() => handleApproveAndUpload(progress.jobId)}
                          disabled={uploading}
                          className="approve-button"
                        >
                          {uploading ? (
                            <>
                              <span className="spinner"></span>
                              Uploading...
                            </>
                          ) : (
                            <>
                              <span>✅</span>
                              Approve & Upload
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {progress?.result?.videoUrl && (
                    <div className="success-section">
                      <h3>🎉 Video Uploaded Successfully!</h3>
                      <a 
                        href={progress.result.videoUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="youtube-link"
                      >
                        🎥 Watch on YouTube
                      </a>
                      {progress.result.blogUrl && (
                        <a 
                          href={progress.result.blogUrl} 
                          className="youtube-link"
                          style={{ marginTop: '10px', display: 'block' }}
                        >
                          📝 Read Blog Post
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="info-card">
              <h3>How It Works</h3>
              <ol className="steps-list">
                <li>🔍 Scrapes latest crypto news from top sources</li>
                <li>🤖 AI analyzes and distills top 3-4 trending topics</li>
                <li>✍️ Generates engaging script for "Crypto B" avatar</li>
                <li>🎬 Creates video with avatar and text-to-speech</li>
                <li>🖼️ Generates thumbnail</li>
                <li>📺 Uploads to YouTube</li>
                <li>📝 Creates blog post automatically</li>
              </ol>
            </div>
          </main>
        )}
        </div>
      </div>
      <Footer />
    </>
  );
}

export default Admin;

