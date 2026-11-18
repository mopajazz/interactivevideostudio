import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import type { FakeAdapter } from '@ivt/player';
import { fakeAdapters, youTubeAdapters } from './video/adapters';
import { fetchVideoInfo, type FetchVideoInfo } from './video/info';
import './styles/tokens.css';
import './styles/app.css';

// Tests swap in a fake video-info service and fake video players (window.__fake), only when the URL has ?fake=1.
const w = window as { __ivtFakeVideoInfo?: FetchVideoInfo; __fake?: FakeAdapter };
const testMode = new URLSearchParams(location.search).get('fake') === '1';
const fake = w.__ivtFakeVideoInfo;
const useFake = testMode && typeof fake === 'function';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App fetchVideoInfo={useFake ? fake : fetchVideoInfo} adapters={testMode ? fakeAdapters(w) : youTubeAdapters} />
  </StrictMode>,
);
