//backend/src/routes/apps.ts
import express from 'express';
import sessionService from '../services/core/session.service';
import { TranscriptSegment } from '@augmentos/sdk';
const router = express.Router();

// GET /api/transcripts/:appSessionId
// Headers:
//   - X-API-Key: <tpa-api-key>
//   - X-Package-Name: <tpa-package-name>
// Query Parameters:
//   - duration: number (seconds to look back)
//   - startTime?: ISO timestamp (optional alternative to duration)
//   - endTime?: ISO timestamp (optional alternative to duration)

// Get all available apps
router.get('/api/transcripts/:appSessionId', async (req, res) => {
  try {
    const appSessionId = req.params.appSessionId;
    const duration = req.query.duration;
    const startTime = req.query.startTime;
    const endTime = req.query.endTime;

    // console.log('\n\n\nreq.params:', req.params, "\n\n\n");
    // console.log('\n\n\nreq.query:', req.query.duration, "\n\n\n");
    // console.log('\n\n\nreq.query:', req.query.startTime, "\n\n\n");
    // console.log('\n\n\nreq.query:', req.query.endTime, "\n\n\n");
  
    if (!duration && !startTime && !endTime) {
      return res.status(400).json({ error: 'duration, startTime, or endTime is required' });
    }

    const userSessionId = appSessionId.split('-')[0];
    const userSession = sessionService.getSession(userSessionId);
    if (!userSession) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const transcriptSegments = userSession.transcript.segments;
    // console.log('\n\n\ntranscriptSegments:', transcriptSegments, "\n\n\n");

    const filteredTranscriptSegments = transcriptSegments.filter((segment: TranscriptSegment) => {
      const startTime = new Date(segment.timestamp);
      const currentTime = new Date();
      const secondsSinceNow = (currentTime.getTime() - startTime.getTime()) / 1000;

      if (duration) {
        const durationSeconds = parseInt(duration as string);
        return secondsSinceNow <= durationSeconds;
      }
    });

    res.json({
      segments: filteredTranscriptSegments
    });

  } catch (error) {
    console.error('Error fetching apps:', error);
    res.status(500).json({ error: 'Error fetching apps' });
  }
});

export default router;