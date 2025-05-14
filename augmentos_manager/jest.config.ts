import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
    preset: 'react-native',
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    transform: {
        '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
    },
    transformIgnorePatterns: [
        'node_modules/(?!(react-native|@react-native|@react-navigation|@react-native-community|react-native-image-picker|react-native-vector-icons|react-native-url-polyfill|react-native-elements)/)',
    ],
    setupFiles: ['./jest.setup.ts'],
    moduleNameMapper: {
        '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
            '<rootDir>/__mocks__/fileMock.ts',
        // Mock the URL polyfill
        'react-native-url-polyfill/auto': '<rootDir>/__mocks__/urlPolyfillMock.ts',
        // Mock react-native-elements
        'react-native-elements': '<rootDir>/__mocks__/reactNativeElementsMock.ts',
    },
    globals: {
        __DEV__: true,
    },
    collectCoverage: true,
    collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        '!src/**/*.d.ts',
        '!src/**/*.test.{ts,tsx}',
        '!src/**/index.{ts,tsx}',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov'],
    coverageThreshold: {
        global: {
            branches: 0,
            functions: 0,
            lines: 0,
            statements: 0,
        },
    },
};

export default config; 