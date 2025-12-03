import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import './MenuBar.css';

function MenuBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const isBlog = location.pathname.startsWith('/blog') || location.pathname === '/';
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Verify token is valid, not just check if it exists
    const verifyAuth = async () => {
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        setIsAuthenticated(false);
        return;
      }

      try {
        const response = await axios.get<{ success: boolean; authenticated: boolean }>('/api/auth/verify', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (response.data.success && response.data.authenticated) {
          setIsAuthenticated(true);
        } else {
          // Token is invalid, remove it
          localStorage.removeItem('authToken');
          localStorage.removeItem('authExpiresIn');
          setIsAuthenticated(false);
        }
      } catch (error) {
        // Token verification failed, remove it
        localStorage.removeItem('authToken');
        localStorage.removeItem('authExpiresIn');
        setIsAuthenticated(false);
      }
    };

    verifyAuth();
  }, [location]);

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authExpiresIn');
    setIsAuthenticated(false);
    navigate('/blog');
  };

  return (
    <nav className="menu-bar">
      <div className="menu-container">
        <div className="menu-logo" onClick={() => navigate('/blog')}>
          <span className="crypto-icon">₿</span>
          <span className="logo-text">Crypto B News</span>
        </div>
        
        <div className="menu-links">
          <button
            className={`menu-link ${isBlog ? 'active' : ''}`}
            onClick={() => navigate('/blog')}
          >
            📝 Blog
          </button>
          {isAuthenticated && (
            <button
              className={`menu-link ${isAdmin ? 'active' : ''}`}
              onClick={() => navigate('/admin')}
            >
              ⚙️ Admin
            </button>
          )}
          {isAuthenticated && (
            <button
              className="menu-link logout-button"
              onClick={handleLogout}
              title="Logout"
            >
              🚪 Logout
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

export default MenuBar;

