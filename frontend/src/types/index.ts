export interface DetailedMetadata {
  type: 'track' | 'album' | 'artist';
  title: string;
  artist: string;
  album?: string;
  isrc?: string;
  artworkUrl?: string;
  releaseDate?: string;
  genres?: string[];
  trackNumber?: number;
  totalTracks?: number;
  discNumber?: number;
  totalDiscs?: number;
  duration?: number;
  popularity?: number;
  previewUrl?: string;
}

export interface ConversionResponseAppleToSpotify {
  conversionDirection: "apple-to-spotify";
  appleMusicMetadata: DetailedMetadata;
  spotifyResult: {
    spotifyUrl: string;
    metadata: DetailedMetadata;
  };
  confidence: number;
}

export interface ConversionResponseSpotifyToApple {
  conversionDirection: "spotify-to-apple";
  spotifyMetadata: DetailedMetadata;
  appleMusicResult: {
    appleMusicUrl: string;
    metadata: DetailedMetadata;
  };
  confidence: number;
}

export type ConversionResponse = ConversionResponseAppleToSpotify | ConversionResponseSpotifyToApple;

export interface ApiError {
  error: string;
  details?: string;
} 