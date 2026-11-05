import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

const mountNode =
  document.getElementById('ktn-react-v2-root') || document.getElementById('root');

if (mountNode) {
  ReactDOM.createRoot(mountNode).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

