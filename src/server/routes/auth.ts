import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Get credentials from environment variables
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '24h';

// Default password hash for 'admin' (if ADMIN_PASSWORD_HASH is not set)
// This should be changed in production by setting ADMIN_PASSWORD_HASH in .env
const DEFAULT_PASSWORD_HASH = '$2a$10$rOzJqKqKqKqKqKqKqKqKqOqKqKqKqKqKqKqKqKqKqKqKqKqKqKq';

/**
 * Login endpoint
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    // Check username
    if (username !== ADMIN_USERNAME) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check password
    const passwordHash = ADMIN_PASSWORD_HASH || DEFAULT_PASSWORD_HASH;
    const isValidPassword = await bcrypt.compare(password, passwordHash);

    if (!isValidPassword) {
      // If using default hash, check against 'admin' password
      if (!ADMIN_PASSWORD_HASH) {
        if (password !== 'admin') {
          return res.status(401).json({
            success: false,
            error: 'Invalid credentials'
          });
        }
      } else {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      { username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );

    res.json({
      success: true,
      token,
      expiresIn: JWT_EXPIRES_IN
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Verify token endpoint
 * GET /api/auth/verify
 */
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        authenticated: false
      });
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { username: string; role: string };
      res.json({
        success: true,
        authenticated: true,
        user: {
          username: decoded.username,
          role: decoded.role
        }
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        authenticated: false,
        error: 'Invalid or expired token'
      });
    }
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({
      success: false,
      authenticated: false,
      error: 'Internal server error'
    });
  }
});

export { router as authRouter };

