/**
 * Layout Module
 * 
 * Exports the DisplayManager for AugmentOS Cloud.
 */

import DisplayManager from './DisplayManager';

// Create the singleton instance with default configuration
export const displayManager = new DisplayManager();

// For unit testing or specific configuration
export { DisplayManager };

// Default export
export default displayManager;