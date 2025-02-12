export interface DetailedMetadata {
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  type: 'track' | 'album' | 'artist';
  releaseDate?: string;
  genres?: string[];
  trackNumber?: number;
  totalTracks?: number;
  discNumber?: number;
  totalDiscs?: number;
  isrc?: string;
  duration?: number;
  popularity?: number;
  previewUrl?: string;
}

export interface ConversionResponse {
  appleMusicMetadata: DetailedMetadata;
  spotifyResult: {
    spotifyUrl: string;
    metadata: DetailedMetadata;
  };
  confidence: number;
}

export interface ApiError {
  error: string;
  details?: string;
} 