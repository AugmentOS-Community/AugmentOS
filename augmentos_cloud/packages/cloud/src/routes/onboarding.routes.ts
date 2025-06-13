import express from 'express';
import { User } from '../models/user.model';
import App from '../models/app.model';
import { Types } from 'mongoose';

const router = express.Router();

// GET /onboarding/status?email=...&packageName=...
router.get('/status', async (req, res) => {
  const email = req.query.email as string;
  const packageName = req.query.packageName as string;
  if (!email || !packageName) return res.status(400).json({ error: 'Missing email or packageName' });
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const app = await App.findOne({ packageName });
    if (!app) return res.status(404).json({ error: 'App not found' });
    const userId = user._id.toString();
    let hasCompleted = false;
    if (app.onboardingStatus && app.onboardingStatus instanceof Map) {
      hasCompleted = !!app.onboardingStatus.get(userId);
    } else if (app.onboardingStatus && typeof app.onboardingStatus === 'object') {
      hasCompleted = !!app.onboardingStatus[userId];
    }
    // If not found, set onboardingStatus for this user to false
    if (!hasCompleted && (!app.onboardingStatus || !(app.onboardingStatus instanceof Map ? app.onboardingStatus.has(userId) : userId in app.onboardingStatus))) {
      await App.updateOne(
        { _id: app._id },
        { $set: { [`onboardingStatus.${userId}`]: false } }
      );
    }
    res.json({ hasCompletedOnboarding: hasCompleted });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /onboarding/complete { email, packageName }
router.post('/complete', async (req, res) => {
  const email = req.body.email as string;
  const packageName = req.body.packageName as string;
  if (!email || !packageName) return res.status(400).json({ error: 'Missing email or packageName' });
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Update onboardingStatus for this user in the app
    await App.updateOne(
      { packageName },
      { $set: { [`onboardingStatus.${user._id.toString()}`]: true } }
    );
    // Reload the app to get the latest onboardingStatus
    const app = await App.findOne({ packageName });
    let hasCompleted = false;
    if (app && app.onboardingStatus) {
      if (app.onboardingStatus instanceof Map) {
        hasCompleted = !!app.onboardingStatus.get(user._id.toString());
      } else if (typeof app.onboardingStatus === 'object') {
        hasCompleted = !!app.onboardingStatus[user._id.toString()];
      }
    }
    res.json({ success: true, hasCompletedOnboarding: hasCompleted });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /instructions?packageName=...
router.get('/instructions', async (req, res) => {
  const packageName = req.query.packageName as string;
  if (!packageName) return res.status(400).json({ error: 'Missing packageName' });

  try {
    const app = await App.findOne({ packageName });
    if (!app || !app.onboardingInstructions) {
      return res.status(404).json({ error: 'No onboarding instructions found for this package' });
    }
    res.json({ instructions: app.onboardingInstructions });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;