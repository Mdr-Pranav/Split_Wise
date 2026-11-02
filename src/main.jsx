import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
// Bundled with the app (not Google Fonts) so it works offline
import '@fontsource-variable/inter';
import './index.css';
import { setupPwa } from './lib/pwa';

setupPwa();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
