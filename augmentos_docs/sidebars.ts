import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  // Manually defined sidebar structure
  tutorialSidebar: [
    'index',
    'quickstart',
    {
      type: 'doc',
      id: 'getting-started',
      label: '🚧 Build From Scratch',
    },
    {
      type: 'category',
      label: '🚧 Core Concepts',
      link: {
        type: 'doc',
        id: 'core-concepts',
      },
      items: [
        'events',
        'layouts',
        {
          type: 'doc',
          id: 'tpa-lifecycle',
          label: 'App Lifecycle',
        },
      ],
    },
  ],
};

export default sidebars;
