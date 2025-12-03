import OpenAI from 'openai';
import { VideoScript } from './aiService.js';

export interface BlogPost {
  title: string;
  content: string; // HTML content with embedded video
  excerpt: string;
  slug: string;
  tags: string[];
  categories: string[];
  featuredImageUrl?: string;
  videoEmbedCode: string; // YouTube embed iframe
}

export interface BlogPostResult {
  success: boolean;
  blogUrl?: string;
  blogId?: string;
  error?: string;
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }
  return new OpenAI({ apiKey });
}

/**
 * Generate a high-quality blog post from video script and metadata
 */
export async function generateBlogPost(
  script: VideoScript,
  youtubeUrl: string,
  videoId: string,
  thumbnailUrl?: string
): Promise<BlogPost> {
  try {
    const openai = getOpenAIClient();

    // Build context from video script
    const topicsText = script.topics
      .map((t, i) => `${i + 1}. **${t.title}**: ${t.summary}${t.url ? ` ([Source](${t.url}))` : ''}`)
      .join('\n\n');

    // Build price update section if available
    let priceSection = '';
    if (script.priceUpdate) {
      const winners = script.priceUpdate.topWinners.slice(0, 3)
        .map(w => `- ${w.symbol} (${w.name}): $${w.price.toFixed(2)} (+${w.change24h.toFixed(2)}%)`);
      const losers = script.priceUpdate.topLosers.slice(0, 3)
        .map(l => `- ${l.symbol} (${l.name}): $${l.price.toFixed(2)} (${l.change24h.toFixed(2)}%)`);
      
      priceSection = `\n\n### Market Update\n\n**Top Gainers:**\n${winners.join('\n')}\n\n**Top Losers:**\n${losers.join('\n')}\n\n**Market Sentiment:** ${script.priceUpdate.marketSentiment}`;
    }

    // Build NFT section if available
    let nftSection = '';
    if (script.nftUpdate) {
      const nftCollections = script.nftUpdate.trendingCollections.slice(0, 3)
        .map(nft => `- **${nft.name}**: ${nft.floorPrice.toFixed(2)} ETH (${nft.floorPriceChange24h > 0 ? '+' : ''}${nft.floorPriceChange24h.toFixed(2)}%)`);
      
      nftSection = `\n\n### NFT Market Update\n\n**Trending Collections:**\n${nftCollections.join('\n')}`;
    }

    // Create YouTube embed code
    const videoEmbedCode = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;

    const prompt = `You are a professional crypto news blogger creating a high-quality, SEO-optimized blog post based on a YouTube video script.

**Video Title:** ${script.title}
**Video Description:** ${script.description}

**Topics Covered:**
${topicsText}${priceSection}${nftSection}

**Video Script (for reference):**
${script.script}

Create a comprehensive, well-structured blog post that:

1. **Title**: Create an engaging, SEO-friendly title (60-70 characters) that captures the essence of the video
2. **Introduction**: Write a compelling introduction (2-3 paragraphs) that hooks readers and summarizes the key points
3. **Main Content**: Expand on each topic with:
   - Detailed explanations and analysis
   - Context and background information
   - Key takeaways and insights
   - Professional writing style (not casual like the video script)
   - Use proper headings (H2, H3) for structure
   - Include bullet points and lists where appropriate
4. **Video Embed Section**: Include a section that introduces the embedded video
5. **Conclusion**: Write a strong conclusion that summarizes key points and encourages engagement
6. **Excerpt**: Create a short excerpt (150-200 characters) for the blog preview
7. **Tags**: Suggest 8-12 relevant tags
8. **Categories**: Suggest 2-3 categories

**Requirements:**
- Write in a professional, journalistic style (not casual/degen language)
- Target length: 1200-1800 words
- Use proper HTML formatting (headings, paragraphs, lists, bold, links)
- Include the YouTube video embed code in the appropriate section
- Make it SEO-friendly with proper headings and structure
- Include reference links to sources when available
- Write for a general crypto audience (not just degens)

**Format your response as JSON:**
{
  "title": "Blog post title",
  "content": "Full HTML content with proper formatting, including video embed section",
  "excerpt": "Short excerpt for preview",
  "tags": ["tag1", "tag2", "tag3"],
  "categories": ["category1", "category2"],
  "slug": "url-friendly-slug-based-on-title"
}

**Important:** 
- The content should be in HTML format with proper tags (<h2>, <h3>, <p>, <ul>, <li>, <strong>, <a>, etc.)
- Include the video embed code in a dedicated section: ${videoEmbedCode}
- Make sure the content is comprehensive and adds value beyond just the video script`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert crypto news blogger who creates high-quality, SEO-optimized blog posts. You write in a professional, journalistic style and create comprehensive content that adds value for readers.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);

    // Ensure video embed is in the content
    let blogContent = parsed.content || '';
    if (!blogContent.includes('youtube.com/embed') && !blogContent.includes('iframe')) {
      // Add video embed section if not present
      const videoSection = `
<h2>Watch the Full Video</h2>
<p>For a detailed breakdown of these crypto news stories, watch our latest video:</p>
${videoEmbedCode}
<p><a href="${youtubeUrl}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a></p>
`;
      // Insert after first paragraph or at a logical point
      const firstParagraphEnd = blogContent.indexOf('</p>');
      if (firstParagraphEnd > 0) {
        blogContent = blogContent.slice(0, firstParagraphEnd + 4) + videoSection + blogContent.slice(firstParagraphEnd + 4);
      } else {
        blogContent = videoSection + blogContent;
      }
    }

    // Generate slug from title if not provided
    let slug = parsed.slug || generateSlug(parsed.title || script.title);

    return {
      title: parsed.title || script.title,
      content: blogContent,
      excerpt: parsed.excerpt || script.description.substring(0, 200),
      slug,
      tags: parsed.tags || script.tags.slice(0, 10),
      categories: parsed.categories || ['Crypto News', 'Market Analysis'],
      featuredImageUrl: thumbnailUrl,
      videoEmbedCode
    };
  } catch (error) {
    console.error('Error generating blog post:', error);
    throw error;
  }
}

/**
 * Generate URL-friendly slug from title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

/**
 * Save blog post to local storage
 */
export async function saveBlogPostLocally(
  blogPost: BlogPost,
  videoId?: string,
  videoUrl?: string,
  youtubeUrl?: string
): Promise<BlogPostResult> {
  try {
    const { saveBlogPost } = await import('./blogStorage.js');
    const storedPost = await saveBlogPost(blogPost, videoId, videoUrl, youtubeUrl);
    
    return {
      success: true,
      blogUrl: `/blog/${storedPost.id}`,
      blogId: storedPost.id
    };
  } catch (error: any) {
    console.error('Error saving blog post locally:', error?.message || error);
    return {
      success: false,
      error: error?.message || 'Unknown error'
    };
  }
}

