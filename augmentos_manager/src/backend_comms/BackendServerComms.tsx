// backend_comms/BackendServerComms.ts
import axios, { AxiosRequestConfig } from 'axios';
import { Config } from 'react-native-config';

interface Callback {
  onSuccess: (data: any) => void;
  onFailure: (errorCode: number) => void;
}

export default class BackendServerComms {
  private static instance: BackendServerComms;
  private TAG = 'MXT2_BackendServerComms';
  private serverUrl;

  public getServerUrl(): string {
    const secure = Config.AUGMENTOS_SECURE === 'true';
    const host = Config.AUGMENTOS_HOST;
    const port = Config.AUGMENTOS_PORT;
    const protocol = secure ? 'https' : 'http';
    const serverUrl = `${protocol}://${host}:${port}`;
    console.log("Got a new server url: ");
    console.log(serverUrl);
    //console.log('React Native Config:', Config);
    //console.log("\n\n\n");
    return serverUrl;
  }

  private constructor() {
    this.serverUrl = this.getServerUrl();
  }

  public static getInstance(): BackendServerComms {
    if (!BackendServerComms.instance) {
      BackendServerComms.instance = new BackendServerComms();
    }
    return BackendServerComms.instance;
  }

  public async restRequest(endpoint: string, data: any, callback: Callback): Promise<void> {
    try {
      const url = this.serverUrl + endpoint;

      // Axios request configuration
      const config: AxiosRequestConfig = {
        method: data ? 'POST' : 'GET',
        url: url,
        headers: {
          'Content-Type': 'application/json',
        },
        ...(data && { data }),
      };

      // Make the request
      const response = await axios(config);

      if (response.status === 200) {
        const responseData = response.data;
        if (responseData) {
          callback.onSuccess(responseData);
        } else {
          callback.onFailure(-1);
        }
      } else {
        console.log(`${this.TAG}: Error - ${response.statusText}`);
        callback.onFailure(response.status);
      }
    } catch (error: any) {
      console.log(`${this.TAG}: Network Error -`, error.message || error);
      callback.onFailure(-1);
    }
  }
  
  /**
   * Send error report to backend server
   * @param reportData The error report data
   * @returns Promise resolving to the response data, or rejecting with an error
   */
  public async sendErrorReport(coreToken: string, reportData: any): Promise<any> {

    const url = `${this.serverUrl}/app/error-report`;
    console.log('Sending error report to:', url);

    const config: AxiosRequestConfig = {
      method: 'POST',
      url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${coreToken}`,
      },
      data: reportData,
    };

    try {
      const response = await axios(config);
      if (response.status === 200) {
        return response.data;
      } else {
        throw new Error(`Error sending report: ${response.statusText}`);
      }
    } catch (error: any) {
      console.error(`${this.TAG}: Error sending report -`, error.message || error);
      throw error;
    }
  }

  public async exchangeToken(supabaseToken: string): Promise<string> {
    const url = `${this.serverUrl}/auth/exchange-token`;
    const config: AxiosRequestConfig = {
      method: 'POST',
      url,
      headers: { 'Content-Type': 'application/json' },
      data: { supabaseToken },
    };

    try {
      const response = await axios(config);
      if (response.status === 200 && response.data) {
        console.log("GOT A RESPONSE!!!")
        console.log("\n\n");
        console.log(JSON.stringify(response.data));
        console.log("\n\n\n\n");
        return response.data.coreToken;
      } else {
        throw new Error(`Bad response: ${response.statusText}`);
      }
    } catch (err) {
      throw err;
    }
  }

  public async getTpaSettings(coreToken: string, tpaName: string): Promise<any> {
    const url = `${this.serverUrl}/tpasettings/${tpaName}`;
    console.log('Fetching TPA settings from:', url);

    const config: AxiosRequestConfig = {
      method: 'GET',
      url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${coreToken}`,
      },
    };

    try {
      const response = await axios(config);
      if (response.status === 200 && response.data) {
        console.log('Received TPA settings:', response.data);
        return response.data;
      } else {
        throw new Error(`Bad response: ${response.statusText}`);
      }
    } catch (error: any) {
      console.error('Error fetching TPA settings:', error.message || error);
      throw error;
    }
  }

  // New method to update a TPA setting on the server.
  public async updateTpaSetting(coreToken: string, tpaName: string, update: { key: string; value: any }): Promise<any> {
    const url = `${this.serverUrl}/tpasettings/${tpaName}`;
    console.log('Updating TPA settings via:', url);

    const config: AxiosRequestConfig = {
      method: 'POST',
      url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${coreToken}`,
      },
      data: update,
    };

    try {
      const response = await axios(config);
      if (response.status === 200 && response.data) {
        console.log('Updated TPA settings:', response.data);
        return response.data;
      } else {
        throw new Error(`Bad response: ${response.statusText}`);
      }
    } catch (error: any) {
      console.error('Error updating TPA settings:', error.message || error);
      throw error;
    }
  }
}
