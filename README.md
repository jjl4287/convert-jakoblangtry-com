# Music Link Converter

A modern web application that converts music links between Spotify and Apple Music platforms. Built with React, TypeScript, and Express.js, featuring a beautiful and responsive UI with smooth animations.

![Music Link Converter](frontend/public/preview.png)

## Features

- 🔄 Instant conversion between Spotify and Apple Music links
- 🎵 Detailed music metadata display (title, artist, album, artwork)
- 📊 Match confidence scoring
- 💾 Local conversion history
- 🎧 Audio preview support (when available)
- 🔍 Smart content matching algorithm

## Tech Stack

### Frontend
- React with TypeScript
- Tailwind CSS for styling
- Framer Motion for animations

### Backend
- Node.js with Express
- TypeScript
- Spotify Web API integration
- Apple Music API integration
- Google Cloud Secret Manager for secure credentials

### Infrastructure
- Docker containerization
- Nginx for serving static files
- Google Cloud Platform deployment
- CORS support
- Environment-based configuration

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Docker and Docker Compose (for containerized deployment)
- Spotify Developer Account (for API credentials)
- Apple Developer Account (for Apple Music API credentials)

## Environment Variables

### Backend (.env)
```
PORT=3000
NODE_ENV=development
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
GOOGLE_CLOUD_PROJECT=your_gcp_project_id
APPLE_TEAM_ID=your_apple_team_id
APPLE_KEY_ID=your_apple_key_id
APPLE_PRIVATE_KEY=your_apple_private_key
APPLE_MUSIC_USER_TOKEN=your_apple_music_user_token
```

### Frontend (.env.development and .env.production)
```
REACT_APP_API_URL=http://localhost:3000 # Development
REACT_APP_API_URL=https://your-api-url.com # Production
```

## Local Development

1. Clone the repository:
```bash
git clone https://github.com/yourusername/music-link-converter.git
cd music-link-converter
```

2. Install dependencies:
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

3. Set up environment variables:
- Copy `.env.example` to `.env` in both frontend and backend directories
- Fill in your API credentials

4. Start the development servers:

```bash
# Start backend (from backend directory)
npm run dev

# Start frontend (from frontend directory)
npm start
```

The frontend will be available at `http://localhost:3001` and the backend at `http://localhost:3000`.

## Docker Deployment

1. Build and run using Docker Compose:
```bash
docker-compose up --build
```

This will start both frontend and backend services in development mode.

For production deployment:
```bash
docker-compose -f docker-compose.prod.yml up --build
```

## API Endpoints

### GET /convert
Converts a music link between platforms.

Query Parameters:
- `link` (required): The Spotify or Apple Music link to convert

Response:
```json
{
  "conversionDirection": "spotify-to-apple" | "apple-to-spotify",
  "confidence": number,
  "spotifyMetadata": {...} | null,
  "appleMusicMetadata": {...} | null
}
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Spotify Web API
- Apple Music API
- React and the Create React App team
- Tailwind CSS team
- Framer Motion team
