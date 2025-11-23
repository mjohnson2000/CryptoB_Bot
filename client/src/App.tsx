import { useState } from 'react';
import axios from 'axios';
import './App.css';

interface JobProgress {
  jobId: string;
  status: 'pending' | 'scraping' | 'analyzing' | 'generating_script' | 'creating_video' | 'creating_thumbnail' | 'ready' | 'uploading' | 'completed' | 'error';
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
    error?: string;
  };
}

function App() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleCreateVideo = async () => {
    setLoading(true);
    setError(null);
    
    // Initialize progress immediately so UI shows something right away
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
        // Update progress with actual jobId
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
    const maxAttempts = 120; // 10 minutes max
    let attempts = 0;
    let consecutive404s = 0;
    let interval: NodeJS.Timeout | null = null;

    // Poll immediately first time
    const poll = async () => {
      attempts++;
      
      try {
        const response = await axios.get<JobProgress>(`/api/video/status/${jobId}`);
        consecutive404s = 0; // Reset counter on success
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
          // Job not found yet, keep polling but show a message
          if (consecutive404s <= 15) {
            // Update progress to show we're waiting
            setProgress(prev => prev ? {
              ...prev,
              message: 'Waiting for job to initialize...',
              progress: 0
            } : {
              jobId,
              status: 'pending',
              progress: 0,
              message: 'Initializing video creation...'
            });
            return; // Continue polling
          } else {
            // Too many 404s, something is wrong
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

    // Poll immediately
    await poll();
    
    // Then poll every 2 seconds
    interval = setInterval(poll, 2000);
  };

  const handleApproveAndUpload = async (jobId: string) => {
    setUploading(true);
    setError(null);

    try {
      const response = await axios.post(`/api/video/approve/${jobId}`);
      
      if (response.data.success) {
        // Update progress with upload result
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
      case 'generating_script': return '✍️';
      case 'creating_video': return '🎬';
      case 'creating_thumbnail': return '🖼️';
      case 'ready': return '✅';
      case 'uploading': return '📤';
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

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1 className="title">
            <span className="crypto-icon">₿</span>
            Crypto B
          </h1>
          <p className="subtitle">Automated YouTube Crypto News Bot</p>
        </header>

        <main className="main">
          <div className="card">
            <div className="card-header">
              <h2>Create New Video</h2>
              <p className="card-description">
                Generate a YouTube video with the latest crypto news from the last 4 hours.
                Preview and approve before uploading to YouTube.
              </p>
            </div>

            <button
              className="create-button"
              onClick={handleCreateVideo}
              disabled={loading || uploading}
            >
              {loading || uploading ? (
                <>
                  <span className="spinner"></span>
                  {uploading ? 'Uploading...' : 'Creating Video...'}
                </>
              ) : (
                <>
                  <span>🎬</span>
                  Create Video
                </>
              )}
            </button>

            {progress && (
              <div className="progress-section">
                <div className="progress-header">
                  <span className="progress-icon">{getStatusIcon(progress.status)}</span>
                  <span className="progress-message">{progress.message}</span>
                  <span className="progress-percentage">{progress.progress}%</span>
                </div>
                <div className="progress-bar-container">
                  <div 
                    className={`progress-bar ${progress.status === 'error' ? 'progress-bar-error' : ''}`}
                    style={{ width: `${progress.progress}%` }}
                  ></div>
                </div>
                <div className="progress-status">
                  Status: <strong>{progress.status.replace(/_/g, ' ').toUpperCase()}</strong>
                </div>
                {progress.status === 'error' && progress.result?.error && (
                  <div className="error-details">
                    <strong>Error Details:</strong> {progress.result.error}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="error-message">
                <span className="error-icon">❌</span>
                {error}
              </div>
            )}

            {progress?.result?.readyForApproval && (
              <div className="preview-section">
                <h3>📺 Preview & Approve</h3>
                
                {progress.result.script && (
                  <div className="preview-content">
                    <div className="preview-item">
                      <strong>Title:</strong>
                      <p>{progress.result.script.title}</p>
                    </div>
                    
                    {getThumbnailPreviewUrl(progress.result.thumbnailPath) && (
                      <div className="preview-item">
                        <strong>Thumbnail:</strong>
                        <div className="thumbnail-preview">
                          <img 
                            src={getThumbnailPreviewUrl(progress.result.thumbnailPath)!} 
                            alt="Video thumbnail"
                            className="thumbnail-image"
                          />
                        </div>
                      </div>
                    )}

                    {getVideoPreviewUrl(progress.result.videoPath) && (
                      <div className="preview-item">
                        <strong>Video Preview:</strong>
                        <div className="video-preview">
                          <video 
                            controls 
                            src={getVideoPreviewUrl(progress.result.videoPath)!}
                            className="preview-video"
                          >
                            Your browser does not support the video tag.
                          </video>
                        </div>
                      </div>
                    )}

                    {progress.result.script.tags && progress.result.script.tags.length > 0 && (
                      <div className="preview-item">
                        <strong>Tags:</strong>
                        <div className="tags">
                          {progress.result.script.tags.map((tag, i) => (
                            <span key={i} className="tag">{tag}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {progress.result.script.description && (
                      <div className="preview-item">
                        <strong>Description:</strong>
                        <p className="description">{progress.result.script.description}</p>
                      </div>
                    )}

                    <div className="approve-actions">
                      <button
                        className="approve-button"
                        onClick={() => handleApproveAndUpload(progress.jobId)}
                        disabled={uploading}
                      >
                        {uploading ? (
                          <>
                            <span className="spinner"></span>
                            Uploading to YouTube...
                          </>
                        ) : (
                          <>
                            <span>✅</span>
                            Approve & Upload to YouTube
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
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
              </div>
            )}
          </div>

          <div className="info-card">
            <h3>How It Works</h3>
            <ol className="steps-list">
              <li>🔍 Scrapes latest crypto news from top sources</li>
              <li>🤖 AI analyzes and distills top 3-4 trending topics</li>
              <li>✍️ Generates engaging script for "Crypto B" avatar</li>
              <li>🎬 Creates video with text-to-speech and avatar</li>
              <li>🖼️ Generates eye-catching thumbnail</li>
              <li>👀 Preview video and thumbnail</li>
              <li>✅ Approve and upload to YouTube</li>
            </ol>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
