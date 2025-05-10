import { fetchAppStoreData } from '../src/utils/backendUtils';
import BackendServerComms from '../src/backend_comms/BackendServerComms';
import { GET_APP_STORE_DATA_ENDPOINT } from '../src/consts';

describe('fetchAppStoreData', () => {
  const mockRestRequest = jest.fn();
  const mockInstance = { restRequest: mockRestRequest };
  
  // Add a spy for console.error
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockRestRequest.mockReset();
    jest.spyOn(BackendServerComms, 'getInstance').mockReturnValue(mockInstance as any);
    
    // Mock console.error before each test
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterEach(() => {
    // Restore console.error after each test
    consoleErrorSpy.mockRestore();
  });

  it('calls restRequest with correct endpoint', async () => {
    mockRestRequest.mockImplementation((endpoint, data, callback) => {
      callback.onSuccess([]);
      return Promise.resolve();
    });
    await fetchAppStoreData();
    expect(mockRestRequest).toHaveBeenCalledWith(
      GET_APP_STORE_DATA_ENDPOINT,
      null,
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onFailure: expect.any(Function),
      }),
    );
  });

  it('resolves with data on success', async () => {
    const dummyData = [
      {
        category: 'Utility',
        name: 'Test App',
        packageName: 'com.test.app',
        version: '1.0.0',
        description: 'A test app',
        iconImageUrl: 'http://example.com/icon.png',
        showInAppStore: true,
        identifierCode: 'test_app',
        downloadUrl: 'http://example.com/download',
        rating: 4.5,
        downloads: 1000,
        requirements: [],
      },
    ];
    mockRestRequest.mockImplementation((endpoint, data, callback) => {
      callback.onSuccess(dummyData);
      return Promise.resolve();
    });
    await expect(fetchAppStoreData()).resolves.toEqual(dummyData);
  });

  it('rejects the promise on failure', async () => {
    const error = new Error('Network failure');
    mockRestRequest.mockImplementation((endpoint, data, callback) => {
      callback.onFailure(error);
      return Promise.resolve();
    });
    await expect(fetchAppStoreData()).rejects.toBe(error);
    
    // Verify that console.error was called with the expected message
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to fetch app store data:',
      error
    );
  });
}); 