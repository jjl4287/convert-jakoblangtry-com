import axios from 'axios';
import { AppleMusicMetadata } from './linkConversion';

/**
 * Represents the detailed metadata associated with a music item.
 */
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

/**
 * Safely gets artwork URL from iTunes API result and converts to high resolution
 */
function getArtworkUrl(result: any): string | undefined {
  // Try different artwork URL fields in order of preference
  const artworkUrl = 
    result.artworkUrl100 || 
    result.artworkUrl60 || 
    result.artworkUrl30;

  if (!artworkUrl) return undefined;

  // Convert to high resolution by replacing dimensions
  // iTunes artwork URLs are like: .../100x100bb.jpg
  return artworkUrl.replace(/\d+x\d+bb/, '600x600bb');
}

/**
 * Extracts metadata from an Apple Music link using their public metadata API.
 * This API doesn't require authentication for basic metadata.
 * 
 * @param appleMusicMetadata - The parsed Apple Music metadata
 * @returns A Promise that resolves to a DetailedMetadata object.
 */
export async function extractMetadata(appleMusicMetadata: AppleMusicMetadata): Promise<DetailedMetadata> {
  const { type, id, region } = appleMusicMetadata;
  
  try {
    // For tracks, we need to use the track ID (i parameter) instead of the album ID
    const searchId = type === 'track' ? id : id;
    
    const response = await axios.get(
      `https://itunes.apple.com/lookup`, {
        params: {
          id: searchId,
          entity: 'song',
          country: region,
          limit: 1
        }
      }
    );

    if (!response.data.results || response.data.results.length === 0) {
      throw new Error('No metadata found for the provided Apple Music link');
    }

    const result = response.data.results[0];
    
    // Map the iTunes API response to our metadata format
    const metadata: DetailedMetadata = {
      type,
      title: result.trackName || result.collectionName || result.artistName,
      artist: result.artistName,
      album: result.collectionName,
      artworkUrl: getArtworkUrl(result),
      releaseDate: result.releaseDate,
      genres: result.primaryGenreName ? [result.primaryGenreName] : undefined,
      trackNumber: result.trackNumber,
      totalTracks: result.trackCount,
      discNumber: result.discNumber,
      totalDiscs: result.discCount,
      isrc: result.isrc,
      duration: result.trackTimeMillis,
      previewUrl: result.previewUrl,
      popularity: 0 // Apple Music doesn't provide popularity metrics in the public API
    };

    // Log the response and metadata for debugging
    console.log('iTunes API Response:', JSON.stringify(result, null, 2));
    console.log('Extracted Metadata:', JSON.stringify(metadata, null, 2));

    return metadata;
  } catch (error: any) {
    // Enhanced error logging
    console.error('Error fetching Apple Music metadata:', {
      error: error.message,
      response: error.response?.data,
      status: error.response?.status,
      metadata: appleMusicMetadata
    });
    throw new Error(`Failed to fetch metadata from Apple Music: ${error.message}`);
  }
} 