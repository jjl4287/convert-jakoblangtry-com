import React from 'react';
import { LinkConverter } from './components/LinkConverter';
import './App.css';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-background-light shadow-sm">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <h1 className="text-lg font-semibold text-white">
            Music Link Converter
          </h1>
        </div>
      </header>
      <main>
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <LinkConverter />
        </div>
      </main>
    </div>
  );
};

export default App; 