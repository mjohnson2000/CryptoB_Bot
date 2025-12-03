import fs from 'fs/promises';
import path from 'path';
import { copyFile } from 'fs/promises';
import { BlogPost } from './blogService.js';
import { getCurrentESTISOString } from '../utils/timeUtils.js';

export interface StoredBlogPost extends BlogPost {
  id: string;
  createdAt: string;
  updatedAt: string;
  videoId?: string;
  videoUrl?: string;
  youtubeUrl?: string;
}

const BLOG_DIR = path.join(process.cwd(), 'data', 'blogs');
const BLOG_INDEX_FILE = path.join(BLOG_DIR, 'index.json');

/**
 * Ensure blog directory exists
 */
async function ensureBlogDir(): Promise<void> {
  try {
    await fs.mkdir(BLOG_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating blog directory:', error);
    throw error;
  }
}

/**
 * Load blog index
 */
async function loadBlogIndex(): Promise<StoredBlogPost[]> {
  try {
    await ensureBlogDir();
    const data = await fs.readFile(BLOG_INDEX_FILE, 'utf-8');
    
    // Handle empty file
    if (!data || data.trim().length === 0) {
      return [];
    }
    
    const parsed = JSON.parse(data);
    
    // Ensure it's an array
    if (!Array.isArray(parsed)) {
      console.warn('Blog index is not an array, resetting to empty array');
      return [];
    }
    
    return parsed;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // Index file doesn't exist, return empty array
      return [];
    }
    
    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      console.error('❌ Invalid JSON in blog index file. Resetting to empty array:', error.message);
      // Try to backup corrupted file
      try {
        const backupPath = `${BLOG_INDEX_FILE}.backup.${Date.now()}`;
        await copyFile(BLOG_INDEX_FILE, backupPath);
        console.log(`📦 Backed up corrupted file to: ${backupPath}`);
      } catch (backupError) {
        // Ignore backup errors
      }
      // Return empty array and let the system recreate the file
      return [];
    }
    
    console.error('Error loading blog index:', error);
    throw error;
  }
}

/**
 * Save blog index
 */
async function saveBlogIndex(blogs: StoredBlogPost[]): Promise<void> {
  try {
    await ensureBlogDir();
    await fs.writeFile(BLOG_INDEX_FILE, JSON.stringify(blogs, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving blog index:', error);
    throw error;
  }
}

/**
 * Save a blog post
 */
export async function saveBlogPost(
  blogPost: BlogPost,
  videoId?: string,
  videoUrl?: string,
  youtubeUrl?: string
): Promise<StoredBlogPost> {
  try {
    const blogs = await loadBlogIndex();
    
    const id = `blog-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = getCurrentESTISOString();
    
    const storedPost: StoredBlogPost = {
      ...blogPost,
      id,
      createdAt: now,
      updatedAt: now,
      videoId,
      videoUrl,
      youtubeUrl
    };
    
    blogs.unshift(storedPost); // Add to beginning (newest first)
    await saveBlogIndex(blogs);
    
    return storedPost;
  } catch (error) {
    console.error('Error saving blog post:', error);
    throw error;
  }
}

/**
 * Get all blog posts (newest first)
 */
export async function getAllBlogPosts(): Promise<StoredBlogPost[]> {
  try {
    return await loadBlogIndex();
  } catch (error) {
    console.error('Error getting blog posts:', error);
    throw error;
  }
}

/**
 * Get blog post by ID
 */
export async function getBlogPostById(id: string): Promise<StoredBlogPost | null> {
  try {
    if (!id || typeof id !== 'string') {
      return null;
    }
    const blogs = await loadBlogIndex();
    return blogs.find(blog => blog && blog.id === id) || null;
  } catch (error) {
    console.error('Error getting blog post:', error);
    throw error;
  }
}

/**
 * Get blog posts by video ID
 */
export async function getBlogPostsByVideoId(videoId: string): Promise<StoredBlogPost[]> {
  try {
    if (!videoId || typeof videoId !== 'string') {
      return [];
    }
    const blogs = await loadBlogIndex();
    return blogs.filter(blog => blog && blog.videoId === videoId);
  } catch (error) {
    console.error('Error getting blog posts by video ID:', error);
    throw error;
  }
}

/**
 * Delete blog post
 */
export async function deleteBlogPost(id: string): Promise<boolean> {
  try {
    if (!id || typeof id !== 'string') {
      return false;
    }
    const blogs = await loadBlogIndex();
    const index = blogs.findIndex(blog => blog && blog.id === id);
    
    if (index === -1) {
      return false;
    }
    
    blogs.splice(index, 1);
    await saveBlogIndex(blogs);
    return true;
  } catch (error) {
    console.error('Error deleting blog post:', error);
    throw error;
  }
}

/**
 * Update blog post
 */
export async function updateBlogPost(
  id: string,
  updates: Partial<BlogPost>
): Promise<StoredBlogPost | null> {
  try {
    if (!id || typeof id !== 'string') {
      return null;
    }
    const blogs = await loadBlogIndex();
    const index = blogs.findIndex(blog => blog && blog.id === id);
    
    if (index === -1 || !blogs[index]) {
      return null;
    }
    
    const updatedPost: StoredBlogPost = {
      ...blogs[index],
      ...updates,
      id,
      updatedAt: getCurrentESTISOString()
    };
    
    blogs[index] = updatedPost;
    await saveBlogIndex(blogs);
    
    return updatedPost;
  } catch (error) {
    console.error('Error updating blog post:', error);
    throw error;
  }
}

/**
 * Get recent blog posts
 */
export async function getRecentBlogPosts(limit: number = 10): Promise<StoredBlogPost[]> {
  try {
    const blogs = await loadBlogIndex();
    return blogs.slice(0, limit);
  } catch (error) {
    console.error('Error getting recent blog posts:', error);
    throw error;
  }
}

