/**
 * Vite entry — imports the live bundle until modules are split out.
 * Edit app-bundle.jsx; this file only boots React.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';

window.React = React;
window.ReactDOM = { createRoot };

import('./app-bundle.jsx').catch((error) => {
  console.error('[UNALIGNED] app bundle failed to load', error);
  throw error;
});
