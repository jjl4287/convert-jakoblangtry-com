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
 * Converts an Apple Music link to a Spotify link by extracting metadata
 * and searching for the corresponding content on Spotify.
 * 
 * @param appleMusicLink - The original Apple Music link.
 * @returns The extracted metadata that can be used for Spotify search.
 */
export function convertAppleMusicLinkToSpotify(appleMusicLink: string): AppleMusicMetadata {
  return parseAppleMusicLink(appleMusicLink);
} 