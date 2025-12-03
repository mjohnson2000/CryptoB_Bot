import express, { Router, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { videoRouter } from './routes/video.js';
import { automationRouter } from './routes/automation.js';
import deepDiveRouter from './routes/deepDive.js';
import { blogRouter } from './routes/blog.js';
import { authRouter } from './routes/auth.js';
import { authenticate } from './middleware/auth.js';
import { automationService } from '../services/automationService.js';
import { deepDiveAutomationService } from '../services/deepDiveAutomationService.js';

// Load .env file from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(process.cwd(), '.env');
dotenv.config({ path: envPath });

// ============================================================================
// GLOBAL ERROR HANDLERS - Prevent server crashes
// ============================================================================

// Handle uncaught exceptions (synchronous errors)
process.on('uncaughtException', (error: Error) => {
  console.error('❌ UNCAUGHT EXCEPTION - Server will continue running:', error);
  console.error('Stack:', error.stack);
  // Don't exit - let the server continue running
  // Log to file or monitoring service in production
});

// Handle unhandled promise rejections (async errors)
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('❌ UNHANDLED REJECTION - Server will continue running:', reason);
  if (reason instanceof Error) {
    console.error('Stack:', reason.stack);
  }
  // Don't exit - let the server continue running
  // Log to file or monitoring service in production
});

// Handle warnings
process.on('warning', (warning: Error) => {
  console.warn('⚠️ WARNING:', warning.name);
  console.warn('Message:', warning.message);
  console.warn('Stack:', warning.stack);
});

// ============================================================================
// GRACEFUL SHUTDOWN HANDLING
// ============================================================================

let server: ReturnType<typeof app.listen> | null = null;

const gracefulShutdown = (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  if (server) {
    server.close(() => {
      console.log('✅ HTTP server closed');
      
      // Stop automation services if running
      try {
        const automationState = automationService.getState();
        if (automationState.isRunning) {
          console.log('🛑 Stopping news automation...');
          automationService.stop();
          console.log('✅ News automation stopped');
        }
      } catch (error) {
        console.error('Error stopping news automation:', error);
      }
      
      try {
        const deepDiveState = deepDiveAutomationService.getState();
        if (deepDiveState.isRunning) {
          console.log('🛑 Stopping deep dive automation...');
          deepDiveAutomationService.stop();
          console.log('✅ Deep dive automation stopped');
        }
      } catch (error) {
        console.error('Error stopping deep dive automation:', error);
      }
      
      console.log('✅ Graceful shutdown complete');
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      console.error('⚠️ Forcing shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================================================
// EXPRESS APP SETUP
// ============================================================================

// Log environment status (without exposing the key)
console.log('Environment loaded:', {
  hasOpenAIKey: !!process.env.OPENAI_API_KEY,
  hasYouTubeClientId: !!process.env.YOUTUBE_CLIENT_ID,
  port: process.env.PORT || 3001
});

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5174';

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(cors({
  origin: CLIENT_URL,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global error handler middleware (catches errors in routes)
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Express error handler:', err);
  console.error('Stack:', err.stack);
  
  // Don't crash - send error response
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Serve static files from output directory
const outputDir = path.join(process.cwd(), 'output');
app.use('/output', express.static(outputDir));

// Serve static files from client/dist (React app)
const clientDistDir = path.join(process.cwd(), 'client', 'dist');
app.use(express.static(clientDistDir));

// ============================================================================
// ROUTES
// ============================================================================

// Public routes (no authentication required)
app.use('/api/auth', authRouter);
app.use('/api/blog', blogRouter); // Blog GET routes are public

// Create a separate router for public preview routes
const previewRouter = Router();
previewRouter.get('/video/:filename', (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const safeFilename = path.basename(filename);
    const videoPath = path.join(process.cwd(), 'output', safeFilename);
    res.sendFile(videoPath, (err: Error | null) => {
      if (err) {
        const nodeErr = err as NodeJS.ErrnoException;
        if (nodeErr.code === 'EPIPE' || nodeErr.code === 'ECONNRESET') {
          return;
        }
        console.error('Error serving video:', err);
        if (!res.headersSent) {
          res.status(404).json({ error: 'Video not found' });
        }
      }
    });
  } catch (error) {
    console.error('Error in video preview endpoint:', error);
    res.status(500).json({ error: 'Error serving video' });
  }
});

previewRouter.get('/thumbnail/:filename', (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const safeFilename = path.basename(filename);
    const thumbnailPath = path.join(process.cwd(), 'output', safeFilename);
    res.sendFile(thumbnailPath, (err: Error | null) => {
      if (err) {
        const nodeErr = err as NodeJS.ErrnoException;
        if (nodeErr.code === 'EPIPE' || nodeErr.code === 'ECONNRESET') {
          return;
        }
        console.error('Error serving thumbnail:', err);
        if (!res.headersSent) {
          res.status(404).json({ error: 'Thumbnail not found' });
        }
      }
    });
  } catch (error) {
    console.error('Error in thumbnail preview endpoint:', error);
    res.status(500).json({ error: 'Error serving thumbnail' });
  }
});

// Public preview routes (no authentication required)
app.use('/api/video/preview', previewRouter);

// Protected routes (authentication required)
app.use('/api/video', authenticate, videoRouter);
app.use('/api/automation', authenticate, automationRouter);
app.use('/api/deepdive', authenticate, deepDiveRouter);

// Enhanced health check endpoint
app.get('/api/health', (req, res) => {
  try {
    const automationState = automationService.getState();
    res.json({ 
      status: 'ok', 
      message: 'YouTube Crypto Bot API is running',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      automation: {
        isRunning: automationState.isRunning,
        cadenceHours: automationState.cadenceHours
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      }
    });
  } catch (error) {
    // Even if health check fails, don't crash
    console.error('Error in health check:', error);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed but server is running',
      timestamp: new Date().toISOString()
    });
  }
});

// Serve React app for all non-API routes (SPA fallback)
// This handles /blog, /blog/:id, /admin, and all other routes
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  // Serve React app's index.html for all other routes (React Router will handle routing)
  const indexPath = path.join(process.cwd(), 'client', 'dist', 'index.html');
  res.sendFile(indexPath);
});

// ============================================================================
// START SERVER
// ============================================================================

try {
  server = app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`✅ Server is protected against crashes`);
  });

  // Handle server errors
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use`);
      console.error('Please use a different port or stop the other process');
    } else {
      console.error('❌ Server error:', error);
    }
    // Don't exit - let PM2 or process manager handle restart
  });
} catch (error) {
  console.error('❌ Failed to start server:', error);
  // Exit only if we can't start at all
  process.exit(1);
}

