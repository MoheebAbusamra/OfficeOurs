// React entry point: mounts <App /> with routing and the auth provider
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import AuthProvider from './context/AuthContext.jsx';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ServerStatus from './components/ServerStatus.jsx';
import './index.css';

// The Floci build (VITE_ROUTER=hash) uses links like
// .../index.html#/student/requests: the S3 bucket only serves files, so it cannot answer /student/requests
// with index.html. Everything after # stays in the browser. Local dev (npm run dev) keeps normal links.
const Router = import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <App />
          <ServerStatus />
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  </React.StrictMode>
);
