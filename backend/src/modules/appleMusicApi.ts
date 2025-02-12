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
  type: 'songs' | 'albums' | 'artists';
  attributes: {
    name: string;
    artistName: string;
    albumName?: string;
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

interface ScoredResult {
  result: AppleMusicTrack;
  score: number;
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
    .replace(/[\u2000-\u206F\u2E7F\\'!"#$%&()*+,\-.\/:;<=>?@\[\]^_`{|}~]/g, ' ')
    .replace(/[''""]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s*,\s*/g, ' and ')
    .toLowerCase()
    .trim();
}

/**
 * Normalizes titles for comparison by handling common variations
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[''""]/g, '')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g, '') // Remove parenthetical content
    .replace(/[^\w\s]/g, ' ')  // Replace any remaining punctuation with spaces
    .replace(/\s+/g, ' ')      // Normalize spaces
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
  
  // Handle artist variations
  const artist = cleanText(metadata.artist);
  const artistVariations = [
    artist,
    artist.replace(/ and /g, ' & '),
    artist.replace(/ and /g, ', '),
    artist.split(/ and |, /).join(' ')
  ];

  // Handle different content types
  switch (metadata.type) {
    case 'track':
      // Try exact match with quotes for each artist variation
      artistVariations.forEach(artistVar => {
        queries.push(`"${title}" "${artistVar}"`);
      });
      
      // Try without quotes for each artist variation
      artistVariations.forEach(artistVar => {
        queries.push(`${title} ${artistVar}`);
      });
      
      // Try with cleaned title (no featuring)
      if (cleanTitle !== title) {
        artistVariations.forEach(artistVar => {
          queries.push(`${cleanTitle} ${artistVar}`);
        });
      }

      // Try with album if available
      if (metadata.album) {
        const album = cleanText(metadata.album);
        queries.push(`${cleanTitle} ${artist} ${album}`);
      }

      // Try with ISRC if available
      if (metadata.isrc) {
        queries.push(metadata.isrc);
      }

      // Try with individual artist names for collaborations
      const individualArtists = artist.split(/ and |, /);
      if (individualArtists.length > 1) {
        queries.push(`${title} ${individualArtists[0]}`);
      }
      break;

    case 'album':
      // Similar variations for albums
      artistVariations.forEach(artistVar => {
        queries.push(`"${title}" "${artistVar}"`);
        queries.push(`${title} ${artistVar}`);
      });
      break;

    case 'artist':
      // For artists, try all name variations
      artistVariations.forEach(artistVar => {
        queries.push(`"${artistVar}"`);
        queries.push(artistVar);
      });
      break;
  }

  return [...new Set(queries)]; // Remove duplicates
}

/**
 * Calculates match score between Apple Music result and source metadata
 */
function calculateMatchScore(result: AppleMusicTrack, sourceMetadata: DetailedMetadata): number {
  let score = 0;
  let matchDetails: Record<string, number> = {};

  // Handle different content types
  switch (sourceMetadata.type) {
    case 'track':
      const resultTitle = normalizeTitle(result.attributes.name);
      const sourceTitle = normalizeTitle(sourceMetadata.title);
      const resultArtist = cleanText(result.attributes.artistName);
      const sourceArtist = cleanText(sourceMetadata.artist);

      console.log('Normalized titles for comparison:', {
        resultTitle,
        sourceTitle,
        resultArtist,
        sourceArtist
      });

      // Title match (40%)
      if (resultTitle === sourceTitle) {
        score += 0.4;
        matchDetails.exactTitleMatch = 0.4;
      } else if (removeFeaturingArtists(resultTitle) === removeFeaturingArtists(sourceTitle)) {
        score += 0.4; // Increased from 0.3 since this is effectively an exact match
        matchDetails.cleanedTitleMatch = 0.4;
      } else if (resultTitle.includes(sourceTitle) || sourceTitle.includes(resultTitle)) {
        score += 0.2;
        matchDetails.partialTitleMatch = 0.2;
      }

      // Artist match (40%)
      if (resultArtist === sourceArtist) {
        score += 0.4;
        matchDetails.exactArtistMatch = 0.4;
      } else {
        // Check different artist name formats
        const resultArtistVariations = [
          resultArtist,
          resultArtist.replace(/ and /g, ' & '),
          resultArtist.replace(/ and /g, ', '),
          resultArtist.split(/ and |, /).join(' ')
        ];
        const sourceArtistVariations = [
          sourceArtist,
          sourceArtist.replace(/ and /g, ' & '),
          sourceArtist.replace(/ and /g, ', '),
          sourceArtist.split(/ and |, /).join(' ')
        ];

        if (resultArtistVariations.some(v1 => 
            sourceArtistVariations.some(v2 => v1 === v2))) {
          score += 0.4;
          matchDetails.artistVariationMatch = 0.4;
        } else if (resultArtistVariations.some(v1 => 
            sourceArtistVariations.some(v2 => 
              v1.includes(v2) || v2.includes(v1)))) {
          score += 0.2;
          matchDetails.partialArtistMatch = 0.2;
        }
      }

      // Album match (10%)
      if (sourceMetadata.album && result.attributes.albumName) {
        const resultAlbum = cleanText(result.attributes.albumName);
        const sourceAlbum = cleanText(sourceMetadata.album);
        if (resultAlbum === sourceAlbum) {
          score += 0.1;
          matchDetails.albumMatch = 0.1;
        }
      }

      // ISRC match (10% bonus)
      if (sourceMetadata.isrc && result.attributes.isrc === sourceMetadata.isrc) {
        score += 0.1;
        matchDetails.isrcMatch = 0.1;
      }

      console.log('Match details:', {
        resultTitle,
        sourceTitle,
        resultArtist,
        sourceArtist,
        matchDetails,
        totalScore: score
      });
      break;

    case 'album':
      const albumTitle = cleanText(result.attributes.name);
      const sourceAlbumTitle = cleanText(sourceMetadata.title);
      const albumArtist = cleanText(result.attributes.artistName);
      const sourceAlbumArtist = cleanText(sourceMetadata.artist);

      // Title match (50%)
      if (albumTitle === sourceAlbumTitle) {
        score += 0.5;
      } else if (removeFeaturingArtists(albumTitle) === removeFeaturingArtists(sourceAlbumTitle)) {
        score += 0.4;
      } else if (albumTitle.includes(sourceAlbumTitle) || sourceAlbumTitle.includes(albumTitle)) {
        score += 0.3;
      }

      // Artist match (50%)
      if (albumArtist === sourceAlbumArtist) {
        score += 0.5;
      } else if (albumArtist.includes(sourceAlbumArtist) || sourceAlbumArtist.includes(albumArtist)) {
        score += 0.3;
      }
      break;

    case 'artist':
      const artistName = cleanText(result.attributes.name);
      const sourceArtistName = cleanText(sourceMetadata.artist);

      // Name match (80%)
      if (artistName === sourceArtistName) {
        score += 0.8;
      } else if (artistName.includes(sourceArtistName) || sourceArtistName.includes(artistName)) {
        score += 0.4;
      }

      // Genre match (20%)
      if (result.attributes.genreNames && sourceMetadata.genres) {
        const commonGenres = result.attributes.genreNames.filter((genre: string) =>
          sourceMetadata.genres?.includes(genre)
        );
        if (commonGenres.length > 0) {
          score += 0.2 * (commonGenres.length / Math.max(result.attributes.genreNames.length, sourceMetadata.genres.length));
        }
      }
      break;
  }

  return score;
}

/**
 * Maps Apple Music API response to our metadata format
 */
function mapAppleMusicResponse(result: AppleMusicTrack): DetailedMetadata {
  const baseMetadata = {
    type: result.type === 'songs' ? 'track' as const : 
          result.type === 'albums' ? 'album' as const : 
          'artist' as const,
    title: result.attributes.name,
    artist: result.attributes.artistName,
    artworkUrl: result.attributes.artwork?.url?.replace('{w}x{h}', '600x600'),
    genres: result.attributes.genreNames
  };

  switch (baseMetadata.type) {
    case 'track':
      return {
        ...baseMetadata,
        album: result.attributes.albumName,
        releaseDate: result.attributes.releaseDate,
        trackNumber: result.attributes.trackNumber,
        totalTracks: result.attributes.trackCount,
        discNumber: result.attributes.discNumber,
        duration: result.attributes.durationInMillis,
        isrc: result.attributes.isrc,
        previewUrl: result.attributes.previews?.[0]?.url
      };

    case 'album':
      return {
        ...baseMetadata,
        releaseDate: result.attributes.releaseDate,
        totalTracks: result.attributes.trackCount
      };

    case 'artist':
      return baseMetadata;

    default:
      throw new Error(`Unsupported content type: ${result.type}`);
  }
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
  let bestMatchSoFar: { result: AppleMusicTrack; score: number } | null = null;

  // Determine the content type to search for
  const types = sourceMetadata.type === 'track' ? 'songs' :
                sourceMetadata.type === 'album' ? 'albums' :
                'artists';

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
            types,
            limit: 25
          },
          headers
        }
      );

      console.log('Apple Music API Response:', JSON.stringify(response.data, null, 2));

      const results = response.data.results[types === 'songs' ? 'songs' : types === 'albums' ? 'albums' : 'artists']?.data;
      if (!results || results.length === 0) {
        console.log('No results found for query:', searchQuery);
        continue;
      }

      console.log(`Found ${results.length} results for query:`, searchQuery);

      // Score each result
      const scored: ScoredResult[] = results.map((result: AppleMusicTrack) => {
        const score = calculateMatchScore(result, sourceMetadata);
        console.log('Score for result:', {
          title: result.attributes.name,
          artist: result.attributes.artistName,
          score
        });
        return { result, score };
      });

      // Sort by score descending
      scored.sort((a: ScoredResult, b: ScoredResult) => b.score - a.score);

      // Update best match if we found a better one
      if (scored.length > 0 && (!bestMatchSoFar || scored[0].score > bestMatchSoFar.score)) {
        bestMatchSoFar = scored[0];
        console.log('New best match:', {
          title: scored[0].result.attributes.name,
          artist: scored[0].result.attributes.artistName,
          score: scored[0].score
        });
      }

      // If we have a very good match, use it immediately
      if (scored[0].score > 0.8) {
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

  // If we found a reasonable match overall, use it
  if (bestMatchSoFar && bestMatchSoFar.score > 0.6) {
    console.log('Using best match found:', {
      title: bestMatchSoFar.result.attributes.name,
      artist: bestMatchSoFar.result.attributes.artistName,
      score: bestMatchSoFar.score
    });
    return {
      appleMusicUrl: bestMatchSoFar.result.attributes.url,
      metadata: mapAppleMusicResponse(bestMatchSoFar.result)
    };
  }

  throw lastError || new Error(`No matching ${sourceMetadata.type} found on Apple Music`);
} 