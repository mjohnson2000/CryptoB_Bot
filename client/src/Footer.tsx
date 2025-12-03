import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Footer.css';

function Footer() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Verify token is valid
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
          setIsAuthenticated(false);
        }
      } catch (error) {
        setIsAuthenticated(false);
      }
    };

    verifyAuth();
  }, []);

  return (
    <footer className="app-footer">
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-section">
            <h4>Crypto B News</h4>
            <p>Your source for the latest crypto news, market analysis, and insights.</p>
          </div>
          
          <div className="footer-section">
            <h4>Quick Links</h4>
            <ul>
              <li>
                <button onClick={() => navigate('/blog')} className="footer-link">
                  Blog
                </button>
              </li>
              {isAuthenticated && (
                <li>
                  <button onClick={() => navigate('/admin')} className="footer-link">
                    Admin
                  </button>
                </li>
              )}
            </ul>
          </div>
          
          <div className="footer-section">
            <h4>About</h4>
            <p>Automated crypto news videos and blog posts delivered every 6 hours.</p>
          </div>
        </div>
        
        <div className="footer-bottom">
          <p>&copy; {currentYear} Crypto B News. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;

