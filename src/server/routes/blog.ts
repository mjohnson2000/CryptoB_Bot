import { Router } from 'express';
import { generateBlogPost } from '../../services/blogService.js';
import { VideoScript } from '../../services/aiService.js';
import {
  getAllBlogPosts,
  getBlogPostById,
  getRecentBlogPosts,
  deleteBlogPost,
  updateBlogPost,
  saveBlogPost as saveBlogPostStorage
} from '../../services/blogStorage.js';
import { authenticate } from '../middleware/auth.js';

export const blogRouter = Router();

/**
 * Get all blog posts
 */
blogRouter.get('/', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const blogs = limit ? await getRecentBlogPosts(limit) : await getAllBlogPosts();
    res.json({
      success: true,
      blogs
    });
  } catch (error) {
    console.error('Error getting blog posts:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get blog post by ID
 */
blogRouter.get('/:id', async (req, res) => {
  try {
    const blog = await getBlogPostById(req.params.id);
    if (!blog) {
      return res.status(404).json({
        success: false,
        error: 'Blog post not found'
      });
    }
    res.json({
      success: true,
      blog
    });
  } catch (error) {
    console.error('Error getting blog post:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Generate a blog post from video data
 * Protected route - requires authentication
 */
blogRouter.post('/generate', authenticate, async (req, res) => {
  try {
    const { script, youtubeUrl, videoId, thumbnailUrl } = req.body;

    if (!script || !youtubeUrl || !videoId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: script, youtubeUrl, videoId'
      });
    }

    const blogPost = await generateBlogPost(
      script as VideoScript,
      youtubeUrl,
      videoId,
      thumbnailUrl
    );

    res.json({
      success: true,
      blogPost
    });
  } catch (error) {
    console.error('Error generating blog post:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Save a blog post
 */
blogRouter.post('/', async (req, res) => {
  try {
    const { blogPost, videoId, videoUrl, youtubeUrl } = req.body;

    if (!blogPost) {
      return res.status(400).json({
        success: false,
        error: 'Missing blogPost in request body'
      });
    }

    const storedPost = await saveBlogPostStorage(
      blogPost,
      videoId,
      videoUrl,
      youtubeUrl
    );

    res.json({
      success: true,
      blog: storedPost,
      blogUrl: `/blog/${storedPost.id}`
    });
  } catch (error) {
    console.error('Error saving blog post:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Update a blog post
 * Protected route - requires authentication
 */
blogRouter.put('/:id', authenticate, async (req, res) => {
  try {
    const { blogPost } = req.body;

    if (!blogPost) {
      return res.status(400).json({
        success: false,
        error: 'Missing blogPost in request body'
      });
    }

    const updatedPost = await updateBlogPost(req.params.id, blogPost);

    if (!updatedPost) {
      return res.status(404).json({
        success: false,
        error: 'Blog post not found'
      });
    }

    res.json({
      success: true,
      blog: updatedPost
    });
  } catch (error) {
    console.error('Error updating blog post:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Delete a blog post
 * Protected route - requires authentication
 */
blogRouter.delete('/:id', authenticate, async (req, res) => {
  try {
    const deleted = await deleteBlogPost(req.params.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Blog post not found'
      });
    }

    res.json({
      success: true,
      message: 'Blog post deleted'
    });
  } catch (error) {
    console.error('Error deleting blog post:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

