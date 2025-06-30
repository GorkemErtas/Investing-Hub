import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { ThemeProvider } from './context/ThemeContext';
import { SelectedCoinsProvider } from './context/SelectedCoinsContext';
import { AlertThresholdProvider } from './context/AlertThresholdContext';
import axios from 'axios';
axios.defaults.baseURL = import.meta.env.VITE_API_URL;


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <SelectedCoinsProvider>
        <AlertThresholdProvider>
          <App />
        </AlertThresholdProvider>
      </SelectedCoinsProvider>
    </ThemeProvider>
  </StrictMode>
);
