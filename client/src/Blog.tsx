import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import MenuBar from './MenuBar';
import Footer from './Footer';
import './App.css';
import './Blog.css';

interface BlogPost {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  slug: string;
  tags: string[];
  categories: string[];
  featuredImageUrl?: string;
  videoEmbedCode: string;
  createdAt: string;
  updatedAt: string;
  videoId?: string;
  videoUrl?: string;
  youtubeUrl?: string;
}

function Blog() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [blogs, setBlogs] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBlog, setSelectedBlog] = useState<BlogPost | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [readingProgress, setReadingProgress] = useState(0);
  const articleRef = useRef<HTMLDivElement>(null);
  const postsPerPage = 12;

  useEffect(() => {
    fetchBlogs();
  }, []);

  // Load specific blog post if ID is in URL
  useEffect(() => {
    if (id && blogs.length > 0) {
      const blog = blogs.find(b => b.id === id);
      if (blog) {
        setSelectedBlog(blog);
      }
    }
  }, [id, blogs]);

  const fetchBlogs = async () => {
    try {
      setLoading(true);
      const response = await axios.get<{ success: boolean; blogs: BlogPost[] }>('/api/blog');
      if (response.data.success) {
        setBlogs(response.data.blogs);
      }
    } catch (err) {
      const errorMessage = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : 'Failed to load blog posts';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Get all unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    blogs.forEach(blog => {
      // Defensive check: ensure categories exists and is an array
      if (blog.categories && Array.isArray(blog.categories)) {
        blog.categories.forEach(cat => {
          if (cat && typeof cat === 'string') {
            cats.add(cat);
          }
        });
      }
    });
    return Array.from(cats).sort();
  }, [blogs]);

  // Get all unique tags with counts
  const tagCounts = useMemo(() => {
    const counts: { [key: string]: number } = {};
    blogs.forEach(blog => {
      // Defensive check: ensure tags exists and is an array
      if (blog.tags && Array.isArray(blog.tags)) {
        blog.tags.forEach(tag => {
          if (tag && typeof tag === 'string') {
            counts[tag] = (counts[tag] || 0) + 1;
          }
        });
      }
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20); // Top 20 tags
  }, [blogs]);

  // Filter blogs
  const filteredBlogs = useMemo(() => {
    let filtered = blogs;

    if (selectedCategory) {
      filtered = filtered.filter(blog => 
        blog.categories && Array.isArray(blog.categories) && blog.categories.includes(selectedCategory)
      );
    }

    if (selectedTag) {
      filtered = filtered.filter(blog => 
        blog.tags && Array.isArray(blog.tags) && blog.tags.includes(selectedTag)
      );
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(blog =>
        (blog.title && blog.title.toLowerCase().includes(query)) ||
        (blog.excerpt && blog.excerpt.toLowerCase().includes(query)) ||
        (blog.content && blog.content.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [blogs, selectedCategory, selectedTag, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredBlogs.length / postsPerPage);
  const paginatedBlogs = useMemo(() => {
    const startIndex = (currentPage - 1) * postsPerPage;
    const endIndex = startIndex + postsPerPage;
    return filteredBlogs.slice(startIndex, endIndex);
  }, [filteredBlogs, currentPage]);

  // Get recent posts (excluding current)
  const recentPosts = useMemo(() => {
    return blogs
      .filter(blog => !selectedBlog || blog.id !== selectedBlog.id)
      .slice(0, 5);
  }, [blogs, selectedBlog]);

  // Get related posts
  const relatedPosts = useMemo(() => {
    if (!selectedBlog) return [];
    return blogs
      .filter(blog => {
        if (blog.id === selectedBlog.id) return false;
        // Find posts with matching tags or categories
        const blogTags = (blog.tags && Array.isArray(blog.tags)) ? blog.tags : [];
        const blogCats = (blog.categories && Array.isArray(blog.categories)) ? blog.categories : [];
        const selectedTags = (selectedBlog.tags && Array.isArray(selectedBlog.tags)) ? selectedBlog.tags : [];
        const selectedCats = (selectedBlog.categories && Array.isArray(selectedBlog.categories)) ? selectedBlog.categories : [];
        
        const sharedTags = blogTags.filter(tag => selectedTags.includes(tag));
        const sharedCats = blogCats.filter(cat => selectedCats.includes(cat));
        return sharedTags.length > 0 || sharedCats.length > 0;
      })
      .slice(0, 3);
  }, [blogs, selectedBlog]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  // Calculate reading time (average reading speed: 200-250 words per minute)
  const calculateReadingTime = (content: string): number => {
    // Strip HTML tags and get text content
    const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = text.split(' ').filter(word => word.length > 0).length;
    // Average reading speed: 225 words per minute
    const readingTime = Math.ceil(wordCount / 225);
    return Math.max(1, readingTime); // At least 1 minute
  };

  // Reading progress indicator
  useEffect(() => {
    if (!selectedBlog || !articleRef.current) {
      setReadingProgress(0);
      return;
    }

    const handleScroll = () => {
      if (!articleRef.current) return;
      
      const article = articleRef.current;
      const articleTop = article.offsetTop;
      const articleHeight = article.offsetHeight;
      const scrollTop = window.scrollY;
      
      const articleBottom = articleTop + articleHeight;
      const viewportTop = scrollTop;
      
      // Calculate how much of the article has been scrolled past
      let progress = 0;
      if (viewportTop >= articleTop) {
        // We've scrolled past the top of the article
        const scrolled = viewportTop - articleTop;
        progress = Math.min(100, (scrolled / articleHeight) * 100);
      }
      
      // If we've scrolled past the article, it's 100%
      if (viewportTop >= articleBottom) {
        progress = 100;
      }
      
      setReadingProgress(progress);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial calculation
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, [selectedBlog]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, selectedTag, searchQuery]);

  const clearFilters = () => {
    setSelectedCategory(null);
    setSelectedTag(null);
    setSearchQuery('');
    setCurrentPage(1);
  };

  // Social sharing functions
  const shareUrl = selectedBlog ? `${window.location.origin}/blog/${selectedBlog.id}` : window.location.href;
  const shareTitle = selectedBlog ? selectedBlog.title : 'Crypto B News Blog';

  const shareToX = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank', 'width=550,height=420');
  };

  const shareToFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank', 'width=550,height=420');
  };

  const shareToLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank', 'width=550,height=420');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      // Show temporary success message
      const button = document.querySelector('.copy-link-button') as HTMLButtonElement;
      if (button) {
        const originalText = button.textContent;
        button.textContent = '✓ Copied!';
        button.style.background = '#4caf50';
        setTimeout(() => {
          button.textContent = originalText;
          button.style.background = '';
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to copy link:', err);
      alert('Failed to copy link. Please copy manually: ' + shareUrl);
    }
  };

  // Sidebar Component
  const Sidebar = () => (
    <aside className="blog-sidebar">
      {/* Search */}
      <div className="sidebar-widget">
        <h3 className="widget-title">🔍 Find Alpha</h3>
        <input
          type="text"
          placeholder="Search for alpha..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="blog-search-input"
        />
      </div>

      {/* Recent Posts */}
      {recentPosts.length > 0 && (
        <div className="sidebar-widget">
          <h3 className="widget-title">🔥 Fresh Drops</h3>
          <ul className="recent-posts-list">
            {recentPosts.map(post => (
              <li key={post.id} onClick={() => {
                setSelectedBlog(post);
                navigate(`/blog/${post.id}`);
              }} className="recent-post-item">
                <h4>{post.title}</h4>
                <span className="post-date">{formatTimeAgo(post.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Categories */}
      {categories.length > 0 && (
        <div className="sidebar-widget">
          <h3 className="widget-title">📂 Categories</h3>
          <ul className="categories-list">
            <li>
              <button
                onClick={clearFilters}
                className={!selectedCategory ? 'active' : ''}
              >
                All Alpha
              </button>
            </li>
                {categories.map(cat => (
              <li key={cat}>
                <button
                  onClick={() => {
                    setSelectedCategory(cat);
                    setSelectedTag(null);
                  }}
                  className={selectedCategory === cat ? 'active' : ''}
                >
                  {cat} ({blogs.filter(b => b.categories && Array.isArray(b.categories) && b.categories.includes(cat)).length})
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tags */}
      {tagCounts.length > 0 && (
        <div className="sidebar-widget">
          <h3 className="widget-title">🏷️ Trending Tags</h3>
          <div className="tags-cloud">
            {tagCounts.map(([tag, count]) => (
              <button
                key={tag}
                onClick={() => {
                  setSelectedTag(tag);
                  setSelectedCategory(null);
                }}
                className={`tag-button ${selectedTag === tag ? 'active' : ''}`}
                style={{ fontSize: `${Math.min(12 + count * 2, 16)}px` }}
              >
                {tag} ({count})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* About */}
      <div className="sidebar-widget">
        <h3 className="widget-title">For the Degens</h3>
        <p className="about-text">
          🚀 Crypto B News - Where degens get their alpha. We drop the hottest crypto news, market moves, 
          and insights through banger videos and blog posts. WAGMI! 💎🙌
        </p>
      </div>
    </aside>
  );

  // Individual Post View
  if (selectedBlog) {
    const readingTime = calculateReadingTime(selectedBlog.content);
    
    return (
      <>
        <MenuBar />
        {/* Reading Progress Indicator */}
        <div className="reading-progress-container">
          <div 
            className="reading-progress-bar" 
            style={{ width: `${readingProgress}%` }}
          />
        </div>
        <div className="blog-layout">
        <div className="blog-main-content">
          <button
            onClick={() => {
              setSelectedBlog(null);
              navigate('/blog');
            }}
            className="back-button"
          >
            ← Back to Alpha
          </button>
          
          <article className="blog-article-full" ref={articleRef}>
            <header className="blog-article-header">
              <h1>{selectedBlog.title}</h1>
              <div className="blog-article-meta">
                <span className="meta-item">📅 {formatDate(selectedBlog.createdAt)}</span>
                <span className="meta-item">⏱️ {readingTime} min read (diamond hands only 💎)</span>
                {selectedBlog.categories && Array.isArray(selectedBlog.categories) && selectedBlog.categories.length > 0 && (
                  <div className="meta-categories">
                    {selectedBlog.categories.map(cat => (
                      <span key={cat} className="category-badge">{cat}</span>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Social Sharing Buttons */}
              <div className="social-sharing">
                <span className="share-label">Share this alpha:</span>
                <button onClick={shareToX} className="share-button share-x" title="Share on X">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </button>
                <button onClick={shareToFacebook} className="share-button share-facebook" title="Share on Facebook">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </button>
                <button onClick={shareToLinkedIn} className="share-button share-linkedin" title="Share on LinkedIn">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </button>
                <button onClick={copyLink} className="share-button share-copy copy-link-button" title="Copy link">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </button>
              </div>
            </header>

            {selectedBlog.videoUrl && (
              <div className="blog-video-section">
                <div
                  className="video-embed"
                  dangerouslySetInnerHTML={{ __html: selectedBlog.videoEmbedCode }}
                />
                <a
                  href={selectedBlog.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="youtube-link-button"
                >
                  🎥 Watch the Full Send on YouTube
                </a>
              </div>
            )}

            <div
              className="blog-content-full"
              dangerouslySetInnerHTML={{ __html: selectedBlog.content }}
            />

            {selectedBlog.tags && Array.isArray(selectedBlog.tags) && selectedBlog.tags.length > 0 && (
              <div className="blog-tags-section">
                <h4>Tags:</h4>
                <div className="tags-list">
                  {selectedBlog.tags.map(tag => (
                    <span key={tag} className="tag-item">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {relatedPosts.length > 0 && (
              <div className="related-posts">
                <h3>🔥 More Alpha for Degens</h3>
                <div className="related-posts-grid">
                  {relatedPosts.map(post => (
                    <div
                      key={post.id}
                      className="related-post-card"
                      onClick={() => {
                        setSelectedBlog(post);
                        navigate(`/blog/${post.id}`);
                      }}
                    >
                      <h4>{post.title}</h4>
                      <p>{post.excerpt.substring(0, 100)}...</p>
                      <span className="related-post-date">{formatDate(post.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        </div>
        <Sidebar />
      </div>
      <Footer />
      </>
    );
  }

  // Loading State
  if (loading) {
    return (
      <>
        <MenuBar />
        <div className="blog-layout">
        <div className="blog-main-content">
          <div className="card">
            <p>Loading blog posts...</p>
          </div>
        </div>
        <Sidebar />
      </div>
      <Footer />
      </>
    );
  }

  // Error State
  if (error) {
    return (
      <>
        <MenuBar />
        <div className="blog-layout">
        <div className="blog-main-content">
          <div className="card">
            <div className="error-message">
              <p>❌ {error}</p>
              <button onClick={fetchBlogs} className="retry-button">
                Retry
              </button>
            </div>
          </div>
        </div>
        <Sidebar />
      </div>
      <Footer />
      </>
    );
  }

  // Empty State
  if (blogs.length === 0) {
    return (
      <>
        <MenuBar />
        <div className="blog-layout">
        <div className="blog-main-content">
          <div className="card">
            <div className="card-header">
              <h2>📝 Blog Posts</h2>
              <p className="card-description">
                😢 No alpha yet. Create a video to drop your first banger blog post! 🚀
              </p>
            </div>
          </div>
        </div>
        <Sidebar />
      </div>
      <Footer />
      </>
    );
  }

  // Blog List View
  return (
    <>
      <MenuBar />
      <div className="blog-layout">
      <div className="blog-main-content">
        <div className="blog-header-section">
            <div className="blog-public-header">
              <h1 className="blog-page-title">
                🚀 Crypto B News 🚀
              </h1>
              <p className="blog-page-subtitle">
                📈 Alpha drops, market moves, and degen insights. WAGMI! 💎🙌
              </p>
            </div>
          {(selectedCategory || selectedTag || searchQuery) && (
            <div className="active-filters">
              <span>🔍 Active filters:</span>
              {selectedCategory && (
                <span className="filter-badge">
                  Category: {selectedCategory}
                  <button onClick={() => setSelectedCategory(null)}>×</button>
                </span>
              )}
              {selectedTag && (
                <span className="filter-badge">
                  Tag: {selectedTag}
                  <button onClick={() => setSelectedTag(null)}>×</button>
                </span>
              )}
              {searchQuery && (
                <span className="filter-badge">
                  Search: "{searchQuery}"
                  <button onClick={() => setSearchQuery('')}>×</button>
                </span>
              )}
              <button onClick={clearFilters} className="clear-filters-btn">
                Reset Filters
              </button>
            </div>
          )}
        </div>

        {filteredBlogs.length === 0 ? (
          <div className="card">
            <p>😢 No alpha found. Maybe try different filters?</p>
            <button onClick={clearFilters} className="clear-filters-btn">
              Reset & Find More Alpha
            </button>
          </div>
        ) : (
          <>
            <div className="blog-posts-grid">
              {paginatedBlogs.map(blog => {
                const readingTime = calculateReadingTime(blog.content);
                return (
                  <article
                    key={blog.id}
                    className="blog-post-card"
                    onClick={() => {
                      setSelectedBlog(blog);
                      navigate(`/blog/${blog.id}`);
                    }}
                  >
                    {blog.featuredImageUrl && (
                      <div className="blog-card-image">
                        <img src={blog.featuredImageUrl} alt={blog.title} />
                      </div>
                    )}
                    <div className="blog-card-content">
                      <div className="blog-card-meta">
                        <span className="blog-card-date">{formatDate(blog.createdAt)}</span>
                        <span className="blog-card-reading-time">⏱️ {readingTime} min</span>
                        {blog.categories && Array.isArray(blog.categories) && blog.categories.length > 0 && (
                          <span className="blog-card-category">
                            {blog.categories[0]}
                          </span>
                        )}
                      </div>
                      <h2 className="blog-card-title">{blog.title}</h2>
                      <p className="blog-card-excerpt">{blog.excerpt}</p>
                      <div className="blog-card-footer">
                        {blog.tags && Array.isArray(blog.tags) && blog.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="blog-card-tag">{tag}</span>
                        ))}
                        {blog.videoUrl && (
                      <a
                        href={blog.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="blog-card-video-link"
                      >
                        🎥 Full Send →
                      </a>
                    )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="pagination-button"
                >
                  ← Previous
                </button>
                <div className="pagination-info">
                  Page {currentPage} of {totalPages}
                  <span className="pagination-count">({filteredBlogs.length} posts)</span>
                </div>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="pagination-button"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <Sidebar />
    </div>
    <Footer />
    </>
  );
}

export default Blog;
