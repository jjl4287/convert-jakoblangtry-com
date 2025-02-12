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

type HistoryItem = {
  timestamp: number;
} & ConversionResponse;

interface ConversionMetadata {
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  url: string;
  icon: JSX.Element;
  service: "Spotify" | "Apple Music";
}

// Type guard functions to help TypeScript narrow the types
function isAppleToSpotify(item: ConversionResponse | HistoryItem): item is (typeof item & { conversionDirection: "apple-to-spotify" }) {
  return item.conversionDirection === "apple-to-spotify";
}

// Helper function to get metadata based on conversion direction
function getMetadata(item: ConversionResponse | HistoryItem): ConversionMetadata | null {
  try {
    if (!item) return null;

    if (isAppleToSpotify(item)) {
      const { metadata } = item.spotifyResult || {};
      if (!metadata) return null;

      return {
        title: metadata.title || 'Unknown Title',
        artist: metadata.artist || 'Unknown Artist',
        album: metadata.album,
        artworkUrl: metadata.artworkUrl,
        url: item.spotifyResult.spotifyUrl,
        icon: <SpotifyIcon />,
        service: "Spotify"
      };
    } else {
      const { metadata } = item.appleMusicResult || {};
      if (!metadata) return null;

      return {
        title: metadata.title || 'Unknown Title',
        artist: metadata.artist || 'Unknown Artist',
        album: metadata.album,
        artworkUrl: metadata.artworkUrl,
        url: item.appleMusicResult.appleMusicUrl,
        icon: <AppleIcon />,
        service: "Apple Music"
      };
    }
  } catch (error) {
    console.error('Error extracting metadata:', error);
    return null;
  }
}

// SVG icons for the services
const SpotifyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="#1DB954" viewBox="0 0 24 24" width="24" height="24">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

const AppleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="#ffffff" viewBox="0 0 24 24" width="24" height="24">
    <path d="M16.365 1.43c0 1.14-.416 2.29-1.267 3.15-.849.86-1.98 1.65-3.11 1.65-1.13 0-2.27-.79-3.12-1.65C8.08 3.72 7.668 2.57 7.668 1.43c0-.99.417-1.97 1.267-2.83 1.02-.99 2.32-.99 3.34-.99 1.02 0 2.32 0 3.34.99.85.86 1.267 1.84 1.267 2.83zM13.008 5.92c-3.714 0-5.66 2.302-5.66 2.302-.184.328-.35.656-.507.984-.154.324-.3.648-.456.972-.186.396-.35.792-.523 1.188-1.056 2.43-.78 6.07.813 8.096.546.624 1.22 1.044 1.96 1.044.788 0 1.69-.428 2.346-.428.66 0 1.492.428 2.3.43.748 0 1.41-.42 1.965-1.046 1.585-2.024 1.86-5.664.813-8.096-.153-.396-.307-.792-.466-1.188-.157-.324-.328-.648-.507-.984 0 0-1.95-2.302-5.666-2.302z"/>
  </svg>
);

export const LinkConverter: React.FC = () => {
  const [inputLink, setInputLink] = useState('');
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

  // Helper to detect link type
  const detectLinkType = (link: string): "apple" | "spotify" | "unknown" => {
    if (link.includes("music.apple.com")) return "apple";
    if (link.includes("open.spotify.com")) return "spotify";
    return "unknown";
  };

  const linkType = detectLinkType(inputLink);

  const getHeaderText = () => {
    switch (linkType) {
      case "apple":
        return "Convert Apple Music to Spotify";
      case "spotify":
        return "Convert Spotify to Apple Music";
      default:
        return "Music Link Converter";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/convert?link=${encodeURIComponent(inputLink)}`
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

  const renderMetadata = (metadata: ConversionMetadata | null) => {
    if (!metadata) return null;

    return (
      <div className="flex items-start gap-8">
        {metadata.artworkUrl && (
          <motion.img
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            src={metadata.artworkUrl}
            alt="Album artwork"
            className="w-64 h-64 object-cover rounded-lg shadow-2xl"
          />
        )}
        <div className="flex-1 space-y-4">
          <motion.h2
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-2xl font-bold text-white"
          >
            {metadata.title}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="text-gray-400"
          >
            {metadata.artist}
          </motion.p>
          {metadata.album && (
            <motion.p
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="text-gray-400"
            >
              {metadata.album}
            </motion.p>
          )}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-4"
          >
            <span className="text-sm text-gray-400">
              Match Confidence: {result?.confidence ?? 0}%
            </span>
            <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${result?.confidence ?? 0}%` }}
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
              href={metadata.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-[#9d8cff] text-white rounded-lg hover:bg-[#8a77ff] transition-colors duration-300"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {metadata.icon}
              <span>Open in {metadata.service}</span>
            </motion.a>
            <motion.button
              onClick={() => handleCopyLink(metadata.url)}
              className="px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700/30 transition-colors duration-300"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {copySuccess ? "Copied!" : "Copy Link"}
            </motion.button>
          </motion.div>
        </div>
      </div>
    );
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
            {getHeaderText()}
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
            <div className="flex gap-2 items-stretch">
              <input
                type="url"
                value={inputLink}
                onChange={(e) => setInputLink(e.target.value)}
                placeholder="Paste Apple Music or Spotify link here"
                className="flex-1 px-6 py-4 rounded-xl bg-background-light border-2 border-gray-700 focus:border-[#9d8cff] focus:ring-2 focus:ring-[#9d8cff]/20 text-lg transition-all duration-300 outline-none text-white"
                required
              />
              <motion.button
                type="submit"
                disabled={isLoading}
                className="min-w-[140px] border-2 border-transparent bg-[#9d8cff] text-white px-6 rounded-xl hover:bg-[#8a77ff] disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-colors duration-300 flex items-center gap-2 justify-center"
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
                  <>
                    {linkType === "apple" ? <SpotifyIcon /> : linkType === "spotify" ? <AppleIcon /> : null}
                    <span>
                      {linkType === "apple" ? "Convert to Spotify" : 
                       linkType === "spotify" ? "Convert to Apple Music" : 
                       "Convert"}
                    </span>
                  </>
                )}
              </motion.button>
            </div>
          </motion.form>

          <AnimatePresence mode="sync">
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

            {result && (() => {
              const metadata = getMetadata(result);
              if (!metadata) return null;

              return (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-background-light rounded-xl shadow-xl p-6 mb-8 border border-gray-700/50"
                >
                  {renderMetadata(metadata)}
                </motion.div>
              );
            })()}
          </AnimatePresence>

          {history.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-12"
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-white">Recent Conversions</h2>
                <button
                  onClick={clearHistory}
                  className="text-gray-400 hover:text-white transition-colors duration-300"
                >
                  Clear History
                </button>
              </div>
              <div className="space-y-4">
                {history.map((item, index) => {
                  const metadata = getMetadata(item);
                  if (!metadata) return null;

                  return (
                    <motion.div
                      key={item.timestamp}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="bg-background-light rounded-lg p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        {metadata.icon}
                        <div>
                          <p className="text-white font-medium">
                            {metadata.title}
                          </p>
                          <p className="text-gray-400 text-sm">
                            {metadata.artist}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <motion.a
                          href={metadata.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#9d8cff] hover:text-[#8a77ff] transition-colors duration-300"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          Open
                        </motion.a>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </LazyMotion>
  );
}; 