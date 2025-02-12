import axios from 'axios';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { DetailedMetadata } from './metadataExtraction';

// Initialize the Secret Manager client
const secretManagerClient = new SecretManagerServiceClient();

interface SpotifySearchResult {
  spotifyUrl: string;
  metadata: DetailedMetadata;
}

/**
 * Cleans title and artist names for better matching
 */
function cleanText(text: string): string {
  return text
    // Remove special characters and normalize spaces
    .replace(/[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\-.\/:;<=>?@\[\]^_`{|}~]/g, ' ')
    // Handle various types of quotes
    .replace(/[''""]/g, '')
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    // Convert to lowercase
    .toLowerCase()
    .trim();
}

/**
 * Removes common featuring variations and parenthetical content
 */
function removeFeaturingArtists(text: string): string {
  return text
    // Remove (feat. Artist)
    .replace(/[\(\[\{](?:feat|ft|featuring|with)\.?\s+[^\)\]\}]+[\)\]\}]/gi, '')
    // Remove feat. Artist without parentheses
    .replace(/(?:feat|ft|featuring|with)\.?\s+[^([\n]+/gi, '')
    // Remove any remaining parentheses content
    .replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g, '')
    .trim();
}

/**
 * Normalizes artist names by handling various edge cases
 */
function normalizeArtistName(artist: string): string {
  return artist
    // Split multiple artists
    .split(/[,&]/)
    // Clean each artist name
    .map(name => cleanText(removeFeaturingArtists(name)))
    // Remove empty entries
    .filter(Boolean)
    // Sort to ensure consistent ordering
    .sort()
    .join(' ');
}

/**
 * Strips version information from album/track titles
 * This helps match different versions of the same content
 */
function stripVersionInfo(title: string): string {
  return title
    // Remove remaster/remix/version indicators
    .replace(/\([^)]*(?:remaster|remix|version|edit|deluxe|anniversary|super|edition)[^)]*\)/gi, '')
    .replace(/\[[^]]*(?:remaster|remix|version|edit|deluxe|anniversary|super|edition)[^]]*\]/gi, '')
    // Remove years
    .replace(/[\(\[]\s*\d{4}\s*[\)\]]/g, '')
    .trim();
}

/**
 * Generates multiple search queries with different variations
 */
function generateSearchQueries(metadata: DetailedMetadata): string[] {
  const queries: string[] = [];
  
  // For artists, use simpler search queries
  if (metadata.type === 'artist') {
    const artist = cleanText(metadata.artist);
    queries.push(`artist:"${artist}"`);
    queries.push(artist); // Fallback to simple search
    return queries;
  }

  const title = cleanText(metadata.title);
  const cleanTitle = removeFeaturingArtists(title);
  const artist = normalizeArtistName(metadata.artist);
  const strippedTitle = stripVersionInfo(cleanTitle);

  // Add queries in order of most specific to least specific
  if (metadata.isrc) {
    queries.push(`isrc:${metadata.isrc}`);
  }

  // Try with full version info first
  queries.push(`track:"${title}" artist:"${artist}"`);
  
  // Try with cleaned title (no featuring)
  if (cleanTitle !== title) {
    queries.push(`track:"${cleanTitle}" artist:"${artist}"`);
  }

  // Try with stripped version info
  if (strippedTitle !== cleanTitle) {
    queries.push(`track:"${strippedTitle}" artist:"${artist}"`);
  }

  // Try with album if available
  if (metadata.album) {
    const cleanAlbum = cleanText(metadata.album);
    const strippedAlbum = stripVersionInfo(cleanAlbum);
    
    // Try with full album name
    queries.push(`track:"${cleanTitle}" album:"${cleanAlbum}"`);
    
    // Try with stripped album name
    if (strippedAlbum !== cleanAlbum) {
      queries.push(`track:"${strippedTitle}" album:"${strippedAlbum}"`);
    }
  }

  // Try just the main title and artist (more permissive)
  queries.push(`${strippedTitle} ${artist}`);

  // Handle Bon Iver style titles with numbers and symbols
  const numericTitle = title.replace(/[^\w\s]/g, '')
    .replace(/(\d+)/g, (match) => {
      const num = parseInt(match);
      if (num <= 20) {
        const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
                      'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
        return words[num];
      }
      return match;
    });
  
  if (numericTitle !== title) {
    queries.push(`track:"${numericTitle}" artist:"${artist}"`);
  }

  return queries;
}

/**
 * Retrieves the Spotify API access token using the Client Credentials Flow.
 * For development, credentials are obtained from environment variables.
 * For production, secrets should be retrieved from Google Cloud Secret Manager.
 */
async function getSpotifyAccessToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID || await getSecret('spotify-client-id');
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || await getSecret('spotify-client-secret');

  if (!clientId || !clientSecret) {
    throw new Error('Spotify API credentials missing');
  }

  const tokenUrl = 'https://accounts.spotify.com/api/token';
  const data = new URLSearchParams();
  data.append('grant_type', 'client_credentials');

  const response = await axios.post(tokenUrl, data.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    }
  });

  return response.data.access_token;
}

/**
 * Retrieves secrets from Google Cloud Secret Manager in production,
 * or returns undefined to fallback to environment variables in development.
 *
 * @param secretName Name of the secret to retrieve (spotify-client-id or spotify-client-secret)
 * @returns The secret value or undefined if in development
 */
async function getSecret(secretName: string): Promise<string | undefined> {
  // In development, return undefined to use environment variables
  if (process.env.NODE_ENV !== 'production') {
    return undefined;
  }

  try {
    // Get the project ID from the environment or compute metadata
    const projectId = process.env.NODE_ENV === 'production' ? 'convert-jakoblangtry-com' : process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT is not set');
    }

    // Access the secret version
    const [version] = await secretManagerClient.accessSecretVersion({
      name: `projects/${projectId}/secrets/${secretName}/versions/latest`,
    });

    // Extract the secret payload
    const secretValue = version.payload?.data?.toString();
    if (!secretValue) {
      throw new Error(`Secret ${secretName} not found or empty`);
    }

    return secretValue;
  } catch (error) {
    console.error(`Error retrieving secret ${secretName}:`, error);
    throw new Error(`Failed to retrieve secret ${secretName}`);
  }
}

/**
 * Checks if an artist name appears to be a tribute/cover band
 */
function isTributeBand(artistName: string, originalArtist: string): boolean {
  const lowerArtist = artistName.toLowerCase();
  const lowerOriginal = originalArtist.toLowerCase();
  
  // Skip check if it's the exact original artist
  if (lowerArtist === lowerOriginal) return false;
  
  const tributeIndicators = [
    'tribute', 'covers', 'performs', 'plays', 'karaoke',
    'in the style of', 'ukulele', 'instrumental', 'orchestra',
    'string quartet', 'lullaby', 'piano version', 'jazz version'
  ];
  
  // Check if artist name contains the original artist name AND any tribute indicators
  return (lowerArtist.includes(lowerOriginal) || 
          tributeIndicators.some(indicator => lowerArtist.includes(indicator)));
}

/**
 * Searches for content on Spotify using multiple search strategies
 */
export async function searchSpotifyContent(
  sourceMetadata: DetailedMetadata
): Promise<SpotifySearchResult> {
  const accessToken = await getSpotifyAccessToken();
  const queries = generateSearchQueries(sourceMetadata);
  let lastError: Error | null = null;

  // Try each query in order until we find a match
  for (const searchQuery of queries) {
    try {
      console.log('Trying Spotify search query:', searchQuery);
      
      const response = await axios.get('https://api.spotify.com/v1/search', {
        params: { 
          q: searchQuery,
          type: sourceMetadata.type,
          limit: 10,  // Get more results to find best match
          market: 'US'
        },
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      const items = response.data[`${sourceMetadata.type}s`].items;
      if (items.length === 0) continue;

      // Find the best matching result
      const bestMatch = findBestMatch(items, sourceMetadata);
      if (bestMatch) {
        return mapSpotifyResponse(bestMatch, sourceMetadata);
      }
    } catch (error: any) {
      console.error('Spotify search error:', error.message);
      lastError = error;
    }
  }

  throw lastError || new Error(`No ${sourceMetadata.type} found on Spotify`);
}

/**
 * Finds the best matching result from Spotify search results
 */
function findBestMatch(items: any[], sourceMetadata: DetailedMetadata): any {
  // For ISRC searches, return the first result (exact match)
  if (sourceMetadata.isrc) {
    return items[0];
  }

  // Score each result and find the best match
  const scored = items.map(item => {
    const score = calculateMatchScore(item, sourceMetadata);
    const popularity = item.popularity || 0;
    
    // Check if this is by the original artist
    const isOriginalArtist = item.artists?.some((a: any) => 
      cleanText(a.name) === cleanText(sourceMetadata.artist)
    );
    
    return {
      item,
      score,
      // Boost original artist versions significantly
      finalScore: score * (isOriginalArtist ? 2.0 : 1.0) * (1 + (popularity / 1000))
    };
  });

  // Sort by final score descending
  scored.sort((a, b) => b.finalScore - a.finalScore);
  
  // If we have a very good match (>0.8), use it
  if (scored[0].score > 0.8) {
    return scored[0].item;
  }
  
  // If we have multiple decent matches (>0.5), prefer original artist versions
  const decentMatches = scored.filter(s => s.score > 0.5);
  if (decentMatches.length > 0) {
    // First try to find a decent match by the original artist
    const originalArtistMatch = decentMatches.find(s => 
      s.item.artists?.some((a: any) => 
        cleanText(a.name) === cleanText(sourceMetadata.artist)
      )
    );
    
    if (originalArtistMatch) {
      return originalArtistMatch.item;
    }
    
    // If no original artist match, sort by popularity
    decentMatches.sort((a, b) => (b.item.popularity || 0) - (a.item.popularity || 0));
    return decentMatches[0].item;
  }
  
  // Fall back to the highest scoring result if it meets minimum threshold
  return scored[0].score > 0.3 ? scored[0].item : null;
}

/**
 * Calculates a match score between a Spotify result and source metadata
 */
function calculateMatchScore(spotifyItem: any, sourceMetadata: DetailedMetadata): number {
  let score = 0;

  // Handle artist searches differently
  if (sourceMetadata.type === 'artist') {
    const spotifyName = cleanText(spotifyItem.name);
    const sourceName = cleanText(sourceMetadata.artist);

    // Exact match
    if (spotifyName === sourceName) {
      score += 1.0;
    } 
    // Partial match
    else if (spotifyName.includes(sourceName) || sourceName.includes(spotifyName)) {
      score += 0.7;
    }
    
    // Bonus for matching genres
    if (spotifyItem.genres && sourceMetadata.genres) {
      const commonGenres = spotifyItem.genres.filter((g: string) => 
        sourceMetadata.genres?.includes(g)
      );
      if (commonGenres.length > 0) {
        score += 0.2;
      }
    }

    // Heavily penalize tribute/cover artists
    if (isTributeBand(spotifyName, sourceName)) {
      score *= 0.1;  // 90% penalty
    }

    return score;
  }

  // For tracks and albums
  const spotifyTitle = cleanText(spotifyItem.name);
  const sourceTitle = cleanText(sourceMetadata.title);
  const spotifyArtist = normalizeArtistName(
    spotifyItem.artists?.map((a: any) => a.name).join(' ') || ''
  );
  const sourceArtist = normalizeArtistName(sourceMetadata.artist);

  // Title match (40%)
  if (spotifyTitle === sourceTitle) {
    score += 0.4;
  } else if (removeFeaturingArtists(spotifyTitle) === removeFeaturingArtists(sourceTitle)) {
    score += 0.3;
  } else if (spotifyTitle.includes(sourceTitle) || sourceTitle.includes(spotifyTitle)) {
    score += 0.2;
  }

  // Artist match (40%) - increased importance
  if (spotifyArtist === sourceArtist) {
    score += 0.4;
  } else if (spotifyArtist.includes(sourceArtist) || sourceArtist.includes(spotifyArtist)) {
    score += 0.2;
  }

  // Heavily penalize tribute/cover bands
  if (spotifyItem.artists?.some((a: any) => isTributeBand(a.name, sourceMetadata.artist))) {
    score *= 0.1;  // 90% penalty
  }

  // Duration match (10%) - if within 2 seconds
  if (sourceMetadata.duration && Math.abs(spotifyItem.duration_ms - sourceMetadata.duration) < 2000) {
    score += 0.1;
  }

  // Album match (10%)
  if (sourceMetadata.album && spotifyItem.album) {
    const spotifyAlbum = cleanText(spotifyItem.album.name);
    const sourceAlbum = cleanText(sourceMetadata.album);
    if (spotifyAlbum === sourceAlbum) {
      score += 0.1;
    }
  }

  return score;
}

/**
 * Maps Spotify API response to our metadata format
 */
function mapSpotifyResponse(spotifyItem: any, sourceMetadata: DetailedMetadata): SpotifySearchResult {
  // Get the artwork URL based on content type
  let artworkUrl: string | undefined;
  if (sourceMetadata.type === 'artist') {
    artworkUrl = spotifyItem.images?.[0]?.url;
  } else if (sourceMetadata.type === 'track') {
    artworkUrl = spotifyItem.album?.images?.[0]?.url;
  } else {  // album
    artworkUrl = spotifyItem.images?.[0]?.url;
  }

  // Base metadata structure that's common for all types
  const baseMetadata = {
    type: sourceMetadata.type,
    title: spotifyItem.name,
    artworkUrl,
    genres: spotifyItem.genres,
    popularity: spotifyItem.popularity,
  };

  // Add type-specific metadata
  let metadata: DetailedMetadata;
  if (sourceMetadata.type === 'artist') {
    metadata = {
      ...baseMetadata,
      artist: spotifyItem.name,  // For artists, the name is the artist
    };
  } else {
    metadata = {
      ...baseMetadata,
      artist: spotifyItem.artists?.map((a: any) => a.name).join(', '),
      album: spotifyItem.album?.name,
      releaseDate: spotifyItem.album?.release_date || spotifyItem.release_date,
      trackNumber: spotifyItem.track_number,
      totalTracks: spotifyItem.album?.total_tracks,
      discNumber: spotifyItem.disc_number,
      duration: spotifyItem.duration_ms,
      previewUrl: spotifyItem.preview_url,
    };
  }

  return {
    spotifyUrl: spotifyItem.external_urls.spotify,
    metadata
  };
} 