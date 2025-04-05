import React, {useState, useRef} from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Animated,
  TextInput,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import NavigationBar from '../components/NavigationBar';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

interface Card {
  id: number;
  name: string;
  content: string;
}

interface GlassesMirrorOLDProps {
  isDarkTheme: boolean;
}

const GlassesMirrorOLD: React.FC<GlassesMirrorOLDProps> = ({isDarkTheme}) => {
  const [cards] = useState<Card[]>([
    {
      id: 1,
      name: 'Mentra Merge',
      content: 'QuestionAnswerer: 25-50mg caffeine per piece dark chocolate.',
    },
    {
      id: 2,
      name: 'ADHD Assist',
      content:
        'Reminder to take a 10-minute break. Stretch and reset your focus.',
    },
    {
      id: 3,
      name: 'Translator',
      content:
        'Currently translating your conversation from English to French in real-time.',
    },
    {
      id: 4,
      name: 'WeatherLens',
      content:
        'Local forecast: Sunny, high of 75°F. Minimal rain expected today.',
    },
    {
      id: 5,
      name: 'Health Tracker',
      content:
        'Youve been sitting for over 45 minutes. Time to stand up and stretch!',
    },
    {
      id: 6,
      name: 'Mentra Merge',
      content:
        'Important conversations saved. Topics flagged for easy navigation.',
    },
    {
      id: 7,
      name: 'Mindful Moments',
      content:
        'Guided breathing exercise: inhale for 4 seconds, exhale for 6 seconds.',
    },
    {
      id: 8,
      name: 'Workout Buddy',
      content: 'Next exercise: 15 push-ups. Keep up the good work!',
    },
    {
      id: 10,
      name: 'Mentra Merge',
      content: 'QuestionAnswerer: 25-50mg caffeine per piece dark chocolate.',
    },
    {
      id: 21,
      name: 'ADHD Assist',
      content:
        'Reminder to take a 10-minute break. Stretch and reset your focus.',
    },
    {
      id: 32,
      name: 'Translator',
      content:
        'Currently translating your conversation from English to French in real-time.',
    },
    {
      id: 43,
      name: 'WeatherLens',
      content:
        'Local forecast: Sunny, high of 75°F. Minimal rain expected today.',
    },
    {
      id: 54,
      name: 'Health Tracker',
      content:
        'Youve been sitting for over 45 minutes. Time to stand up and stretch!',
    },
    {
      id: 65,
      name: 'Mentra Merge',
      content:
        'Important conversations saved. Topics flagged for easy navigation.',
    },
    {
      id: 76,
      name: 'Mindful Moments',
      content:
        'Guided breathing exercise: inhale for 4 seconds, exhale for 6 seconds.',
    },
    {
      id: 87,
      name: 'Workout Buddy',
      content: 'Next exercise: 15 push-ups. Keep up the good work!',
    },
    {
      id: 100,
      name: 'Mentra Merge',
      content: 'QuestionAnswerer: 25-50mg caffeine per piece dark chocolate..',
    },
    {
      id: 211,
      name: 'ADHD Assist',
      content:
        'Reminder to take a 10-minute break. Stretch and reset your focus.',
    },
    {
      id: 322,
      name: 'Translator',
      content:
        'Currently translating your conversation from English to French in real-time.',
    },
    {
      id: 433,
      name: 'WeatherLens',
      content:
        'Local forecast: Sunny, high of 75°F. Minimal rain expected today.',
    },
    {
      id: 544,
      name: 'Health Tracker',
      content:
        'Youve been sitting for over 45 minutes. Time to stand up and stretch!',
    },
    {
      id: 655,
      name: 'Mentra Merge',
      content: 'QuestionAnswerer: 25-50mg caffeine per piece dark chocolate.',
    },
    {
      id: 766,
      name: 'Mindful Moments',
      content:
        'Guided breathing exercise: inhale for 4 seconds, exhale for 6 seconds.',
    },
    {
      id: 877,
      name: 'Workout Buddy',
      content: 'Next exercise: 15 push-ups. Keep up the good work!',
    },
    {
      id: 1000,
      name: 'Mentra Merge',
      content:
        'Last 10 minutes of conversation displayed with highlights on key phrases.',
    },
    {
      id: 2111,
      name: 'ADHD Assist',
      content:
        'Reminder to take a 10-minute break. Stretch and reset your focus.',
    },
    {
      id: 3222,
      name: 'Translator',
      content:
        'Currently translating your conversation from English to French in real-time.',
    },
    {
      id: 4333,
      name: 'WeatherLens',
      content:
        'Local forecast: Sunny, high of 75°F. Minimal rain expected today.',
    },
    {
      id: 5444,
      name: 'Health Tracker',
      content:
        'Youve been sitting for over 45 minutes. Time to stand up and stretch!',
    },
    {
      id: 6555,
      name: 'Mentra Merge',
      content: 'QuestionAnswerer: 25-50mg caffeine per piece dark chocolate.',
    },
    {
      id: 7666,
      name: 'Mindful Moments',
      content:
        'Guided breathing exercise: inhale for 4 seconds, exhale for 6 seconds.',
    },
    {
      id: 8777,
      name: 'Workout Buddy',
      content: 'Next exercise: 15 push-ups. Keep up the good work!',
    },
  ]);

  const scrollViewRef = useRef<ScrollView>(null);
  const indicatorScrollViewRef = useRef<ScrollView>(null);
  const [showScrollDownButton, setShowScrollDownButton] = useState(false);
  const pulseAnimation = useRef(new Animated.Value(1)).current;
  const [filteredCards, setFilteredCards] = useState<Card[]>(cards);
  const [searchQuery, setSearchQuery] = useState('');

  // Animation refs
  const titleFadeAnim = useRef(new Animated.Value(0)).current;
  const titleSlideAnim = useRef(new Animated.Value(-20)).current;
  const searchFadeAnim = useRef(new Animated.Value(0)).current;
  const searchSlideAnim = useRef(new Animated.Value(-20)).current;
  const [fadeAnims] = useState(() => cards.map(() => new Animated.Value(0)));
  const [slideAnims] = useState(() => cards.map(() => new Animated.Value(50)));

  // Animation Functions
  const startPulseAnimation = React.useCallback(() => {
    pulseAnimation.setValue(1);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnimation, {
          toValue: 1.0308,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnimation, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulseAnimation]);

  const resetAndStartHeaderAnimations = React.useCallback(() => {
    titleFadeAnim.setValue(0);
    titleSlideAnim.setValue(-20);
    searchFadeAnim.setValue(0);
    searchSlideAnim.setValue(-20);

    Animated.stagger(200, [
      Animated.parallel([
        Animated.timing(titleFadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(titleSlideAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(searchFadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(searchSlideAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [titleFadeAnim, titleSlideAnim, searchFadeAnim, searchSlideAnim]);

  useFocusEffect(
    React.useCallback(() => {
      const resetAndStartCardAnimations = () => {
        fadeAnims.forEach(anim => anim.setValue(0));
        slideAnims.forEach(anim => anim.setValue(50));

        setTimeout(() => {
          const animations = [...cards].reverse().map((_, index) => {
            const delay = index * 50;
            return Animated.parallel([
              Animated.timing(fadeAnims[cards.length - 1 - index], {
                toValue: 1,
                duration: 500,
                delay,
                useNativeDriver: true,
              }),
              Animated.timing(slideAnims[cards.length - 1 - index], {
                toValue: 0,
                duration: 500,
                delay,
                useNativeDriver: true,
              }),
            ]);
          });

          Animated.stagger(50, animations).start();
        }, 100);
      };

      resetAndStartHeaderAnimations();
      resetAndStartCardAnimations();
      startPulseAnimation();
      scrollViewRef.current?.scrollToEnd({animated: false});

      return () => {
        pulseAnimation.stopAnimation();
        titleFadeAnim.stopAnimation();
        titleSlideAnim.stopAnimation();
        searchFadeAnim.stopAnimation();
        searchSlideAnim.stopAnimation();
        fadeAnims.forEach(anim => anim.stopAnimation());
        slideAnims.forEach(anim => anim.stopAnimation());
      };
    }, [
      cards,
      fadeAnims,
      slideAnims,
      pulseAnimation,
      titleFadeAnim,
      titleSlideAnim,
      searchFadeAnim,
      searchSlideAnim,
      resetAndStartHeaderAnimations,
      startPulseAnimation,
    ]),
  );

  const handleScroll = (event: any) => {
    const {layoutMeasurement, contentOffset, contentSize} = event.nativeEvent;
    const isAtBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - 20;
    setShowScrollDownButton(!isAtBottom);

    const cardHeight = 200;
    const totalIndicators = cards.length;
    const maxScroll = totalIndicators * cardHeight - layoutMeasurement.height;
    const scrollPercent = Math.min(Math.max(contentOffset.y / maxScroll, 0), 1);

    const indicatorTotalHeight = totalIndicators * 46;
    const indicatorVisibleHeight = layoutMeasurement.height;
    const indicatorMaxScroll = indicatorTotalHeight - indicatorVisibleHeight;

    indicatorScrollViewRef.current?.scrollTo({
      y: scrollPercent * indicatorMaxScroll,
      animated: false,
    });
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (text.trim() === '') {
      setFilteredCards(cards);
    } else {
      const lowercaseQuery = text.toLowerCase();
      const filtered = cards.filter(
        card =>
          card.name.toLowerCase().includes(lowercaseQuery) ||
          card.content.toLowerCase().includes(lowercaseQuery),
      );
      setFilteredCards(filtered);
    }
  };

  const handleScrollToBottom = () => {
    scrollViewRef.current?.scrollToEnd({animated: true});
  };

  const getAppColor = (name: string) => {
    switch (name) {
      case 'Mentra Merge':
        return '#4A90E2';
      case 'ADHD Assist':
        return '#FF7F50';
      case 'Translator':
        return '#FFD700';
      case 'WeatherLens':
        return '#87CEEB';
      case 'Health Tracker':
        return '#32CD32';
      case 'Mindful Moments':
        return '#FF69B4';
      case 'Workout Buddy':
        return '#FF4500';
      default:
        return '#CCCCCC';
    }
  };

  const renderCard = React.useCallback(
    (card: Card, index: number) => {
      const cardColor = getAppColor(card.name);
      const isLastCard = index === filteredCards.length - 1;

      const cardStyleVariant = [
        styles.card,
        isDarkTheme ? styles.cardDark : styles.cardLight,
        isLastCard ? styles.lastCard : styles.normalCard,
        {
          borderColor: cardColor,
          backgroundColor: isLastCard
            ? isDarkTheme
              ? `${cardColor}25`
              : `${cardColor}25`
            : isDarkTheme
            ? styles.cardDark.backgroundColor
            : styles.cardLight.backgroundColor,
        },
      ];

      return (
        <Animated.View
          key={card.id}
          style={[
            styles.cardWrapper,
            {
              opacity: fadeAnims[index],
              transform: [{translateY: slideAnims[index]}],
            },
          ]}>
          {isLastCard ? (
            <Animated.View
              style={[
                styles.lastCardWrapper,
                styles.lastCardAnimation,
                {
                  transform: [{scale: pulseAnimation}],
                },
              ]}>
              <View style={cardStyleVariant}>
                <View style={[styles.cardHeader, {backgroundColor: cardColor}]}>
                  <Text
                    style={[
                      styles.cardName,
                      isDarkTheme ? styles.darkText : styles.lightText,
                    ]}>
                    {card.name}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.cardContent,
                    isDarkTheme ? styles.darkText : styles.lightText,
                  ]}>
                  {card.content}
                </Text>
              </View>
            </Animated.View>
          ) : (
            <View style={cardStyleVariant}>
              <View style={[styles.cardHeader, {backgroundColor: cardColor}]}>
                <Text
                  style={[
                    styles.cardName,
                    isDarkTheme ? styles.darkText : styles.lightText,
                  ]}>
                  {card.name}
                </Text>
              </View>
              <Text
                style={[
                  styles.cardContent,
                  isDarkTheme ? styles.darkText : styles.lightText,
                ]}>
                {card.content}
              </Text>
            </View>
          )}
        </Animated.View>
      );
    },
    [fadeAnims, filteredCards.length, isDarkTheme, pulseAnimation, slideAnims],
  );

  return (
    <View
      style={[
        styles.container,
        isDarkTheme ? styles.darkContainer : styles.lightContainer,
      ]}>
      <View
        style={[
          styles.titleContainer,
          isDarkTheme ? styles.titleContainerDark : styles.titleContainerLight,
        ]}>
        <Animated.Text
          style={[
            styles.title,
            isDarkTheme ? styles.titleTextDark : styles.titleTextLight,
            {
              opacity: titleFadeAnim,
              transform: [{translateY: titleSlideAnim}],
            },
          ]}>
          Glasses Mirror Mockup
        </Animated.Text>

        <Animated.View
          style={[
            styles.searchContainer,
            isDarkTheme
              ? styles.searchContainerDark
              : styles.searchContainerLight,
            {
              opacity: searchFadeAnim,
              transform: [{translateY: searchSlideAnim}],
            },
          ]}>
          <MaterialCommunityIcons
            name="magnify"
            size={16}
            color={isDarkTheme ? '#FFFFFF' : '#666666'}
            style={styles.searchIcon}
          />
          <TextInput
            style={[
              styles.searchInput,
              isDarkTheme ? styles.searchInputDark : styles.searchInputLight,
            ]}
            placeholder="Search mirrored apps..."
            placeholderTextColor={isDarkTheme ? '#999999' : '#666666'}
            value={searchQuery}
            onChangeText={handleSearch}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => handleSearch('')}
              style={styles.clearButton}>
              <MaterialCommunityIcons
                name="close-circle"
                size={18}
                color={isDarkTheme ? '#FFFFFF' : '#666666'}
              />
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>

      <View style={styles.contentContainer}>
        <View style={styles.indicatorColumn}>
          <ScrollView
            ref={indicatorScrollViewRef}
            showsVerticalScrollIndicator={false}
            style={styles.indicatorScrollView}
            contentContainerStyle={styles.indicatorContainer}
            scrollEnabled={true}
            scrollEventThrottle={16}>
            {filteredCards.map((card, index) => (
              <TouchableOpacity
                key={card.id}
                style={styles.indicatorTouchable}
                onPress={() => {
                  const cardHeight = 200;
                  scrollViewRef.current?.scrollTo({
                    y: index * cardHeight,
                    animated: true,
                  });
                }}>
                <View
                  style={[
                    styles.indicatorBox,
                    {backgroundColor: getAppColor(card.name)},
                  ]}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.cardsColumn}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollViewContent}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onMomentumScrollEnd={event => handleScroll(event)}>
            <View style={styles.cardsContainer}>
              {filteredCards.map(renderCard)}
            </View>
          </ScrollView>
        </View>
      </View>

      {showScrollDownButton && (
        <TouchableOpacity
          style={styles.focusedScrollDownButton}
          onPress={handleScrollToBottom}>
          <MaterialCommunityIcons name="arrow-down" size={24} color="white" />
        </TouchableOpacity>
      )}

      <NavigationBar isDarkTheme={isDarkTheme} toggleTheme={() => {}} />
    </View>
  );
};
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  darkContainer: {
    backgroundColor: '#121212',
  },
  lightContainer: {
    backgroundColor: '#f8f9fa',
  },
  titleContainer: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginHorizontal: -20,
    marginTop: -20,
    marginBottom: 10,
  },
  titleContainerDark: {
    backgroundColor: '#333333',
  },
  titleContainerLight: {
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
    textAlign: 'left',
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
    flex: 1,
    flexDirection: 'row',
    marginBottom: 0,
  },
  indicatorColumn: {
    width: 20,
    marginRight: 10,
    justifyContent: 'center',
  },
  cardsColumn: {
    flex: 1,
  },
  indicatorScrollView: {
    height: '100%',
  },
  indicatorContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  indicatorTouchable: {
    width: 20,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indicatorBox: {
    width: 10,
    height: 38,
    borderRadius: 5,
    marginVertical: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingBottom: 40,
  },
  cardsContainer: {
    paddingBottom: 10,
  },
  cardWrapper: {
    paddingHorizontal: 2,
    marginBottom: 20,
    transform: [{translateY: 0}],
  },
  lastCardWrapper: {
    marginBottom: 0,
  },
  lastCardAnimation: {
    margin: 2,
    transformOrigin: 'center',
  },
  card: {
    minHeight: 180,
    borderRadius: 15,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  normalCard: {
    borderWidth: 1,
  },
  lastCard: {
    borderWidth: 2,
  },
  cardLight: {
    backgroundColor: '#ffffff',
  },
  cardDark: {
    backgroundColor: '#1e1e1e',
  },
  cardHeader: {
    width: '100%',
    paddingVertical: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'flex-start',
    flexShrink: 0,
  },
  cardName: {
    fontSize: 18,
    fontFamily: 'Montserrat-Bold',
    lineHeight: 24,
  },
  cardContent: {
    fontSize: 16,
    fontFamily: 'Montserrat-Regular',
    padding: 16,
    textAlign: 'left',
    flex: 1,
  },
  focusedScrollDownButton: {
    position: 'absolute',
    bottom: 75,
    right: 20,
    backgroundColor: '#007AFF',
    borderRadius: 25,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#007AFF',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 15,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 15,
    height: 40,
    borderRadius: 8,
  },
  searchContainerLight: {
    backgroundColor: '#f5f5f5',
    borderWidth: 0,
  },
  searchContainerDark: {
    backgroundColor: '#2c2c2c',
    borderWidth: 0,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
    padding: 0,
    fontFamily: 'Montserrat-Regular',
  },
  searchInputLight: {
    color: '#333333',
  },
  searchInputDark: {
    color: '#ffffff',
  },
  clearButton: {
    padding: 4,
    marginLeft: 10,
  },
});

export default GlassesMirrorOLD;
