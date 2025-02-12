import { DetailedMetadata } from './metadataExtraction';
import { searchAppleMusicContent as searchAppleMusic } from './appleMusicApi';
import axios from 'axios';

/**
 * Represents the metadata that can be extracted from an Apple Music link.
 */
export interface AppleMusicMetadata {
  type: 'track' | 'album' | 'artist';
  id: string;
  region: string;
  path: string[];
}

/**
 * Represents the metadata that can be extracted from a Spotify link.
 */
export interface SpotifyMetadata {
  type: 'track' | 'album' | 'artist';
  id: string;
}

/**
 * Converts an Apple Music link to structured metadata.
 * 
 * Example links:
 * - Track: https://music.apple.com/us/album/song-name/1234567890?i=1234567890
 * - Album: https://music.apple.com/us/album/album-name/1234567890
 * - Artist: https://music.apple.com/us/artist/artist-name/1234567890
 * 
 * @param appleMusicLink - The original Apple Music link.
 * @returns The extracted metadata from the link.
 */
export function parseAppleMusicLink(appleMusicLink: string): AppleMusicMetadata {
  if (!appleMusicLink.includes("music.apple.com")) {
    throw new Error("Invalid Apple Music link");
  }

  try {
    const url = new URL(appleMusicLink);
    const pathParts = url.pathname.split('/').filter(part => part.length > 0);
    
    // Extract region (e.g., 'us', 'uk', etc.)
    const region = pathParts[0];
    
    // Determine the type and extract relevant information
    const type = pathParts[1] as 'track' | 'album' | 'artist';
    const id = pathParts[pathParts.length - 1];
    
    // For tracks, we might have an 'i' parameter in the query string
    const trackId = url.searchParams.get('i');
    if (trackId) {
      return {
        type: 'track',
        id: trackId,
        region,
        path: pathParts
      };
    }
    
    return {
      type,
      id,
      region,
      path: pathParts
    };
  } catch (error) {
    throw new Error(`Failed to parse Apple Music link: ${error}`);
  }
}

/**
 * Parses a Spotify link to extract structured metadata.
 * 
 * Example links:
 * - Track: https://open.spotify.com/track/1234567890
 * - Album: https://open.spotify.com/album/1234567890
 * - Artist: https://open.spotify.com/artist/1234567890
 * 
 * @param spotifyLink - The original Spotify link.
 * @returns The extracted metadata from the link.
 */
export function parseSpotifyLink(spotifyLink: string): SpotifyMetadata {
  if (!spotifyLink.includes("open.spotify.com")) {
    throw new Error("Invalid Spotify link");
  }

  try {
    const url = new URL(spotifyLink);
    const pathParts = url.pathname.split('/').filter(part => part.length > 0);
    const type = pathParts[0] as 'track' | 'album' | 'artist';
    const id = pathParts[1];
    
    return { type, id };
  } catch (error) {
    throw new Error(`Failed to parse Spotify link: ${error}`);
  }
}

/**
 * Converts an Apple Music link to a Spotify link by extracting metadata
 * and searching for the corresponding content on Spotify.
 * 
 * @param appleMusicLink - The original Apple Music link.
 * @returns The extracted metadata that can be used for Spotify search.
 */
export function convertAppleMusicLinkToSpotify(appleMusicLink: string): AppleMusicMetadata {
  return parseAppleMusicLink(appleMusicLink);
}

/**
 * Converts a Spotify link to Apple Music metadata format.
 * 
 * @param spotifyLink - The original Spotify link.
 * @returns The converted metadata in Apple Music format.
 */
export function convertSpotifyLinkToAppleMusic(spotifyLink: string): AppleMusicMetadata {
  const { type, id } = parseSpotifyLink(spotifyLink);
  // Dummy conversion – in a real implementation this would map
  // the Spotify ID to an Apple Music ID via API calls
  return {
    type,
    id,
    region: "us",
    path: ["us", type, id]
  };
}

/**
 * Gets detailed metadata from Spotify for a given track/album/artist.
 * 
 * @param spotifyData - The parsed Spotify metadata.
 * @returns Detailed metadata about the content.
 */
export async function getSpotifyDetailedMetadata(spotifyData: SpotifyMetadata): Promise<DetailedMetadata> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Spotify API credentials missing');
  }

  // Get access token
  const tokenResponse = await axios.post('https://accounts.spotify.com/api/token',
    new URLSearchParams({
      grant_type: 'client_credentials'
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      }
    }
  );

  const accessToken = tokenResponse.data.access_token;

  // Get item details
  const response = await axios.get(
    `https://api.spotify.com/v1/${spotifyData.type}s/${spotifyData.id}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );

  const item = response.data;

  // Map the response to our metadata format
  const metadata: DetailedMetadata = {
    type: spotifyData.type,
    title: item.name,
    artist: spotifyData.type === 'artist' 
      ? item.name 
      : item.artists?.map((a: any) => a.name).join(', '),
    album: spotifyData.type === 'track' ? item.album?.name : undefined,
    artworkUrl: item.images?.[0]?.url,
    releaseDate: item.release_date,
    genres: item.genres,
    trackNumber: item.track_number,
    totalTracks: item.album?.total_tracks,
    discNumber: item.disc_number,
    duration: item.duration_ms,
    isrc: item.external_ids?.isrc,
    previewUrl: item.preview_url,
    popularity: item.popularity
  };

  return metadata;
}

/**
 * Searches Apple Music content using the provided metadata.
 * 
 * @param metadata - The detailed metadata to search with.
 * @returns Matching Apple Music content with URL and metadata.
 */
export async function searchAppleMusicContent(metadata: DetailedMetadata): Promise<{ appleMusicUrl: string, metadata: DetailedMetadata }> {
  return searchAppleMusic(metadata);
} 