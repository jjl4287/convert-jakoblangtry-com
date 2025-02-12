import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { convertAppleMusicLinkToSpotify } from './modules/linkConversion';
import { extractMetadata, DetailedMetadata } from './modules/metadataExtraction';
import { searchSpotifyContent } from './modules/spotifyApi';
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());  // Enable CORS for frontend requests
app.use(express.json());

// Endpoint for link conversion (implementation to be added)
app.get('/', (req: Request, res: Response) => {
  res.send('Backend is running');
});

interface ConversionResponse {
  appleMusicMetadata: DetailedMetadata;
  spotifyResult: {
    spotifyUrl: string;
    metadata: DetailedMetadata;
  };
  confidence: number;  // 0-100 score of how confident we are in the match
}

// GET /convert?appleMusicLink=<link>
// This endpoint converts an Apple Music link to a Spotify link by:
// 1. Parsing the Apple Music link to extract structured metadata
// 2. Using the iTunes API to get detailed track/album/artist information
// 3. Searching Spotify for the best matching content using the detailed metadata
app.get('/convert', async (req: Request, res: Response) => {
  try {
    const appleMusicLink = req.query.appleMusicLink;
    if (!appleMusicLink || typeof appleMusicLink !== 'string') {
      return res.status(400).json({ 
        error: 'appleMusicLink query parameter is required and must be a string' 
      });
    }

    // Step 1: Parse the Apple Music link
    const parsedMetadata = convertAppleMusicLinkToSpotify(appleMusicLink);
    
    // Step 2: Extract detailed metadata from Apple Music
    const appleMusicMetadata = await extractMetadata(parsedMetadata);
    
    // Step 3: Search Spotify using the detailed metadata
    const spotifyResult = await searchSpotifyContent(appleMusicMetadata);
    
    // Step 4: Calculate match confidence
    const confidence = calculateMatchConfidence(appleMusicMetadata, spotifyResult.metadata);
    
    const response: ConversionResponse = {
      appleMusicMetadata,
      spotifyResult,
      confidence
    };

    res.json(response);
  } catch (error: any) {
    console.error('Conversion error:', error);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Calculates a confidence score (0-100) for how well the Spotify match corresponds
 * to the Apple Music source.
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