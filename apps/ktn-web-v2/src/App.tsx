import React from 'react';
import { AppProviders } from './app/providers/AppProviders';
import { AppRouter } from './app/router/AppRouter';
import { RootErrorBoundary } from './components/shared/ErrorBoundary';

export const App: React.FC = () => {
  return (
    <RootErrorBoundary>
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </RootErrorBoundary>
  );
};

export default App;
