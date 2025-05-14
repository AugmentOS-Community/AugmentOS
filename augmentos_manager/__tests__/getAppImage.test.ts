import { getAppImage, DEFAULT_ICON } from '../src/logic/getAppImage';
import { AppInfo } from '../src/AugmentOSStatusParser';

describe('getAppImage', () => {
  it('returns DEFAULT_ICON when packageName is unknown and no icon provided', () => {
    const result = getAppImage({ packageName: 'unknown.app', icon: undefined } as AppInfo);
    expect(result).toBe(DEFAULT_ICON);
  });

  it('returns ImageSourcePropType object when icon URL provided', () => {
    const url = 'https://example.com/icon.png';
    const result = getAppImage({ packageName: 'unknown.app', icon: url } as AppInfo);
    expect(result).toEqual({ uri: url, cache: 'force-cache' });
  });

  it('returns DEFAULT_ICON when icon is null', () => {
    // icon explicitly null should fall back
    const result = getAppImage({ packageName: 'unknown.app', icon: null } as any);
    expect(result).toBe(DEFAULT_ICON);
  });
});
