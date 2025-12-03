import axios from 'axios';

// Set up axios interceptor to include auth token in requests
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle 401 responses (unauthorized) - clear token and redirect to login
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token is invalid or expired
      localStorage.removeItem('authToken');
      localStorage.removeItem('authExpiresIn');
      // Only redirect if we're on an admin page
      if (window.location.pathname.startsWith('/admin')) {
        window.location.href = '/admin';
      }
    }
    return Promise.reject(error);
  }
);

