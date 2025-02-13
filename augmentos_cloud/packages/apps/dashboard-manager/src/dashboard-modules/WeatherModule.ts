import axios from 'axios';

export interface WeatherSummary {
  condition: string;
  avg_temp_f: number;
}

export class WeatherModule {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string) {
    // Use the provided API key or fallback to the default one.
    this.apiKey = apiKey || '';
    this.baseUrl = 'http://api.weatherapi.com/v1';
  }

  /**
   * Given a latitude and longitude, fetch the current day's forecast.
   * Returns a WeatherSummary object with the weather condition and average temperature.
   */
  public async fetchWeatherForecast(latitude: number, longitude: number): Promise<WeatherSummary | null> {
    const url = `${this.baseUrl}/forecast.json?key=${this.apiKey}&q=${latitude},${longitude}&days=1&aqi=no&alerts=no`;
    try {
      const response = await axios.get(url);
      const data = response.data;
      if (!data || !data.forecast || !data.forecast.forecastday || !data.forecast.forecastday[0]) {
        console.error('Unexpected weather API response structure:', data);
        return null;
      }
      const dayForecast = data.forecast.forecastday[0].day;
      const summary: WeatherSummary = {
        condition: dayForecast.condition.text,
        avg_temp_f: dayForecast.avgtemp_f,
      };
      return summary;
    } catch (error) {
      console.error('Error fetching weather forecast:', error);
      return null;
    }
  }
}
