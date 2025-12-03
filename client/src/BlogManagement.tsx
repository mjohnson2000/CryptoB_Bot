import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import './BlogManagement.css';

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

function BlogManagement() {
  const [blogs, setBlogs] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [selectedBlog, setSelectedBlog] = useState<BlogPost | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    excerpt: '',
    tags: '',
    categories: '',
    videoUrl: '',
    videoId: ''
  });

  useEffect(() => {
    fetchBlogs();
  }, []);

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

  const handleDelete = async (id: string) => {
    try {
      const response = await axios.delete(`/api/blog/${id}`);
      if (response.data.success) {
        setBlogs(blogs.filter(blog => blog.id !== id));
        setDeleteConfirm(null);
        setError(null);
      }
    } catch (err) {
      const errorMessage = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : 'Failed to delete blog post';
      setError(errorMessage);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);

      // Extract video ID from URL if provided
      let videoId = formData.videoId;
      if (formData.videoUrl && !videoId) {
        const match = formData.videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
        if (match) {
          videoId = match[1];
        }
      }

      const blogPost = {
        title: formData.title,
        content: formData.content,
        excerpt: formData.excerpt,
        slug: formData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 100),
        tags: formData.tags.split(',').map(t => t.trim()).filter(t => t),
        categories: formData.categories.split(',').map(c => c.trim()).filter(c => c),
        featuredImageUrl: videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : undefined,
        videoEmbedCode: videoId ? `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>` : ''
      };

      const response = await axios.post('/api/blog', {
        blogPost,
        videoId,
        videoUrl: formData.videoUrl,
        youtubeUrl: formData.videoUrl
      });

      if (response.data.success) {
        await fetchBlogs();
        setShowCreateForm(false);
        resetForm();
        setError(null);
      }
    } catch (err) {
      const errorMessage = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : 'Failed to create blog post';
      setError(errorMessage);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBlog) return;

    try {
      setError(null);

      const blogPost = {
        title: formData.title,
        content: formData.content,
        excerpt: formData.excerpt,
        tags: formData.tags.split(',').map(t => t.trim()).filter(t => t),
        categories: formData.categories.split(',').map(c => c.trim()).filter(c => c)
      };

      const response = await axios.put(`/api/blog/${selectedBlog.id}`, { blogPost });

      if (response.data.success) {
        await fetchBlogs();
        setShowEditForm(false);
        setSelectedBlog(null);
        resetForm();
        setError(null);
      }
    } catch (err) {
      const errorMessage = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : 'Failed to update blog post';
      setError(errorMessage);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      excerpt: '',
      tags: '',
      categories: '',
      videoUrl: '',
      videoId: ''
    });
  };

  const openEditForm = (blog: BlogPost) => {
    setSelectedBlog(blog);
    setFormData({
      title: blog.title,
      content: blog.content,
      excerpt: blog.excerpt,
      tags: blog.tags.join(', '),
      categories: blog.categories.join(', '),
      videoUrl: blog.videoUrl || '',
      videoId: blog.videoId || ''
    });
    setShowEditForm(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="main">
        <div className="card">
          <p>Loading blog posts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="main">
      <div className="card">
        <div className="card-header">
          <h2>📝 Blog Management</h2>
          <p className="card-description">
            Manage your blog posts: create, edit, and delete blog posts.
          </p>
        </div>

        {error && (
          <div className="error-message">
            <p>❌ {error}</p>
          </div>
        )}

        <div className="blog-management-actions">
          <button
            onClick={() => {
              setShowCreateForm(true);
              setShowEditForm(false);
              resetForm();
            }}
            className="create-blog-button"
          >
            ➕ Create New Blog Post
          </button>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div className="blog-form-modal">
            <div className="blog-form-content">
              <h3>Create New Blog Post</h3>
              <form onSubmit={handleCreate}>
                <div className="form-group">
                  <label>Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                    placeholder="Blog post title"
                  />
                </div>

                <div className="form-group">
                  <label>Excerpt *</label>
                  <textarea
                    value={formData.excerpt}
                    onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                    required
                    rows={3}
                    placeholder="Short excerpt for preview"
                  />
                </div>

                <div className="form-group">
                  <label>Content (HTML) *</label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    required
                    rows={15}
                    placeholder="HTML content (use &lt;h2&gt;, &lt;p&gt;, etc.)"
                  />
                </div>

                <div className="form-group">
                  <label>Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="Bitcoin, Crypto, News"
                  />
                </div>

                <div className="form-group">
                  <label>Categories (comma-separated)</label>
                  <input
                    type="text"
                    value={formData.categories}
                    onChange={(e) => setFormData({ ...formData, categories: e.target.value })}
                    placeholder="Crypto News, Market Analysis"
                  />
                </div>

                <div className="form-group">
                  <label>YouTube Video URL</label>
                  <input
                    type="url"
                    value={formData.videoUrl}
                    onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </div>

                <div className="form-group">
                  <label>Video ID (optional, auto-extracted from URL)</label>
                  <input
                    type="text"
                    value={formData.videoId}
                    onChange={(e) => setFormData({ ...formData, videoId: e.target.value })}
                    placeholder="dQw4w9WgXcQ"
                  />
                </div>

                <div className="form-actions">
                  <button type="submit" className="submit-button">
                    Create Blog Post
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      resetForm();
                    }}
                    className="cancel-button"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Form */}
        {showEditForm && selectedBlog && (
          <div className="blog-form-modal">
            <div className="blog-form-content">
              <h3>Edit Blog Post</h3>
              <form onSubmit={handleEdit}>
                <div className="form-group">
                  <label>Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Excerpt *</label>
                  <textarea
                    value={formData.excerpt}
                    onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                    required
                    rows={3}
                  />
                </div>

                <div className="form-group">
                  <label>Content (HTML) *</label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    required
                    rows={15}
                  />
                </div>

                <div className="form-group">
                  <label>Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Categories (comma-separated)</label>
                  <input
                    type="text"
                    value={formData.categories}
                    onChange={(e) => setFormData({ ...formData, categories: e.target.value })}
                  />
                </div>

                <div className="form-actions">
                  <button type="submit" className="submit-button">
                    Update Blog Post
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditForm(false);
                      setSelectedBlog(null);
                      resetForm();
                    }}
                    className="cancel-button"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Blog List */}
        <div className="blog-management-list">
          <h3>All Blog Posts ({blogs.length})</h3>
          {blogs.length === 0 ? (
            <p>No blog posts yet. Create your first one!</p>
          ) : (
            <table className="blog-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Categories</th>
                  <th>Tags</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {blogs.map(blog => (
                  <tr key={blog.id}>
                    <td>
                      <strong>{blog.title}</strong>
                      <br />
                      <small>{blog.excerpt.substring(0, 100)}...</small>
                    </td>
                    <td>
                      {blog.categories.map(cat => (
                        <span key={cat} className="category-badge">{cat}</span>
                      ))}
                    </td>
                    <td>
                      <div className="tags-list">
                        {blog.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="tag-badge">{tag}</span>
                        ))}
                        {blog.tags.length > 3 && <span>+{blog.tags.length - 3}</span>}
                      </div>
                    </td>
                    <td>{formatDate(blog.createdAt)}</td>
                    <td>
                      <div className="action-buttons">
                        <a
                          href={`/blog/${blog.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="view-button"
                        >
                          👁️ View
                        </a>
                        <button
                          onClick={() => openEditForm(blog)}
                          className="edit-button"
                        >
                          ✏️ Edit
                        </button>
                        {deleteConfirm === blog.id ? (
                          <div className="delete-confirm">
                            <button
                              onClick={() => handleDelete(blog.id)}
                              className="confirm-delete-button"
                            >
                              ✓ Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="cancel-delete-button"
                            >
                              ✕ Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(blog.id)}
                            className="delete-button"
                          >
                            🗑️ Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default BlogManagement;

