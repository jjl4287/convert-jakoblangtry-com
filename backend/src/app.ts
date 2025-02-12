import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { 
  convertAppleMusicLinkToSpotify, 
  convertSpotifyLinkToAppleMusic,
  getSpotifyDetailedMetadata,
  searchAppleMusicContent
} from './modules/linkConversion';
import { extractMetadata, DetailedMetadata } from './modules/metadataExtraction';
import { searchSpotifyContent } from './modules/spotifyApi';
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());  // Enable CORS for frontend requests
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.send('Backend is running');
});

interface ConversionResponseAppleToSpotify {
  conversionDirection: "apple-to-spotify";
  appleMusicMetadata: DetailedMetadata;
  spotifyResult: {
    spotifyUrl: string;
    metadata: DetailedMetadata;
  };
  confidence: number;
}

interface ConversionResponseSpotifyToApple {
  conversionDirection: "spotify-to-apple";
  spotifyMetadata: DetailedMetadata;
  appleMusicResult: {
    appleMusicUrl: string;
    metadata: DetailedMetadata;
  };
  confidence: number;
}

type ConversionResponse = ConversionResponseAppleToSpotify | ConversionResponseSpotifyToApple;

// GET /convert?link=<link>
// This endpoint converts between Apple Music and Spotify links by:
// 1. Detecting the link type
// 2. Parsing the link to extract structured metadata
// 3. Using the appropriate API to get detailed information
// 4. Searching the target platform for matching content
app.get('/convert', async (req: Request, res: Response) => {
  try {
    const link = req.query.link;
    if (!link || typeof link !== 'string') {
      return res.status(400).json({ 
        error: 'link query parameter is required and must be a string' 
      });
    }

    if (link.includes("music.apple.com")) {
      // Apple Music → Spotify flow
      const parsedMetadata = convertAppleMusicLinkToSpotify(link);
      const appleMusicMetadata = await extractMetadata(parsedMetadata);
      const spotifyResult = await searchSpotifyContent(appleMusicMetadata);
      const confidence = calculateMatchConfidence(appleMusicMetadata, spotifyResult.metadata);
      
      const response: ConversionResponseAppleToSpotify = {
        conversionDirection: "apple-to-spotify",
        appleMusicMetadata,
        spotifyResult,
        confidence
      };
      res.json(response);
    }
    else if (link.includes("open.spotify.com")) {
      // Spotify → Apple Music flow
      const parsedSpotify = convertSpotifyLinkToAppleMusic(link);
      const spotifyMetadata = await getSpotifyDetailedMetadata(parsedSpotify);
      const appleMusicResult = await searchAppleMusicContent(spotifyMetadata);
      const confidence = calculateMatchConfidence(spotifyMetadata, appleMusicResult.metadata);
      
      const response: ConversionResponseSpotifyToApple = {
        conversionDirection: "spotify-to-apple",
        spotifyMetadata,
        appleMusicResult,
        confidence
      };
      res.json(response);
    }
    else {
      res.status(400).json({ 
        error: "Unsupported link type. Please provide an Apple Music or Spotify link." 
      });
    }
  } catch (error: any) {
    console.error('Conversion error:', error);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Calculates a confidence score (0-100) for how well the source matches
 * the target content.
 */
function calculateMatchConfidence(
  source: DetailedMetadata, 
  match: DetailedMetadata
): number {
  let score = 0;
  let factors = 0;

  // Compare titles (weighted heavily)
  if (source.title && match.title) {
    const titleSimilarity = calculateStringSimilarity(source.title, match.title);
    score += titleSimilarity * 40;  // Title is worth 40% of the score
    factors += 40;
  }

  // Compare artists (weighted heavily)
  if (source.artist && match.artist) {
    const artistSimilarity = calculateStringSimilarity(source.artist, match.artist);
    score += artistSimilarity * 40;  // Artist is worth 40% of the score
    factors += 40;
  }

  // Compare albums if available (less weight)
  if (source.album && match.album) {
    const albumSimilarity = calculateStringSimilarity(source.album, match.album);
    score += albumSimilarity * 20;  // Album is worth 20% of the score
    factors += 20;
  }

  // If we have ISRC and they match, it's a perfect match
  if (source.isrc && match.isrc && source.isrc === match.isrc) {
    return 100;
  }

  // Normalize score based on available factors
  return factors > 0 ? Math.round((score / factors) * 100) : 0;
}

/**
 * Calculates string similarity using a simple case-insensitive comparison
 * Returns a value between 0 and 1
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  
  // Remove common featuring/feat./ft. variations for comparison
  const normalizeFeatures = (s: string) => {
    return s.replace(/\(feat\.?|ft\.?|featuring\s+[^)]+\)/gi, '')
           .replace(/\([^)]+\)/g, '')  // Remove parenthetical content
           .trim();
  };
  
  const n1 = normalizeFeatures(s1);
  const n2 = normalizeFeatures(s2);
  
  if (n1 === n2) return 0.95;  // Very high confidence but not perfect
  
  // TODO: Could implement more sophisticated string similarity algorithm
  // like Levenshtein distance or other fuzzy matching
  return 0.5;  // Default to medium confidence if strings are different
}

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

export default app; 