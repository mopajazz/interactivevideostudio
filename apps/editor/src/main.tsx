import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { fetchVideoInfo, type FetchVideoInfo } from './video/info';
import './styles/tokens.css';
import './styles/app.css';

// Tests swap in a fake video-info service, but only when the URL asks for it with ?fake=1.
const fake = (window as { __ivtFakeVideoInfo?: FetchVideoInfo }).__ivtFakeVideoInfo;
const useFake = new URLSearchParams(location.search).get('fake') === '1' && typeof fake === 'function';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App fetchVideoInfo={useFake ? fake : fetchVideoInfo} />
  </StrictMode>,
);
