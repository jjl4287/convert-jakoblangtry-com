import React, { useState, useEffect } from 'react';
import { ConversionResponse, ApiError } from '../types';
import Cookies from 'js-cookie';
import { motion, AnimatePresence as OriginalAnimatePresence, LazyMotion, domAnimation } from 'framer-motion';
import type { AnimatePresenceProps } from 'framer-motion';
import { SpotifyIcon, AppleMusicIcon } from './icons';

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
  buttonColor: string;
  brandColor: string;
  releaseDate?: string;
  genres?: string[];
  type: 'track' | 'album' | 'artist';
  trackNumber?: number;
  totalTracks?: number;
  discNumber?: number;
  duration?: number;
  popularity?: number;
  previewUrl?: string;
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
      const spotifyData = item.spotifyResult;
      if (!spotifyData || !spotifyData.metadata) return null;
      
      return {
        title: spotifyData.metadata.title || 'Unknown Title',
        artist: spotifyData.metadata.artist || 'Unknown Artist',
        album: spotifyData.metadata.album,
        artworkUrl: spotifyData.metadata.artworkUrl,
        url: spotifyData.spotifyUrl,
        icon: <SpotifyIcon className="text-white h-6 w-6" />,
        releaseDate: spotifyData.metadata.releaseDate,
        genres: spotifyData.metadata.genres,
        service: "Spotify",
        buttonColor: "#1DB954",
        brandColor: "#1DB954",
        type: spotifyData.metadata.type,
        trackNumber: spotifyData.metadata.trackNumber,
        totalTracks: spotifyData.metadata.totalTracks,
        discNumber: spotifyData.metadata.discNumber,
        duration: spotifyData.metadata.duration,
        popularity: spotifyData.metadata.popularity,
        previewUrl: spotifyData.metadata.previewUrl,
      };
    } else {
      const appleData = item.appleMusicResult;
      if (!appleData || !appleData.metadata) return null;
      
      return {
        title: appleData.metadata.title || 'Unknown Title',
        artist: appleData.metadata.artist || 'Unknown Artist',
        album: appleData.metadata.album,
        artworkUrl: appleData.metadata.artworkUrl,
        url: appleData.appleMusicUrl,
        icon: <AppleMusicIcon className="text-white h-6 w-6" />,
        releaseDate: appleData.metadata.releaseDate,
        genres: appleData.metadata.genres,
        service: "Apple Music",
        buttonColor: "#fa586a",
        brandColor: "#fa586a",
        type: appleData.metadata.type,
        trackNumber: appleData.metadata.trackNumber,
        totalTracks: appleData.metadata.totalTracks,
        discNumber: appleData.metadata.discNumber,
        duration: appleData.metadata.duration,
        popularity: appleData.metadata.popularity,
        previewUrl: appleData.metadata.previewUrl,
      };
    }
  } catch (error) {
    console.error('Error extracting metadata:', error);
    return null;
  }
}

export const LinkConverter: React.FC = () => {
  const [inputLink, setInputLink] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ConversionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyCopySuccess, setHistoryCopySuccess] = useState<{ [key: number]: boolean }>({});
  const [expandedCard, setExpandedCard] = useState<number | null>(null);

  // Load history from cookies on component mount
  useEffect(() => {
    const savedHistory = Cookies.get('conversionHistory');
    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory);
        if (Array.isArray(parsedHistory)) {
          // Ensure the history items have all required properties
          const validHistory = parsedHistory.filter(item => 
            item && 
            item.timestamp && 
            item.conversionDirection && 
            (item.spotifyResult || item.appleMusicResult)
          );
          setHistory(validHistory);
        }
      } catch (e) {
        console.error('Failed to parse history from cookie:', e);
        // Clear invalid cookie
        Cookies.remove('conversionHistory', { path: '/' });
      }
    }
  }, []);

  // Save history to cookies whenever it changes
  useEffect(() => {
    if (history.length > 0) {
      try {
        const cookieOptions = {
          expires: 30,
          path: '/',
          sameSite: 'strict' as const,
          secure: window.location.protocol === 'https:',
        };
        // Stringify with a replacer function to handle circular references
        const historyString = JSON.stringify(history, (key, value) => {
          if (key === 'icon') return undefined; // Exclude icon JSX elements
          return value;
        });
        Cookies.set('conversionHistory', historyString, cookieOptions);
      } catch (e) {
        console.error('Failed to save history to cookie:', e);
      }
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

  const handleCopyLink = async (url: string, timestamp?: number) => {
    try {
      await navigator.clipboard.writeText(url);
      if (timestamp !== undefined) {
        setHistoryCopySuccess(prev => ({ ...prev, [timestamp]: true }));
        setTimeout(() => {
          setHistoryCopySuccess(prev => ({ ...prev, [timestamp]: false }));
        }, 2000);
      } else {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      }
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
      <div className="flex items-stretch gap-8">
        {metadata.artworkUrl && (
          <motion.img
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            src={metadata.artworkUrl}
            alt={metadata.type === 'artist' ? 'Artist photo' : 'Album artwork'}
            className={`w-64 h-64 object-cover shadow-2xl flex-shrink-0 ${
              metadata.type === 'artist' ? 'rounded-full' : 'rounded-lg'
            }`}
          />
        )}
        <div className="flex-1 flex flex-col">
          <div className="flex-1">
            <motion.h2
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-3xl font-bold text-white mb-6"
            >
              {metadata.title}
            </motion.h2>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-3"
            >
              {metadata.type !== 'artist' ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-lg">Artist:</span>
                    <span className="text-gray-200 text-lg">{metadata.artist}</span>
                  </div>
                  {metadata.album && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-lg">Album:</span>
                      <span className="text-gray-200 text-lg">{metadata.album}</span>
                    </div>
                  )}
                </>
              ) : metadata.genres && metadata.genres.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-lg">Genres:</span>
                  <span className="text-gray-200 text-lg">{metadata.genres.join(', ')}</span>
                </div>
              )}
            </motion.div>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex items-center justify-between mt-4"
          >
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
                  className="h-full rounded-full"
                  style={{ backgroundColor: metadata.buttonColor }}
                />
              </div>
            </motion.div>
            <div className="flex items-center gap-3">
              <motion.button
                onClick={() => handleCopyLink(metadata.url)}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors duration-300"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {copySuccess ? "Copied!" : "Copy Link"}
              </motion.button>
              <motion.a
                href={metadata.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-colors duration-300`}
                style={{ backgroundColor: metadata.buttonColor }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {metadata.icon}
                <span>Open in {metadata.service}</span>
              </motion.a>
            </div>
          </motion.div>
        </div>
      </div>
    );
  };

  const renderHistoryCard = (item: HistoryItem, index: number) => {
    const metadata = getMetadata(item);
    if (!metadata) return null;

    const isExpanded = expandedCard === item.timestamp;

    const formatDuration = (ms?: number) => {
      if (!ms) return '';
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const renderExpandedContent = () => {
      switch (metadata.type) {
        case 'track':
          return (
            <div className="grid grid-cols-2 gap-4">
              {metadata.album && (
                <div>
                  <p className="text-gray-500 text-sm">Album</p>
                  <p className="text-gray-200">{metadata.album}</p>
                </div>
              )}
              {metadata.releaseDate && (
                <div>
                  <p className="text-gray-500 text-sm">Release Date</p>
                  <p className="text-gray-200">
                    {new Date(metadata.releaseDate).toLocaleDateString()}
                  </p>
                </div>
              )}
              {metadata.trackNumber && (
                <div>
                  <p className="text-gray-500 text-sm">Track Number</p>
                  <p className="text-gray-200">
                    {metadata.trackNumber} of {metadata.totalTracks || '?'}
                  </p>
                </div>
              )}
              {metadata.duration && (
                <div>
                  <p className="text-gray-500 text-sm">Duration</p>
                  <p className="text-gray-200">{formatDuration(metadata.duration)}</p>
                </div>
              )}
              {metadata.genres && metadata.genres.length > 0 && (
                <div className="col-span-2">
                  <p className="text-gray-500 text-sm">Genres</p>
                  <p className="text-gray-200">{metadata.genres.join(', ')}</p>
                </div>
              )}
              {metadata.popularity !== undefined && (
                <div>
                  <p className="text-gray-500 text-sm">Popularity</p>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-[#9d8cff]"
                        style={{ width: `${metadata.popularity}%` }}
                      />
                    </div>
                    <span className="text-gray-200 text-sm">{metadata.popularity}%</span>
                  </div>
                </div>
              )}
              {metadata.previewUrl && (
                <div className="col-span-2 mt-2">
                  <audio 
                    controls 
                    src={metadata.previewUrl}
                    className="w-full h-8"
                    onClick={e => e.stopPropagation()}
                  >
                    Your browser does not support the audio element.
                  </audio>
                </div>
              )}
            </div>
          );

        case 'album':
          return (
            <div className="grid grid-cols-2 gap-4">
              {metadata.releaseDate && (
                <div>
                  <p className="text-gray-500 text-sm">Release Date</p>
                  <p className="text-gray-200">
                    {new Date(metadata.releaseDate).toLocaleDateString()}
                  </p>
                </div>
              )}
              {metadata.totalTracks && (
                <div>
                  <p className="text-gray-500 text-sm">Total Tracks</p>
                  <p className="text-gray-200">{metadata.totalTracks} tracks</p>
                </div>
              )}
              {metadata.genres && metadata.genres.length > 0 && (
                <div className="col-span-2">
                  <p className="text-gray-500 text-sm">Genres</p>
                  <p className="text-gray-200">{metadata.genres.join(', ')}</p>
                </div>
              )}
              {metadata.popularity !== undefined && (
                <div>
                  <p className="text-gray-500 text-sm">Popularity</p>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-[#9d8cff]"
                        style={{ width: `${metadata.popularity}%` }}
                      />
                    </div>
                    <span className="text-gray-200 text-sm">{metadata.popularity}%</span>
                  </div>
                </div>
              )}
            </div>
          );

        case 'artist':
          return (
            <div className="grid grid-cols-2 gap-4">
              {metadata.genres && metadata.genres.length > 0 && (
                <div className="col-span-2">
                  <p className="text-gray-500 text-sm">Genres</p>
                  <p className="text-gray-200">{metadata.genres.join(', ')}</p>
                </div>
              )}
              {metadata.popularity !== undefined && (
                <div>
                  <p className="text-gray-500 text-sm">Popularity</p>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-[#9d8cff]"
                        style={{ width: `${metadata.popularity}%` }}
                      />
                    </div>
                    <span className="text-gray-200 text-sm">{metadata.popularity}%</span>
                  </div>
                </div>
              )}
            </div>
          );
      }
    };

    return (
      <motion.div
        key={item.timestamp}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1 }}
        layout
        onClick={() => setExpandedCard(isExpanded ? null : item.timestamp)}
        className={`bg-background-light rounded-lg p-4 cursor-pointer transition-shadow duration-300 hover:shadow-lg ${
          isExpanded ? 'shadow-xl' : ''
        }`}
      >
        <motion.div layout className="flex flex-col gap-4">
          <motion.div layout className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {metadata.icon}
              <div>
                <motion.p layout className="text-white font-medium">
                  {metadata.title}
                </motion.p>
                <motion.p layout className="text-gray-400 text-sm">
                  {metadata.artist}
                </motion.p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyLink(metadata.url, item.timestamp);
                }}
                className="text-gray-400 hover:text-white transition-colors duration-300"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {historyCopySuccess[item.timestamp] ? "Copied!" : "Copy"}
              </motion.button>
              <motion.a
                href={metadata.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[#9d8cff] hover:text-[#8a77ff] transition-colors duration-300"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Open
              </motion.a>
            </div>
          </motion.div>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="pt-4 border-t border-gray-700/50">
                  {renderExpandedContent()}
                  {metadata.artworkUrl && (
                    <div className="mt-4">
                      <motion.img
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        src={metadata.artworkUrl}
                        alt="Album artwork"
                        className="w-32 h-32 object-cover rounded-lg shadow-lg"
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    );
  };

  return (
    <LazyMotion features={domAnimation}>
      <div className="min-h-screen bg-[#121212]">
        <div className="max-w-6xl mx-auto p-6 pt-12">
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
                className={`min-w-[140px] border-2 border-transparent ${
                  linkType === "apple" ? "bg-[#1DB954] hover:bg-[#1aa34a]" : 
                  linkType === "spotify" ? "bg-[#fa586a] hover:bg-[#f94d60]" : 
                  "bg-[#4a5568] hover:bg-[#2d3748]"
                } text-white px-6 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-colors duration-300 flex items-center gap-2 justify-center`}
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
                    {linkType === "apple" ? <SpotifyIcon className="text-white h-6 w-6" /> : 
                     linkType === "spotify" ? <AppleMusicIcon className="text-white h-6 w-6" /> : 
                     null}
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
                {history.map((item, index) => renderHistoryCard(item, index))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </LazyMotion>
  );
}; 