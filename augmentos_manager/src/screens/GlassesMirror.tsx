import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Image,
  ToastAndroid,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlassesDisplayMirror from '../components/GlassesDisplayMirror';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import { useGlassesMirror } from '../providers/GlassesMirrorContext';
import { NavigationProps } from '../components/types';
import Icon from 'react-native-vector-icons/MaterialIcons';
import VideoItem from '../components/VideoItem';
import PhotoItem from '../components/PhotoItem';
import { showAlert } from '../utils/AlertUtils';
import { shareFile } from '../utils/FileUtils';
import RNFS from 'react-native-fs';
import BackendServerComms from '../backend_comms/BackendServerComms';

interface GlassesMirrorProps {
  isDarkTheme: boolean;
}

interface GalleryPhoto {
  id: string;
  photoUrl: string;
  uploadDate: string;
  appId: string;
  userId: string;
}

type GalleryTab = 'device' | 'cloud';

const GlassesMirror: React.FC<GlassesMirrorProps> = ({ isDarkTheme }) => {
  const { status } = useStatus();
  const { events } = useGlassesMirror(); // From context
  const navigation = useNavigation<NavigationProps>();

  // Helper to check if we have a glasses model name
  const isGlassesConnected = !!status.glasses_info?.model_name;
  
  // Get only the last event
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  
  // Function to navigate to fullscreen mode
  const navigateToFullScreen = () => {
    navigation.navigate('GlassesMirrorFullscreen');
  };

  // Gallery state
  const [activeTab, setActiveTab] = useState<GalleryTab>('device');
  const [recordedVideos, setRecordedVideos] = useState<string[]>([]);
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<GalleryPhoto | null>(null);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  
  const backend = BackendServerComms.getInstance();

  // Create style object mirroring Homepage approach
  const currentThemeStyles = {
    container: { flex: 1 },
    contentContainer: {
      flex: 1, 
      paddingBottom: isDarkTheme ? 55 : 0  // Key difference! Homepage has 55px padding in dark mode
    }
  };

  // Load gallery contents
  useEffect(() => {
    if (activeTab === 'device') {
      loadRecordings();
    } else {
      loadGalleryPhotos();
    }
  }, [activeTab]);

  // Pull to refresh handler
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (activeTab === 'device') {
      loadRecordings().then(() => setRefreshing(false));
    } else {
      loadGalleryPhotos().then(() => setRefreshing(false));
    }
  }, [activeTab]);

  // Load recorded videos from device
  const loadRecordings = async () => {
    try {
      setIsLoading(true);
      // Define the videos directory
      const videoDir = Platform.OS === 'ios' 
        ? `${RNFS.DocumentDirectoryPath}/AugmentOSRecordings` 
        : `${RNFS.ExternalDirectoryPath}/AugmentOSRecordings`;
      
      // Check if directory exists, create if not
      const dirExists = await RNFS.exists(videoDir);
      if (!dirExists) {
        await RNFS.mkdir(videoDir);
        setRecordedVideos([]);
        setIsLoading(false);
        return;
      }
      
      // Read directory contents
      const files = await RNFS.readDir(videoDir);
      
      // Filter for video files
      const videoFiles = files
        .filter(file => file.name.endsWith('.mp4'))
        .map(file => file.path)
        .sort((a, b) => {
          // Sort by creation time (latest first)
          return b.localeCompare(a);
        });
      
      setRecordedVideos(videoFiles);
    } catch (error) {
      console.error('Error loading recordings:', error);
      Alert.alert('Error', 'Failed to load recordings');
    } finally {
      setIsLoading(false);
    }
    // Return a resolved promise for chaining with refresh
    return Promise.resolve();
  };
  
  // Load gallery photos from cloud
  const loadGalleryPhotos = async () => {
    try {
      setIsLoading(true);
      
      try {
        const response = await backend.getGalleryPhotos();
        if (response && response.success && response.photos) {
          setGalleryPhotos(response.photos);
        } else {
          console.error('Error in gallery response:', response);
          // Just set empty photos array instead of showing an error
          setGalleryPhotos([]);
        }
      } catch (error) {
        console.error('Error loading gallery photos:', error);
        // Set empty array instead of showing an error
        setGalleryPhotos([]);
      }
    } catch (error) {
      console.error('Error in outer gallery photos handler:', error);
      // No alert, just set empty state
      setGalleryPhotos([]);
    } finally {
      setIsLoading(false);
    }
    // Return a resolved promise for chaining with refresh
    return Promise.resolve();
  };

  // Share a video file
  const shareVideo = async (filePath: string) => {
    try {
      console.log('GlassesMirror: Starting video share for:', filePath);
      
      // Use our utility function that handles both platforms properly
      await shareFile(
        filePath,
        'video/mp4',
        'Share AugmentOS Recording',
        'Check out this recording from my smart glasses!'
      );
      
      console.log('GlassesMirror: Share completed successfully');
    } catch (error) {
      console.error('GlassesMirror: Error sharing video:', error);
      
      // Check if it's a file provider error (likely on first run after adding the module)
      if (
        error instanceof Error && 
        (error.message?.includes('FileProvider') || error.message?.includes('content://'))
      ) {
        // Special error for FileProvider issues
        showAlert(
          'Sharing Not Available', 
          'File sharing requires app restart after update. Please close and reopen the app, then try again.',
          undefined,
          { iconName: 'refresh', iconColor: '#FF9500' }
        );
      } else {
        // Generic error
        showAlert(
          'Sharing Error', 
          'Failed to share the video. Please try again.',
          undefined,
          { iconName: 'error', iconColor: '#FF3B30' }
        );
      }
    }
  };
  
  // Play video in our custom video player
  const playVideo = (filePath: string) => {
    try {
      // Extract filename from path for display
      const fileName = filePath.split('/').pop() || '';
      
      // Navigate to our custom video player screen
      navigation.navigate('VideoPlayerScreen', {
        filePath: filePath,
        fileName: fileName,
      });
    } catch (error) {
      console.error('Error playing video:', error);
      showAlert('Playback Error', 
        'Unable to play the video. Please try again.',
        undefined,
        { iconName: 'error', iconColor: '#FF3B30' }
      );
    }
  };
  
  // Delete a recorded video
  const deleteVideo = async (filePath: string) => {
    try {
      // Confirm before deleting
      showAlert(
        'Delete Recording',
        'Are you sure you want to delete this recording?',
        [
          { 
            text: 'Cancel', 
            style: 'cancel' 
          },
          { 
            text: 'Delete', 
            style: 'destructive',
            onPress: async () => {
              try {
                await RNFS.unlink(filePath);
                await loadRecordings();
                if (Platform.OS === 'android') {
                  ToastAndroid.show('Recording deleted', ToastAndroid.SHORT);
                } else {
                  showAlert('Success', 'Recording deleted successfully', undefined, {
                    iconName: 'check-circle',
                    iconColor: '#4CAF50'
                  });
                }
              } catch (error) {
                console.error('Error deleting video:', error);
                showAlert('Error', 'Failed to delete the recording', undefined, {
                  iconName: 'error',
                  iconColor: '#FF3B30'
                });
              }
            } 
          },
        ],
        {
          iconName: 'delete',
          iconColor: '#FF3B30'
        }
      );
    } catch (error) {
      console.error('Error deleting video:', error);
      showAlert('Delete Error', 'Failed to delete the video', undefined, {
        iconName: 'error',
        iconColor: '#FF3B30'
      });
    }
  };
  
  // View a photo in full screen modal
  const viewPhoto = (photo: GalleryPhoto) => {
    setSelectedPhoto(photo);
    setPhotoModalVisible(true);
  };
  
  // Delete a photo from the gallery
  const deletePhoto = async (photoId: string) => {
    try {
      // Confirm before deleting
      showAlert(
        'Delete Photo',
        'Are you sure you want to delete this photo?',
        [
          { 
            text: 'Cancel', 
            style: 'cancel' 
          },
          { 
            text: 'Delete', 
            style: 'destructive',
            onPress: async () => {
              try {
                await backend.deleteGalleryPhoto(photoId);
                await loadGalleryPhotos();
                if (Platform.OS === 'android') {
                  ToastAndroid.show('Photo deleted', ToastAndroid.SHORT);
                } else {
                  showAlert('Success', 'Photo deleted successfully', undefined, {
                    iconName: 'check-circle',
                    iconColor: '#4CAF50'
                  });
                }
              } catch (error) {
                console.error('Error deleting photo:', error);
                showAlert('Error', 'Failed to delete the photo', undefined, {
                  iconName: 'error',
                  iconColor: '#FF3B30'
                });
              }
            } 
          },
        ],
        {
          iconName: 'delete',
          iconColor: '#FF3B30'
        }
      );
    } catch (error) {
      console.error('Error deleting photo:', error);
      showAlert('Delete Error', 'Failed to delete the photo', undefined, {
        iconName: 'error',
        iconColor: '#FF3B30'
      });
    }
  };

  // Render empty state content for gallery
  const renderEmptyGalleryState = () => {
    if (activeTab === 'device') {
      return (
        <View style={styles.emptyContainer}>
          <Text style={[
            styles.emptyText,
            isDarkTheme ? styles.darkText : styles.lightText
          ]}>
            No recordings found
          </Text>
          <Text style={[
            styles.emptySubtext,
            isDarkTheme ? styles.darkText : styles.lightText
          ]}>
            Create a recording from the glasses mirror screen
          </Text>
          <TouchableOpacity
            style={styles.recordButton}
            onPress={navigateToFullScreen}
          >
            <Text style={styles.recordButtonText}>
              Go to Camera
            </Text>
          </TouchableOpacity>
        </View>
      );
    } else {
      return (
        <View style={styles.emptyContainer}>
          <Text style={[
            styles.emptyText,
            isDarkTheme ? styles.darkText : styles.lightText
          ]}>
            No gallery photos found
          </Text>
          <Text style={[
            styles.emptySubtext,
            isDarkTheme ? styles.darkText : styles.lightText
          ]}>
            Photos from apps will appear here
          </Text>
        </View>
      );
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        style={[
          currentThemeStyles.container,
          isDarkTheme ? styles.darkContainer : styles.lightContainer,
        ]}
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            colors={['#4c8bf5']}
            tintColor={isDarkTheme ? '#ffffff' : '#000000'}
          />
        }
      >
        {/* Header */}
        <View style={styles.titleContainer}>
          <Text
            style={[
              styles.title,
              isDarkTheme ? styles.titleTextDark : styles.titleTextLight,
            ]}
          >
            Glasses Mirror
          </Text>
          
          {isGlassesConnected && lastEvent && (
            <TouchableOpacity
              onPress={navigateToFullScreen}
            >
              <Icon name="fullscreen" size={24} color={isDarkTheme ? "#ffffff" : "#000000"} />
            </TouchableOpacity>
          )}
        </View>
        
        {/* Mirror Content */}
        <View style={styles.mirrorSection}>
          {isGlassesConnected ? (
            <View style={styles.contentContainer}>
              {lastEvent ? (
                <GlassesDisplayMirror 
                  layout={lastEvent.layout} 
                  fallbackMessage="Unknown layout data"
                />
              ) : (
                <View style={styles.fallbackContainer}>
                  <Text style={[isDarkTheme ? styles.darkText : styles.lightText, styles.fallbackText]}>
                    No display events available
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.fallbackContainer}>
              <Text style={[isDarkTheme ? styles.darkText : styles.lightText, styles.fallbackText]}>
                Connect glasses to use the Glasses Mirror
              </Text>
            </View>
          )}
        </View>
        
        {/* Gallery Section */}
        <View style={styles.gallerySection}>
          <Text style={[
            styles.sectionTitle,
            isDarkTheme ? styles.titleTextDark : styles.titleTextLight
          ]}>
            Gallery
          </Text>
          
          {/* Tab selector */}
          <View style={styles.tabContainer}>
            <TouchableOpacity 
              style={[
                styles.tabButton, 
                isDarkTheme ? styles.tabButtonDark : styles.tabButtonLight,
                activeTab === 'device' && (isDarkTheme ? styles.activeTabButtonDark : styles.activeTabButtonLight)
              ]}
              onPress={() => setActiveTab('device')}
            >
              <Text style={[
                styles.tabText,
                activeTab === 'device' ? styles.activeTabText : (isDarkTheme ? styles.darkText : styles.lightText)
              ]}>Device</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.tabButton,
                isDarkTheme ? styles.tabButtonDark : styles.tabButtonLight,
                activeTab === 'cloud' && (isDarkTheme ? styles.activeTabButtonDark : styles.activeTabButtonLight)
              ]}
              onPress={() => setActiveTab('cloud')}
            >
              <Text style={[
                styles.tabText,
                activeTab === 'cloud' ? styles.activeTabText : (isDarkTheme ? styles.darkText : styles.lightText)
              ]}>Cloud</Text>
            </TouchableOpacity>
          </View>

          {/* Gallery Content */}
          <View style={styles.galleryContent}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#4c8bf5" />
                <Text style={[
                  styles.loadingText,
                  isDarkTheme ? styles.darkText : styles.lightText
                ]}>
                  Loading {activeTab === 'device' ? 'recordings' : 'photos'}...
                </Text>
              </View>
            ) : (
              // Content based on active tab and data availability
              activeTab === 'device' && recordedVideos.length === 0 ||
              activeTab === 'cloud' && galleryPhotos.length === 0 ? (
                renderEmptyGalleryState()
              ) : (
                <View style={styles.contentList}>
                  {/* Device recordings tab content */}
                  {activeTab === 'device' && recordedVideos.map((videoPath, index) => (
                    <VideoItem
                      key={index}
                      videoPath={videoPath}
                      isDarkTheme={isDarkTheme}
                      onPlayVideo={playVideo}
                      onShareVideo={shareVideo}
                      onDeleteVideo={deleteVideo}
                    />
                  ))}
                  
                  {/* Cloud photos tab content */}
                  {activeTab === 'cloud' && galleryPhotos.map((photo, index) => (
                    <PhotoItem
                      key={index}
                      photo={photo}
                      isDarkTheme={isDarkTheme}
                      onViewPhoto={viewPhoto}
                      onDeletePhoto={deletePhoto}
                    />
                  ))}
                </View>
              )
            )}
          </View>
        </View>
      </ScrollView>

      {/* Photo viewer modal */}
      <Modal
        visible={photoModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPhotoModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setPhotoModalVisible(false)}
          >
            <Icon name="close" size={24} color="white" />
          </TouchableOpacity>
          
          {selectedPhoto && (
            <View style={styles.modalImageContainer}>
              <Image
                source={{ uri: selectedPhoto.photoUrl }}
                style={styles.fullscreenImage}
                resizeMode="contain"
              />
              <View style={styles.photoDetails}>
                <Text style={styles.photoDetailText}>
                  {new Date(selectedPhoto.uploadDate).toLocaleString()}
                </Text>
                <Text style={styles.photoDetailText}>
                  From app: {selectedPhoto.appId}
                </Text>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 0,
  },
  darkContainer: {
    backgroundColor: '#000000', // Match Homepage dark theme
  },
  lightContainer: {
    backgroundColor: '#f0f0f0', // Match Settings light theme
  },
  // Removed navBarOuterContainer
  // Regular layout container with proper stacking
  regularContainer: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  titleContainer: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  // No separate background colors for title container
  titleContainerDark: {},
  titleContainerLight: {},
  contentWrapper: {
    flex: 1,
    marginBottom: 10,
  },
  // This wrapper is no longer used
  navbarWrapper: {
    width: '100%',
    height: 64, // Fixed height for the navbar
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
    textAlign: 'left',
    flex: 1,
    marginBottom: 5,
  },
  titleTextDark: {
    color: '#ffffff',
    fontFamily: 'Montserrat-Bold',
  },
  titleTextLight: {
    color: '#000000',
    fontFamily: 'Montserrat-Bold',
  },
  darkText: {
    color: '#ffffff',
    fontFamily: 'Montserrat-Regular',
  },
  lightText: {
    color: '#000000',
    fontFamily: 'Montserrat-Regular',
  },
  contentContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenDisplayContainer: {
    padding: 0,
    backgroundColor: 'transparent',
  },
  // Fallback
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  fallbackText: {
    fontSize: 16,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  // Fullscreen mode styles
  fullscreenButton: {
    backgroundColor: '#4c8bf5',
    padding: 8,
    borderRadius: 8,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
    height: 40,
  },
  // Mirror section
  mirrorSection: {
    marginBottom: 20,
  },
  // Gallery section
  gallerySection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 24, // Match the size of the page title
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
    marginBottom: 15,
  },
  // Tab styles
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 15,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonDark: {
    backgroundColor: '#333',
  },
  tabButtonLight: {
    backgroundColor: '#e0e0e0',
  },
  activeTabButtonDark: {
    backgroundColor: '#444444', // Subtle highlight for dark mode
  },
  activeTabButtonLight: {
    backgroundColor: '#cccccc', // Subtle highlight for light mode
  },
  tabText: {
    fontSize: 16,
    fontFamily: 'Montserrat-Medium',
  },
  activeTabText: {
    // Let's use the theme colors we already have
    // Will be applied alongside the theme color styles
    fontFamily: 'Montserrat-Bold',
    fontWeight: 'bold',
  },
  // Gallery content
  galleryContent: {
    minHeight: 200,
  },
  // Loading state
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: 200,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    fontFamily: 'Montserrat-Regular',
  },
  // Empty state
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 30,
    minHeight: 200,
  },
  emptyText: {
    fontSize: 18,
    fontFamily: 'Montserrat-Bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: 'Montserrat-Regular',
    marginBottom: 20,
    textAlign: 'center',
    opacity: 0.7,
  },
  recordButton: {
    backgroundColor: '#4c8bf5',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 10,
  },
  recordButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Montserrat-Bold',
  },
  // Content list
  contentList: {
    padding: 0,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalImageContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '90%',
    height: '70%',
    borderRadius: 8,
  },
  photoDetails: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
  },
  photoDetailText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Montserrat-Medium',
    marginBottom: 4,
  },
});

export default GlassesMirror;