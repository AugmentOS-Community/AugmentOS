import axios from 'axios';

export interface WeatherSummary {
  condition: string;
  temp_f: number;
}

export class WeatherModule {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = "53394e85a9b325c2f46e7e097859a7b8";
    this.baseUrl = 'https://api.openweathermap.org';
  }

  /**
   * Fetch the current weather condition and temperature in Fahrenheit.
   */
  public async fetchWeatherForecast(latitude: number, longitude: number): Promise<WeatherSummary | null> {
    const url = `${this.baseUrl}/data/3.0/onecall?lat=${latitude}&lon=${longitude}&exclude=minutely,hourly,daily,alerts&units=imperial&appid=${this.apiKey}`;
    try {
      const response = await axios.get(url);
      const data = response.data;
      if (!data || !data.current || !data.current.weather || data.current.weather.length === 0) {
        console.error('Unexpected weather API response structure:', data);
        return null;
      }

      return {
        condition: data.current.weather[0].main,
        temp_f: Math.round(data.current.temp),
      };
    } catch (error) {
      console.error('Error fetching weather data:', error);
      return null;
    }
  }
}
