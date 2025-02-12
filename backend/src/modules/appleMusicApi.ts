import axios from 'axios';
import jwt from 'jsonwebtoken';
import { DetailedMetadata } from './metadataExtraction';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// Initialize the Secret Manager client
const secretManagerClient = new SecretManagerServiceClient();

interface AppleMusicSearchResult {
  appleMusicUrl: string;
  metadata: DetailedMetadata;
}

interface AppleMusicTrack {
  attributes: {
    name: string;
    artistName: string;
    albumName: string;
    artwork?: {
      url?: string;
    };
    releaseDate?: string;
    genreNames?: string[];
    trackNumber?: number;
    trackCount?: number;
    discNumber?: number;
    durationInMillis?: number;
    isrc?: string;
    previews?: Array<{ url: string }>;
    url: string;
  };
}

/**
 * Retrieves secrets from Google Cloud Secret Manager in production,
 * or returns undefined to fallback to environment variables in development.
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
 * Generates a developer token for Apple Music API
 */
async function getAppleMusicToken(): Promise<string> {
  // Try to get credentials from Secret Manager first, fall back to environment variables
  const teamId = await getSecret('apple-team-id') || process.env.APPLE_TEAM_ID;
  const keyId = await getSecret('apple-key-id') || process.env.APPLE_KEY_ID;
  let privateKey = await getSecret('apple-private-key') || process.env.APPLE_PRIVATE_KEY;

  if (!teamId || !keyId || !privateKey) {
    throw new Error('Apple Music API credentials missing');
  }

  // Handle both escaped and unescaped newlines
  privateKey = privateKey.includes('\\n') 
    ? privateKey.replace(/\\n/g, '\n')
    : privateKey;

  const token = jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    expiresIn: '24h',
    issuer: teamId,
    header: {
      alg: 'ES256',
      kid: keyId
    }
  });

  return token;
}

/**
 * Cleans and normalizes text for better matching
 */
function cleanText(text: string): string {
  return text
    .replace(/[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\-.\/:;<=>?@\[\]^_`{|}~]/g, ' ')
    .replace(/[''""]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/**
 * Removes featuring artists and parenthetical content
 */
function removeFeaturingArtists(text: string): string {
  return text
    .replace(/[\(\[\{](?:feat|ft|featuring|with)\.?\s+[^\)\]\}]+[\)\]\}]/gi, '')
    .replace(/(?:feat|ft|featuring|with)\.?\s+[^([\n]+/gi, '')
    .replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g, '')
    .trim();
}

/**
 * Generates multiple search queries with different variations
 */
function generateSearchQueries(metadata: DetailedMetadata): string[] {
  const queries: string[] = [];
  const title = cleanText(metadata.title);
  const cleanTitle = removeFeaturingArtists(title);
  const artist = cleanText(metadata.artist);

  // Try with full title and artist
  queries.push(`${title} ${artist}`);
  
  // Try with cleaned title (no featuring)
  if (cleanTitle !== title) {
    queries.push(`${cleanTitle} ${artist}`);
  }

  // Try with album if available
  if (metadata.album) {
    const album = cleanText(metadata.album);
    queries.push(`${cleanTitle} ${artist} ${album}`);
  }

  return queries;
}

/**
 * Calculates match score between Apple Music result and source metadata
 */
function calculateMatchScore(result: AppleMusicTrack, sourceMetadata: DetailedMetadata): number {
  let score = 0;
  
  const resultTitle = cleanText(result.attributes.name);
  const sourceTitle = cleanText(sourceMetadata.title);
  const resultArtist = cleanText(result.attributes.artistName);
  const sourceArtist = cleanText(sourceMetadata.artist);

  // Title match (40%)
  if (resultTitle === sourceTitle) {
    score += 0.4;
  } else if (removeFeaturingArtists(resultTitle) === removeFeaturingArtists(sourceTitle)) {
    score += 0.3;
  } else if (resultTitle.includes(sourceTitle) || sourceTitle.includes(resultTitle)) {
    score += 0.2;
  }

  // Artist match (40%)
  if (resultArtist === sourceArtist) {
    score += 0.4;
  } else if (resultArtist.includes(sourceArtist) || sourceArtist.includes(resultArtist)) {
    score += 0.2;
  }

  // Album match (20%)
  if (sourceMetadata.album && result.attributes.albumName) {
    const resultAlbum = cleanText(result.attributes.albumName);
    const sourceAlbum = cleanText(sourceMetadata.album);
    if (resultAlbum === sourceAlbum) {
      score += 0.2;
    }
  }

  return score;
}

/**
 * Maps Apple Music API response to our metadata format
 */
function mapAppleMusicResponse(result: AppleMusicTrack): DetailedMetadata {
  return {
    type: 'track',
    title: result.attributes.name,
    artist: result.attributes.artistName,
    album: result.attributes.albumName,
    artworkUrl: result.attributes.artwork?.url?.replace('{w}x{h}', '600x600'),
    releaseDate: result.attributes.releaseDate,
    genres: result.attributes.genreNames,
    trackNumber: result.attributes.trackNumber,
    totalTracks: result.attributes.trackCount,
    discNumber: result.attributes.discNumber,
    duration: result.attributes.durationInMillis,
    isrc: result.attributes.isrc,
    previewUrl: result.attributes.previews?.[0]?.url
  };
}

/**
 * Searches for content on Apple Music using multiple search strategies
 */
export async function searchAppleMusicContent(
  sourceMetadata: DetailedMetadata
): Promise<AppleMusicSearchResult> {
  const token = await getAppleMusicToken();
  const queries = generateSearchQueries(sourceMetadata);
  let lastError: Error | null = null;

  // Try each query in order until we find a match
  for (const searchQuery of queries) {
    try {
      console.log('Trying Apple Music search query:', searchQuery);
      
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`
      };

      // Only add Music-User-Token if it exists
      const userToken = process.env.APPLE_MUSIC_USER_TOKEN;
      if (userToken) {
        headers['Music-User-Token'] = userToken;
      }
      
      const response = await axios.get(
        'https://api.music.apple.com/v1/catalog/us/search', {
          params: {
            term: searchQuery,
            types: 'songs',
            limit: 25
          },
          headers
        }
      );

      const results = response.data.results.songs.data as AppleMusicTrack[];
      if (!results || results.length === 0) continue;

      // Score each result
      const scored = results.map(result => ({
        result,
        score: calculateMatchScore(result, sourceMetadata)
      }));

      // Sort by score descending
      scored.sort((a, b) => b.score - a.score);

      // If we have a good match, use it
      if (scored[0].score > 0.7) {
        const bestMatch = scored[0].result;
        return {
          appleMusicUrl: bestMatch.attributes.url,
          metadata: mapAppleMusicResponse(bestMatch)
        };
      }
    } catch (error: any) {
      console.error('Apple Music search error:', error.message);
      lastError = error;
    }
  }

  throw lastError || new Error('No matching track found on Apple Music');
} 