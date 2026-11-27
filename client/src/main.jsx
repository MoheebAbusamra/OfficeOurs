// React entry point: mounts <App /> with routing and the auth provider
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import AuthProvider from './context/AuthContext.jsx';
import App from './App.jsx';
import './index.css';

// [Shared, added by S2 for the Floci deployment] The Floci build (VITE_ROUTER=hash) uses links like
// .../index.html#/student/requests: the S3 bucket only serves files, so it cannot answer /student/requests
// with index.html. Everything after # stays in the browser. Local dev (npm run dev) keeps normal links.
const Router = import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Router>
  </React.StrictMode>
);
