/**
 * @format
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import HomeScreenComponent from '../src/HomeScreenComponent';
import { AugmentOSParser } from '../src/AugmentOSStatusParser';

// Mock the AugmentOSStatusProvider context
jest.mock('../src/providers/AugmentOSStatusProvider', () => {
  const originalModule = jest.requireActual('../src/providers/AugmentOSStatusProvider');

  // Mock the useStatus hook
  const useStatus = jest.fn();

  return {
    ...originalModule,
    StatusProvider: ({ children }: { children: React.ReactNode }) => children,
    useStatus: useStatus,
  };
});

// Mock CoreCommunicator
jest.mock('../src/bridge/CoreCommunicator', () => ({
  initialize: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
  sendRequestStatus: jest.fn(),
}));

describe('HomeScreenComponent', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  it('renders connected puck status correctly', () => {
    // Mock status data for a connected puck
    const mockStatus = {
      ...AugmentOSParser.defaultStatus,
      core_info: {
        ...AugmentOSParser.defaultStatus.core_info,
        puck_connected: true,
        puck_battery_life: 85,
      },
      apps: [], // Add empty apps array to prevent undefined error
    };

    // Mock the useStatus hook to return our test data
    const { useStatus } = require('../src/providers/AugmentOSStatusProvider');
    useStatus.mockReturnValue({ status: mockStatus });

    // Render the component
    const { getByText } = render(<HomeScreenComponent />);

    // Verify expected text appears
    expect(getByText('Puck Connected: Yes')).toBeTruthy();
    expect(getByText('Puck Battery Life: 85%')).toBeTruthy();
  });

  it('renders disconnected puck status correctly', () => {
    // Mock status data for a disconnected puck
    const mockStatus = {
      ...AugmentOSParser.defaultStatus,
      core_info: {
        ...AugmentOSParser.defaultStatus.core_info,
        puck_connected: false,
        puck_battery_life: null,
      },
      apps: [], // Add empty apps array to prevent undefined error
    };

    // Mock the useStatus hook to return our test data
    const { useStatus } = require('../src/providers/AugmentOSStatusProvider');
    useStatus.mockReturnValue({ status: mockStatus });

    // Render the component
    const { getByText } = render(<HomeScreenComponent />);

    // Verify expected text appears
    expect(getByText('Puck Connected: No')).toBeTruthy();
    expect(getByText('Puck Battery Life: N/A%')).toBeTruthy();
  });

  it('renders connected glasses info correctly', () => {
    // Mock status data with connected glasses
    const mockStatus = {
      ...AugmentOSParser.defaultStatus,
      glasses_info: {
        model_name: 'Test Glasses',
        battery_life: 75,
        is_searching: false,
        brightness: '80',
        auto_brightness: false,
        headUp_angle: 15,
      },
      apps: [], // Add empty apps array to prevent undefined error
    };

    // Mock the useStatus hook to return our test data
    const { useStatus } = require('../src/providers/AugmentOSStatusProvider');
    useStatus.mockReturnValue({ status: mockStatus });

    // Render the component
    const { getByText } = render(<HomeScreenComponent />);

    // Verify expected text appears
    expect(getByText('Model: Test Glasses')).toBeTruthy();
    expect(getByText('Battery Life: 75%')).toBeTruthy();
  });

  it('shows "No Glasses Connected" when no glasses are connected', () => {
    // Mock status data with no connected glasses
    const mockStatus = {
      ...AugmentOSParser.defaultStatus,
      glasses_info: null,
      apps: [], // Add empty apps array to prevent undefined error
    };

    // Mock the useStatus hook to return our test data
    const { useStatus } = require('../src/providers/AugmentOSStatusProvider');
    useStatus.mockReturnValue({ status: mockStatus });

    // Render the component
    const { getByText } = render(<HomeScreenComponent />);

    // Verify expected text appears
    expect(getByText('No Glasses Connected')).toBeTruthy();
  });

  it('renders installed apps correctly', () => {
    // Mock status data with installed apps
    const mockStatus = {
      ...AugmentOSParser.defaultStatus,
      apps: [
        {
          name: 'Test App 1',
          description: 'A test app',
          is_running: true,
          is_foreground: true,
        },
        {
          name: 'Test App 2',
          description: 'Another test app',
          is_running: false,
          is_foreground: false,
        },
      ],
    };

    // Mock the useStatus hook to return our test data
    const { useStatus } = require('../src/providers/AugmentOSStatusProvider');
    useStatus.mockReturnValue({ status: mockStatus });

    // Render the component
    const { getByText } = render(<HomeScreenComponent />);

    // Verify expected text appears
    expect(getByText('Name: Test App 1')).toBeTruthy();
    expect(getByText('Description: A test app')).toBeTruthy();
    expect(getByText('Running: Yes')).toBeTruthy();
    expect(getByText('Foreground: Yes')).toBeTruthy();

    expect(getByText('Name: Test App 2')).toBeTruthy();
    expect(getByText('Description: Another test app')).toBeTruthy();
    expect(getByText('Running: No')).toBeTruthy();
    expect(getByText('Foreground: No')).toBeTruthy();
  });
});
