import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Blog from './Blog';
import Admin from './Admin';
import ProtectedRoute from './ProtectedRoute';
import './auth'; // Initialize axios interceptors
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/blog" replace />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:id" element={<Blog />} />
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute>
              <Admin />
            </ProtectedRoute>
          } 
        />
        <Route path="*" element={<Navigate to="/blog" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

