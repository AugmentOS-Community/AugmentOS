import { getBatteryIcon, getBatteryColor } from '../src/logic/getBatteryIcon';

describe('getBatteryIcon', () => {
  it('returns "battery-full" for levels above 75', () => {
    expect(getBatteryIcon(100)).toBe('battery-full');
    expect(getBatteryIcon(76)).toBe('battery-full');
  });

  it('returns "battery-three-quarters" for levels above 50 and up to 75', () => {
    expect(getBatteryIcon(75)).toBe('battery-three-quarters');
    expect(getBatteryIcon(51)).toBe('battery-three-quarters');
  });

  it('returns "battery-half" for levels above 25 and up to 50', () => {
    expect(getBatteryIcon(50)).toBe('battery-half');
    expect(getBatteryIcon(26)).toBe('battery-half');
  });

  it('returns "battery-quarter" for levels above 10 and up to 25', () => {
    expect(getBatteryIcon(25)).toBe('battery-quarter');
    expect(getBatteryIcon(11)).toBe('battery-quarter');
  });

  it('returns "battery-empty" for levels 10 and below', () => {
    expect(getBatteryIcon(10)).toBe('battery-empty');
    expect(getBatteryIcon(0)).toBe('battery-empty');
  });
});

// Test the battery color thresholds

describe('getBatteryColor', () => {
  it('returns green for levels above 60', () => {
    expect(getBatteryColor(100)).toBe('#4CAF50');
    expect(getBatteryColor(61)).toBe('#4CAF50');
  });

  it('returns amber for levels above 20 up to 60', () => {
    expect(getBatteryColor(60)).toBe('#FFB300');
    expect(getBatteryColor(21)).toBe('#FFB300');
  });

  it('returns red for levels 20 and below', () => {
    expect(getBatteryColor(20)).toBe('#FF5722');
    expect(getBatteryColor(0)).toBe('#FF5722');
  });
});
