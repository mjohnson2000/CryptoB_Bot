import { google } from 'googleapis';

interface YouTubeComment {
  id: string;
  author: string;
  text: string;
  publishedAt: string;
  videoId: string;
  videoTitle: string;
}

export interface TopicRequest {
  topic: string;
  count: number;
  comments: Array<{
    text: string;
    videoId: string;
    videoTitle: string;
    author: string;
  }>;
  lastUpdated: string;
}

/**
 * Get authenticated YouTube API client
 */
function getYouTubeClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN
  });

  return google.youtube('v3');
}

/**
 * Fetch recent videos from the channel
 */
export async function getRecentVideos(limit: number = 10): Promise<Array<{ id: string; title: string }>> {
  try {
    const youtube = getYouTubeClient();
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN
    });

    const channelId = process.env.YOUTUBE_CHANNEL_ID;
    if (!channelId) {
      throw new Error('YOUTUBE_CHANNEL_ID not set in environment variables');
    }

    const response = await youtube.search.list({
      auth: oauth2Client,
      part: ['id', 'snippet'],
      channelId: channelId,
      type: 'video',
      order: 'date',
      maxResults: limit
    } as any); // Type assertion needed due to Google API type complexity

    if (!response.data?.items) {
      return [];
    }

    return response.data.items
      .filter((item: any) => item.id?.videoId)
      .map((item: any) => ({
        id: item.id!.videoId!,
        title: item.snippet?.title || 'Unknown'
      }));
  } catch (error) {
    console.error('Error fetching recent videos:', error);
    throw error;
  }
}

/**
 * Fetch comments from a specific video
 */
export async function getVideoComments(videoId: string, maxResults: number = 100): Promise<YouTubeComment[]> {
  try {
    const youtube = getYouTubeClient();
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN
    });

    // First, get video title
    const videoResponse = await youtube.videos.list({
      auth: oauth2Client,
      part: ['snippet'],
      id: [videoId]
    } as any);

    const videoTitle = videoResponse.data?.items?.[0]?.snippet?.title || 'Unknown Video';

    // Fetch comments
    const comments: YouTubeComment[] = [];
    let nextPageToken: string | undefined;

    do {
      const response = await youtube.commentThreads.list({
        auth: oauth2Client,
        part: ['snippet'],
        videoId: videoId,
        maxResults: Math.min(maxResults - comments.length, 100),
        pageToken: nextPageToken,
        order: 'relevance'
      } as any);

      if (response.data?.items) {
        for (const item of response.data.items) {
          const topLevelComment = item.snippet?.topLevelComment?.snippet;
          if (topLevelComment) {
            comments.push({
              id: item.id || '',
              author: topLevelComment.authorDisplayName || 'Anonymous',
              text: topLevelComment.textDisplay || '',
              publishedAt: topLevelComment.publishedAt || '',
              videoId: videoId,
              videoTitle: videoTitle
            });

            // Also get replies to comments
            if (item.snippet?.totalReplyCount && item.snippet.totalReplyCount > 0 && item.id) {
              const repliesResponse = await youtube.comments.list({
                auth: oauth2Client,
                part: ['snippet'],
                parentId: item.id,
                maxResults: 10
              } as any);

              if (repliesResponse.data?.items) {
                for (const reply of repliesResponse.data.items) {
                  const replySnippet = reply.snippet;
                  if (replySnippet) {
                    comments.push({
                      id: reply.id || '',
                      author: replySnippet.authorDisplayName || 'Anonymous',
                      text: replySnippet.textDisplay || '',
                      publishedAt: replySnippet.publishedAt || '',
                      videoId: videoId,
                      videoTitle: videoTitle
                    });
                  }
                }
              }
            }
          }
        }
      }

      nextPageToken = response.data?.nextPageToken || undefined;
    } while (nextPageToken && comments.length < maxResults);

    return comments;
  } catch (error) {
    console.error(`Error fetching comments for video ${videoId}:`, error);
    throw error;
  }
}

/**
 * Fetch comments from recent videos
 */
export async function getRecentVideoComments(limit: number = 10): Promise<YouTubeComment[]> {
  try {
    const videos = await getRecentVideos(limit);
    const allComments: YouTubeComment[] = [];

    for (const video of videos) {
      try {
        const comments = await getVideoComments(video.id, 50); // Get up to 50 comments per video
        allComments.push(...comments);
      } catch (error) {
        console.error(`Error fetching comments for video ${video.id}:`, error);
        // Continue with other videos
      }
    }

    return allComments;
  } catch (error) {
    console.error('Error fetching recent video comments:', error);
    throw error;
  }
}

/**
 * Extract topic requests from comments using AI
 */
export async function extractTopicRequests(comments: YouTubeComment[]): Promise<TopicRequest[]> {
  if (comments.length === 0) {
    return [];
  }

  try {
    // Use OpenAI to analyze comments and extract topic requests
    const OpenAI = (await import('openai')).default;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const openai = new OpenAI({ apiKey });

    // Prepare comments text for analysis
    const commentsText = comments
      .slice(0, 100) // Limit to 100 comments for analysis
      .map(c => `- ${c.text}`)
      .join('\n');

    const prompt = `Analyze these YouTube comments from crypto news videos. Identify topics that viewers are requesting more information about (deep dives, explanations, etc.).

Comments:
${commentsText}

Extract topics that viewers are asking for more information about. Look for phrases like:
- "more about", "deep dive", "explain", "tell me about", "want to know", "learn more", "can you cover", "discuss", "talk about", "dive into", "break down"

For each topic requested, identify:
1. The topic name (e.g., "Bitcoin", "Ethereum", "DeFi", "NFTs", "Regulation", etc.)
2. How many times it was requested

Format your response as JSON:
{
  "topics": [
    {
      "topic": "Topic Name",
      "count": 5,
      "sampleComments": ["comment 1", "comment 2"]
    }
  ]
}

Only return the JSON object, no other text.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing YouTube comments to identify topics viewers want to learn more about.'
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
    const aiTopics = Array.isArray(parsed.topics) ? parsed.topics : [];

    // Map AI results to TopicRequest format
    const topicMap = new Map<string, TopicRequest>();

    for (const aiTopic of aiTopics) {
      const topic = aiTopic.topic;
      if (!topicMap.has(topic)) {
        topicMap.set(topic, {
          topic,
          count: aiTopic.count || 0,
          comments: [],
          lastUpdated: new Date().toISOString()
        });
      }

      // Find matching comments
      const topicRequest = topicMap.get(topic)!;
      const lowerTopic = topic.toLowerCase();
      
      for (const comment of comments) {
        const lowerText = comment.text.toLowerCase();
        if (lowerText.includes(lowerTopic) && 
            (lowerText.includes('more') || lowerText.includes('deep') || 
             lowerText.includes('explain') || lowerText.includes('dive') ||
             lowerText.includes('cover') || lowerText.includes('discuss'))) {
          topicRequest.comments.push({
            text: comment.text,
            videoId: comment.videoId,
            videoTitle: comment.videoTitle,
            author: comment.author
          });
        }
      }
    }

    // Convert to array and sort by count
    return Array.from(topicMap.values())
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error('Error extracting topic requests with AI:', error);
    // Fallback to simple pattern matching
    return extractTopicRequestsFallback(comments);
  }
}

/**
 * Fallback method using simple pattern matching
 */
function extractTopicRequestsFallback(comments: YouTubeComment[]): TopicRequest[] {
  const topicKeywords = [
    'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'blockchain',
    'defi', 'nft', 'web3', 'altcoin', 'trading', 'market',
    'regulation', 'sec', 'adoption', 'mining', 'staking'
  ];

  const topicMap = new Map<string, TopicRequest>();

  for (const comment of comments) {
    const lowerText = comment.text.toLowerCase();
    
    const requestPhrases = [
      'more about', 'deep dive', 'explain', 'tell me about',
      'want to know', 'learn more', 'can you cover', 'discuss',
      'talk about', 'dive into', 'break down'
    ];

    const isRequest = requestPhrases.some(phrase => lowerText.includes(phrase));
    
    if (isRequest) {
      for (const keyword of topicKeywords) {
        if (lowerText.includes(keyword)) {
          const topic = keyword.charAt(0).toUpperCase() + keyword.slice(1);
          
          if (!topicMap.has(topic)) {
            topicMap.set(topic, {
              topic,
              count: 0,
              comments: [],
              lastUpdated: new Date().toISOString()
            });
          }

          const topicRequest = topicMap.get(topic)!;
          topicRequest.count++;
          topicRequest.comments.push({
            text: comment.text,
            videoId: comment.videoId,
            videoTitle: comment.videoTitle,
            author: comment.author
          });
        }
      }
    }
  }

  return Array.from(topicMap.values())
    .sort((a, b) => b.count - a.count);
}

/**
 * Get the most requested topic for deep dive
 * Falls back to trending topics from news if no comments/topic requests found
 * Filters out topics that have already been covered in previous deep dive videos
 */
export async function getMostRequestedTopic(): Promise<TopicRequest | null> {
  try {
    // Import deep dive topic history to check for duplicates
    const { deepDiveTopicHistory } = await import('./deepDiveTopicHistory.js');
    
    const comments = await getRecentVideoComments(10);
    const topicRequests = await extractTopicRequests(comments);
    
    // Filter out topics that have already been covered
    const filteredRequests = topicRequests.filter(request => {
      const wasCovered = deepDiveTopicHistory.wasTopicCovered(request.topic);
      if (wasCovered) {
        console.log(`⏭️ Skipping already-covered deep dive topic: "${request.topic}"`);
      }
      return !wasCovered;
    });
    
    if (filteredRequests.length > 0) {
      console.log(`✅ Selected topic from comments: "${filteredRequests[0].topic}" (${filteredRequests[0].count} requests)`);
      return filteredRequests[0]; // Most requested topic from comments (not yet covered)
    }
    
    // Fallback: Get trending topic from news
    console.log('📰 No topic requests from comments. Falling back to trending topics from news...');
    return await getTrendingTopicFromNews();
  } catch (error: any) {
    // Check if it's a quota exceeded error
    const isQuotaError = error?.message?.includes('quota') || 
                         error?.message?.includes('Quota') ||
                         error?.code === 403 ||
                         error?.response?.status === 403;
    
    if (isQuotaError) {
      console.warn('⚠️ YouTube API quota exceeded. Cannot fetch comments. Falling back to trending topics from news...');
      console.warn('💡 Your YouTube API quota resets daily at midnight Pacific Time.');
      console.warn('💡 To reduce quota usage, consider:');
      console.warn('   - Reducing automation frequency');
      console.warn('   - Using fewer videos/comments for topic analysis');
    } else {
      console.error('Error getting most requested topic:', error);
    }
    
    // Try fallback even on error (especially quota errors)
    try {
      console.log('📰 Attempting fallback to trending topics from news...');
      return await getTrendingTopicFromNews();
    } catch (fallbackError) {
      console.error('Error in fallback to trending topics:', fallbackError);
      return null;
    }
  }
}

/**
 * Get a trending topic from news as fallback when no comments are available
 * Filters out topics that have already been covered in previous deep dive videos
 */
async function getTrendingTopicFromNews(): Promise<TopicRequest | null> {
  try {
    // Import deep dive topic history to check for duplicates
    const { deepDiveTopicHistory } = await import('./deepDiveTopicHistory.js');
    
    // Import news scraping and topic distillation
    const { scrapeCryptoNews } = await import('./newsScraper.js');
    const { distillTrendingTopics } = await import('./aiService.js');
    
    // Scrape latest news
    const articles = await scrapeCryptoNews();
    if (articles.length === 0) {
      console.warn('⚠️ No news articles found for fallback topic');
      return null;
    }
    
    // Get trending topics
    const trendingTopics = await distillTrendingTopics(articles);
    if (trendingTopics.length === 0) {
      console.warn('⚠️ No trending topics found for fallback');
      return null;
    }
    
    // Filter out already-covered topics
    for (const topic of trendingTopics) {
      const wasCovered = deepDiveTopicHistory.wasTopicCovered(topic.title);
      if (!wasCovered) {
        console.log(`✅ Selected topic from trending news: "${topic.title}"`);
        return {
          topic: topic.title,
          count: 0, // Indicates it's from news, not comments
          comments: [],
          lastUpdated: new Date().toISOString()
        };
      } else {
        console.log(`⏭️ Skipping already-covered trending topic: "${topic.title}"`);
      }
    }
    
    // If all trending topics were already covered, return the first one anyway
    // (better than no video, but log a warning)
    console.warn(`⚠️ All trending topics have been covered. Using "${trendingTopics[0].title}" anyway.`);
    return {
      topic: trendingTopics[0].title,
      count: 0,
      comments: [],
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting trending topic from news:', error);
    return null;
  }
}

