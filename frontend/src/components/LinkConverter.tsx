import React, { useState, useEffect } from 'react';
import { ConversionResponse, ApiError } from '../types';
import Cookies from 'js-cookie';
import { motion, AnimatePresence as OriginalAnimatePresence, LazyMotion, domAnimation } from 'framer-motion';
import type { AnimatePresenceProps } from 'framer-motion';

// Define an extended interface that includes children
interface ExtendedAnimatePresenceProps extends AnimatePresenceProps {
  children?: React.ReactNode;
}

// Updated AnimatePresence wrapper using the extended props interface
const AnimatePresence: React.FC<ExtendedAnimatePresenceProps> = (props) => {
  const element = OriginalAnimatePresence(props);
  // If OriginalAnimatePresence returns undefined, fallback to rendering its children in a Fragment
  return element === undefined ? <React.Fragment>{props.children}</React.Fragment> : element;
};

interface HistoryItem extends ConversionResponse {
  timestamp: number;
}

export const LinkConverter: React.FC = () => {
  const [appleMusicLink, setAppleMusicLink] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ConversionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Load history from cookies on component mount
  useEffect(() => {
    const savedHistory = Cookies.get('conversionHistory');
    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory);
        setHistory(parsedHistory);
      } catch (e) {
        console.error('Failed to parse history from cookie:', e);
      }
    }
  }, []);

  // Save history to cookies whenever it changes
  useEffect(() => {
    if (history.length > 0) {
      const cookieOptions = {
        expires: 30,
        path: '/',
        sameSite: 'strict' as const,
        secure: window.location.protocol === 'https:',
      };
      Cookies.set('conversionHistory', JSON.stringify(history), cookieOptions);
    }
  }, [history]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/convert?appleMusicLink=${encodeURIComponent(appleMusicLink)}`
      );
      const data = await response.json();

      if (!response.ok) {
        const errorData = data as ApiError;
        throw new Error(errorData.error || 'Failed to convert link');
      }

      const conversionResult = data as ConversionResponse;
      setResult(conversionResult);

      const historyItem: HistoryItem = {
        ...conversionResult,
        timestamp: Date.now()
      };
      setHistory(prev => [historyItem, ...prev.slice(0, 9)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    Cookies.remove('conversionHistory', { path: '/' });
  };

  return (
    <LazyMotion features={domAnimation}>
      <div className="min-h-screen bg-[#121212]">
        <div className="max-w-4xl mx-auto p-6 pt-12">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-bold text-center mb-4 text-white"
          >
            Convert Apple Music to Spotify
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center text-gray-400 mb-12"
          >
            Transform your music links instantly
          </motion.p>

          <motion.form 
            onSubmit={handleSubmit}
            className="mb-8 space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <div className="relative">
              <input
                type="url"
                value={appleMusicLink}
                onChange={(e) => setAppleMusicLink(e.target.value)}
                placeholder="Paste Apple Music link here"
                className="w-full px-6 py-4 rounded-xl bg-background-light border-2 border-gray-700 focus:border-[#9d8cff] focus:ring-2 focus:ring-[#9d8cff]/20 text-lg transition-all duration-300 outline-none text-white"
                required
              />
              <motion.button
                type="submit"
                disabled={isLoading}
                className="absolute right-2 top-2 bg-[#9d8cff] text-white px-8 py-2 rounded-lg hover:bg-[#8a77ff] disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all duration-300"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                    />
                    <span>Converting...</span>
                  </div>
                ) : (
                  'Convert'
                )}
              </motion.button>
            </div>
          </motion.form>

          <React.Fragment>
            <AnimatePresence mode="sync" presenceAffectsLayout>
              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-red-500/10 border border-red-500/20 text-red-400 px-6 py-4 rounded-xl mb-8"
                >
                  {error}
                </motion.div>
              )}

              {result && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-background-light rounded-xl shadow-xl p-6 mb-8 border border-gray-700/50"
                >
                  <div className="flex items-start gap-8">
                    {result.spotifyResult.metadata.artworkUrl && (
                      <motion.img
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                        src={result.spotifyResult.metadata.artworkUrl}
                        alt={`${result.spotifyResult.metadata.title} artwork`}
                        className="w-64 h-64 object-cover rounded-lg shadow-2xl"
                      />
                    )}
                    <div className="flex-1 space-y-4">
                      <motion.h2
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-2xl font-bold text-white"
                      >
                        {result.spotifyResult.metadata.title}
                      </motion.h2>
                      <motion.p
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-gray-400"
                      >
                        {result.spotifyResult.metadata.artist}
                      </motion.p>
                      {result.spotifyResult.metadata.album && (
                        <motion.p
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 }}
                          className="text-gray-400"
                        >
                          {result.spotifyResult.metadata.album}
                        </motion.p>
                      )}
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="flex items-center gap-4"
                      >
                        <span className="text-sm text-gray-400">
                          Match Confidence: {result.confidence}%
                        </span>
                        <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${result.confidence}%` }}
                            transition={{ delay: 0.4, duration: 0.8 }}
                            className="h-full bg-[#9d8cff] rounded-full"
                          />
                        </div>
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="flex gap-3 pt-4"
                      >
                        <motion.a
                          href={result.spotifyResult.spotifyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 bg-[#9d8cff] px-6 py-3 rounded-lg hover:bg-[#8a77ff] font-semibold transition-colors duration-300"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          Open in Spotify
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                          </svg>
                        </motion.a>
                        <motion.button
                          onClick={() => handleCopyLink(result.spotifyResult.spotifyUrl)}
                          className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg transition-all duration-300 font-semibold ${
                            copySuccess 
                              ? 'bg-green-500/20 text-green-400' 
                              : 'bg-[#9d8cff]/20 text-[#9d8cff] hover:bg-[#9d8cff]/30'
                          }`}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          {copySuccess ? (
                            <>
                              Copied!
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </>
                          ) : (
                            <>
                              Copy Link
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                              </svg>
                            </>
                          )}
                        </motion.button>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </React.Fragment>

          {/* History Section */}
          <React.Fragment>
            <AnimatePresence mode="sync" presenceAffectsLayout>
              {history.length > 0 && (
                <motion.div
                  key="history"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-16"
                >
                  <div className="flex justify-between items-center mb-6">
                    <motion.h2
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-2xl font-bold text-white"
                    >
                      Recent Conversions
                    </motion.h2>
                    <motion.button
                      onClick={clearHistory}
                      className="text-red-400 hover:text-red-300 font-medium transition-colors duration-300"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      Clear History
                    </motion.button>
                  </div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    {history.map((item, index) => (
                      <motion.div
                        key={item.timestamp}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="bg-background-light rounded-xl p-4 flex items-center gap-4 border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300"
                      >
                        {item.spotifyResult.metadata.artworkUrl && (
                          <img
                            src={item.spotifyResult.metadata.artworkUrl}
                            alt={`${item.spotifyResult.metadata.title} artwork`}
                            className="w-20 h-20 object-cover rounded-lg"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate text-white">
                            {item.spotifyResult.metadata.title}
                          </h3>
                          <p className="text-gray-400 truncate">
                            {item.spotifyResult.metadata.artist}
                          </p>
                          <p className="text-sm text-gray-500">
                            {new Date(item.timestamp).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex gap-3">
                          <motion.a
                            href={item.spotifyResult.spotifyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#9d8cff] hover:text-[#8a77ff] transition-colors duration-300"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                          >
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                            </svg>
                          </motion.a>
                          <motion.button
                            onClick={() => handleCopyLink(item.spotifyResult.spotifyUrl)}
                            className="text-[#9d8cff] hover:text-[#8a77ff] transition-colors duration-300"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                          >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                          </motion.button>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </React.Fragment>
        </div>
      </div>
    </LazyMotion>
  );
}; 