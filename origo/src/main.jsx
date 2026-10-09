import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/origo.css';

// Apply the stored theme before first paint to avoid a flash.
document.documentElement.dataset.theme =
  localStorage.getItem('origo.theme') === 'light' ? 'light' : 'dark';

createRoot(document.getElementById('root')).render(<App />);
