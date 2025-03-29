import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  SafeAreaView,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

import { RootStackParamList, AppStoreItem } from '../components/types';
import NavigationBar from '../components/NavigationBar';
import AppItem from '../components/AppStore/AppItem';
import InternetConnectionFallbackComponent from '../components/InternetConnectionFallbackComponent';
import LoadingComponent from '../components/LoadingComponent'; // Import the LoadingComponent

interface AppStoreProps {
  isDarkTheme: boolean;
}

import BackendServerComms from '../backend_comms/BackendServerComms';
import { GET_APP_STORE_DATA_ENDPOINT } from '../consts';

const AppStore: React.FC<AppStoreProps> = ({ isDarkTheme }) => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'AppStore'>>();

  const [searchQuery, setSearchQuery] = useState('');
  const [filteredApps, setFilteredApps] = useState<AppStoreItem[]>([]);
  const [selectedCategory] = useState<string | null>(null);

  // New state for handling connection errors
  const [isError, setIsError] = useState(false);

  // New state for handling loading
  const [isLoading, setIsLoading] = useState(true); // Initialize as loading

  // Theme colors
  const theme = {
    backgroundColor: isDarkTheme ? '#1c1c1c' : '#f9f9f9',
    headerBg: isDarkTheme ? '#333333' : '#fff',
    textColor: isDarkTheme ? '#FFFFFF' : '#333333',
    subTextColor: isDarkTheme ? '#999999' : '#666666',
    cardBg: isDarkTheme ? '#333333' : '#fff',
    borderColor: isDarkTheme ? '#444444' : '#e0e0e0',
    searchBg: isDarkTheme ? '#2c2c2c' : '#f5f5f5',
    categoryChipBg: isDarkTheme ? '#444444' : '#e9e9e9',
    categoryChipText: isDarkTheme ? '#FFFFFF' : '#555555',
    selectedChipBg: isDarkTheme ? '#666666' : '#333333',
    selectedChipText: isDarkTheme ? '#FFFFFF' : '#FFFFFF',
  };

  useEffect(() => {
    fetchAppStoreData();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      // Any logic that was previously in animations can be placed here if needed
    }, []),
  );

  const fetchAppStoreData = async () => {
    setIsLoading(true); // Start loading
    const backendServerComms = BackendServerComms.getInstance();

    const callback = {
      onSuccess: (data: any) => {
        const visibleApps = data.filter((app: AppStoreItem) => app.showInAppStore);
        setFilteredApps(visibleApps); // Assuming the API returns a list of AppStoreItem
        setIsError(false); // Reset error state on success
        setIsLoading(false); // Stop loading
      },
      onFailure: () => {
        setIsError(true); // Set error state on failure
        setIsLoading(false); // Stop loading
      },
    };

    await backendServerComms.restRequest(GET_APP_STORE_DATA_ENDPOINT, null, callback);
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    filterApps(text, selectedCategory);
  };

  const filterApps = (query: string, category: string | null) => {
    let apps = filteredApps;

    if (category) {
      apps = apps.filter(app => app.category === category);
    }

    if (query) {
      apps = apps.filter(app =>
        app.name.toLowerCase().includes(query.toLowerCase()),
      );
    }

    setFilteredApps(apps);
  };

  // If you decide to handle categories in the future, you can uncomment and use this
  // const handleCategoryPress = (category: string) => {
  //   if (category === 'All') {
  //     setSelectedCategory(null);
  //     filterApps(searchQuery, null);
  //   } else {
  //     const newCategory = selectedCategory === category ? null : category;
  //     setSelectedCategory(newCategory);
  //     filterApps(searchQuery, newCategory);
  //   }
  // };

  const renderItem = ({ item, index }: { item: AppStoreItem; index: number }) => (
    <AppItem
      item={item}
      index={index}
      theme={theme}
      onPress={() => navigation.navigate('AppDetails', { app: item })}
    />
  );

  // Uncomment and implement if you reintroduce recommended items or categories
  // const renderRecommendedItem = ({ item }: { item: AppStoreItem }) => (
  //   <RecommendedItem
  //     item={item}
  //     theme={theme}
  //     onPress={() => navigation.navigate('AppDetails', { app: item })}
  //   />
  // );
  //
  // const renderCategory = ({ item }: { item: string }) => (
  //   <TouchableOpacity
  //     style={[
  //       styles.categoryChip,
  //       { backgroundColor: theme.categoryChipBg },
  //       selectedCategory === item && { backgroundColor: theme.selectedChipBg },
  //     ]}
  //     onPress={() => handleCategoryPress(item)}>
  //     <Text
  //       style={[
  //         styles.categoryText,
  //         { color: theme.categoryChipText },
  //         selectedCategory === item && { color: theme.selectedChipText },
  //       ]}>
  //       {item}
  //     </Text>
  //   </TouchableOpacity>
  // );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      {/* Conditionally render Header and Search Bar when there is no error and not loading */}
      {!isError && !isLoading && (
        <View
          style={[
            styles.headerContainer,
            {
              backgroundColor: theme.headerBg,
              borderBottomColor: theme.borderColor,
            },
          ]}
        >
          <Text
            style={[
              styles.header,
              isDarkTheme ? styles.headerTextDark : styles.headerTextLight,
            ]}
          >
            AugmentOS Store
          </Text>
          <View
            style={[
              styles.searchContainer,
              {
                backgroundColor: theme.searchBg,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="magnify"
              size={20}
              color={isDarkTheme ? '#FFFFFF' : '#aaaaaa'}
              style={styles.searchIcon}
            />
            <TextInput
              style={[styles.searchInput, { color: theme.textColor }]}
              placeholder="Search for apps..."
              placeholderTextColor={isDarkTheme ? '#999999' : '#aaaaaa'}
              value={searchQuery}
              onChangeText={handleSearch}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => handleSearch('')}
                style={styles.clearButton}
              >
                <MaterialCommunityIcons
                  name="close-circle"
                  size={18}
                  color={isDarkTheme ? '#999999' : '#aaaaaa'}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Content Section */}
      <View style={styles.contentContainer}>
        {isLoading ? (
          // Render Loading Component when data is loading
          <LoadingComponent
            message="Fetching App Store data..."
            theme={theme}
          />
        ) : isError ? (
          // Render Error Component when there is an error
          <InternetConnectionFallbackComponent
            isDarkTheme={isDarkTheme}
            retry={fetchAppStoreData}
          />
        ) : (
          // Render Main Content when there is no error and data is loaded
          <>
            {/* Recommended Section */}
            <View style={styles.recommendSection}>
              <Text style={[styles.recommendHeader, { color: theme.textColor }]}>
                Recommended for You
              </Text>
              {/* Uncomment and implement when ready
              <FlatList
                data={AppStoreData.slice(0, 5)}
                horizontal
                renderItem={renderRecommendedItem}
                keyExtractor={item => item.identifier_code}
                contentContainerStyle={styles.recommendList}
                showsHorizontalScrollIndicator={false}
              /> */}
            </View>

            {/* App List Section */}
            <View style={styles.listContainer}>
              <FlatList
                data={filteredApps}
                renderItem={renderItem}
                keyExtractor={item => item.identifierCode}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                windowSize={5}
                maxToRenderPerBatch={5}
                removeClippedSubviews={true}
              />
            </View>
          </>
        )}
      </View>

      {/* Navigation Bar remains visible regardless of connection */}
      <View
        style={[
          styles.navigationBarContainer,
          {
            backgroundColor: theme.headerBg,
            borderTopColor: theme.borderColor,
          },
        ]}
      >
        <NavigationBar toggleTheme={() => {}} isDarkTheme={isDarkTheme} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  headerContainer: {
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
  },
  header: {
    fontSize: 24,
    fontFamily: 'Montserrat-Bold',
    fontWeight: 'bold',
    textAlign: 'left',
  },
  headerTextDark: {
    color: '#ffffff',
  },
  headerTextLight: {
    color: '#000000',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    borderRadius: 8,
    paddingHorizontal: 15,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    height: 40,
    flex: 1,
    fontSize: 14,
    fontFamily: 'Montserrat-Regular',
  },
  clearButton: {
    padding: 8,
    marginLeft: 4,
    marginRight: -4,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 15,
    paddingTop: 15,
  },
  recommendSection: {
    marginBottom: 20,
  },
  recommendHeader: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Montserrat-Bold',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 80,
  },
  navigationBarContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    borderTopWidth: 1,
    paddingBottom: 20,
  },
});

export default AppStore;
