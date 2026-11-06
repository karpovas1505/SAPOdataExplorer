import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envLocalPath = path.join(__dirname, '../../.env.local');
const envPath = path.join(__dirname, '../../.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config({ path: envPath });
}

import sapConfig from '../config/sap.config';

class SapClient {
  private static readonly SERVICES_CACHE_TTL_MS = 5 * 60 * 1000;

  private client: AxiosInstance;
  private csrfToken: string | null = null;
  private csrfTokenUrl: string | null = null;
  private sessionCookies: string | null = null;
  private servicesCache: any[] | null = null;
  private servicesCacheAt = 0;
  private servicesRequest: Promise<any[]> | null = null;

  constructor() {
    // Gateway client for OData services
    this.client = axios.create({
      baseURL: sapConfig.baseUrl,
      auth: {
        username: sapConfig.username,
        password: sapConfig.password,
      },
      params: {
        'sap-client': sapConfig.client,
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      // Enable credentials to maintain session
      withCredentials: true,
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        // Capture Set-Cookie headers
        const setCookie = response.headers['set-cookie'];
        if (setCookie && setCookie.length > 0) {
          this.sessionCookies = setCookie.join('; ');
          console.log('Session cookies captured:', this.sessionCookies ? 'Yes' : 'No');
        }
        return response;
      },
      (error) => {
        console.error('SAP Request Error:', error.message);
        if (error.response) {
          console.error('Response Status:', error.response.status);
          console.error('Response Data:', error.response.data);
        }
        return Promise.reject(error);
      }
    );
  }

  private async fetchCsrfToken(url: string): Promise<string> {
    try {
      // Extract service root URL from the request URL
      // For: /sap/opu/odata/sap/ZGW_SAMPLE_SRV/FlightCollection
      // We need: /sap/opu/odata/sap/ZGW_SAMPLE_SRV/
      
      // Handle catalog service URLs like /sap/opu/odata/IWFND/CATALOGSERVICE;v=2/...
      if (url.includes('/IWFND/CATALOGSERVICE') || url.includes('/IWBEP/')) {
        const urlBase = url.split('?')[0];
        // Match with version like ;v=2 or without version
        const catalogMatch = urlBase.match(/^(\/sap\/opu\/odata\/IWFND\/CATALOGSERVICE(;v=\d+)?)/i);
        if (catalogMatch) {
          let serviceUrl = catalogMatch[1];
          // Add trailing slash if not present
          if (!serviceUrl.endsWith('/')) {
            serviceUrl += '/';
          }
          console.log('Fetching CSRF token from catalog service:', serviceUrl);
          this.csrfTokenUrl = serviceUrl;
          const response = await this.client.get(serviceUrl, {
            headers: {
              'X-CSRF-Token': 'Fetch',
              'Accept': 'application/json',
              ...(this.sessionCookies ? { 'Cookie': this.sessionCookies } : {}),
            },
            maxRedirects: 0,
          });
          const token = response.headers['x-csrf-token'] || response.headers['X-CSRF-Token'];
          console.log('CSRF token received:', token ? 'Yes (length: ' + token.length + ')' : 'No');
          if (token && token !== 'required') {
            this.csrfToken = token;
            return token;
          }
          throw new Error('CSRF token not received in response headers');
        }
      }
      
      const urlParts = url.split('?')[0].split('/').filter(p => p);
      const sapIndices = urlParts
        .map((p, idx) => p.toLowerCase() === 'sap' ? idx : -1)
        .filter(idx => idx !== -1);
      
      let serviceUrl = url;
      if (sapIndices.length >= 2) {
        // Build service root URL
        const serviceName = urlParts[sapIndices[1] + 1];
        serviceUrl = `/sap/opu/odata/sap/${serviceName}/`;
      }
      
      console.log('Fetching CSRF token from:', serviceUrl);
      this.csrfTokenUrl = serviceUrl;
      
      // Get CSRF token from the service root
      const response = await this.client.get(serviceUrl, {
        headers: {
          'X-CSRF-Token': 'Fetch',
          'Accept': 'application/json',
          ...(this.sessionCookies ? { 'Cookie': this.sessionCookies } : {}),
        },
        maxRedirects: 0,
      });
      
      // SAP returns CSRF token in lowercase header
      const token = response.headers['x-csrf-token'] || response.headers['X-CSRF-Token'];
      console.log('CSRF token received:', token ? 'Yes (length: ' + token.length + ')' : 'No');
      console.log('Cookies after token fetch:', this.sessionCookies ? 'Present' : 'None');
      
      if (token && token !== 'required') {
        this.csrfToken = token;
        return token;
      }
      
      throw new Error('CSRF token not received in response headers');
    } catch (error: any) {
      console.error('Failed to fetch CSRF token:', error.message);
      
      let errorMessage = error.message;
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', typeof error.response.data === 'object' 
          ? JSON.stringify(error.response.data, null, 2) 
          : error.response.data);
        errorMessage = `Status ${error.response.status}: ${typeof error.response.data === 'object' 
          ? JSON.stringify(error.response.data) 
          : error.response.data}`;
      }
      
      throw new Error(`Failed to fetch CSRF token: ${errorMessage}`);
    }
  }

  private async loadServices(forceRefresh = false): Promise<any[]> {
    const now = Date.now();
    const cacheIsFresh =
      this.servicesCache !== null &&
      now - this.servicesCacheAt < SapClient.SERVICES_CACHE_TTL_MS;

    if (!forceRefresh && cacheIsFresh) {
      return this.servicesCache as any[];
    }

    if (!forceRefresh && this.servicesRequest) {
      return this.servicesRequest;
    }

    const request = this.client
      .get(`${sapConfig.catalogService}/ServiceCollection`)
      .then((response) => {
        const services = response.data?.d?.results;
        const result = Array.isArray(services) ? services : [];
        this.servicesCache = result;
        this.servicesCacheAt = Date.now();
        return result;
      });

    this.servicesRequest = request;

    try {
      return await request;
    } finally {
      if (this.servicesRequest === request) {
        this.servicesRequest = null;
      }
    }
  }

  invalidateServicesCache(): void {
    this.servicesCache = null;
    this.servicesCacheAt = 0;
  }

  async getServices(search?: string, forceRefresh = false) {
    let services = await this.loadServices(forceRefresh);

    // Filter only custom services (starting with Z or z, or /IWFND/)
    services = services.filter((service: any) => {
      const name = service.TechnicalServiceName || '';
      return name.toUpperCase().startsWith('Z') || name.toUpperCase().startsWith('/IWFND/');
    });
    
    // Client-side search filtering
    if (search && search.trim()) {
      const searchLower = search.toLowerCase().trim();
      services = services.filter((service: any) => {
        const name = (service.TechnicalServiceName || '').toLowerCase();
        const description = (service.Description || '').toLowerCase();
        const namespace = (service.Namespace || '').toLowerCase();
        return name.includes(searchLower) || 
               description.includes(searchLower) || 
               namespace.includes(searchLower);
      });
    }
    
    return services;
  }

  async getServiceMetadata(serviceName: string, version?: string) {
    const services = await this.getServices();
    const matches = services.filter((s: any) => {
      // Match by technical name, title, or external name
      return s.TechnicalServiceName === serviceName || 
             s.Title === serviceName || 
             s.ExternalName === serviceName;
    });

    // Prefer the exact service version when several catalog entries share a name.
    const service = version
      ? matches.find((s: any) => String(s.TechnicalServiceVersion) === String(version)) ?? matches[0]
      : matches[0];
    
    if (!service || !service.MetadataUrl) {
      throw new Error(`Service "${serviceName}" not found or has no MetadataUrl`);
    }
    
    // Use the MetadataUrl directly
    let metadataUrl = service.MetadataUrl;
    
    // Ensure it ends with /$metadata
    if (!metadataUrl.endsWith('/$metadata')) {
      metadataUrl = metadataUrl.replace(/\/*$/, '/$metadata');
    }
    
    // Extract the relative path for axios
    // Handle both absolute URLs and relative paths
    const urlPath = metadataUrl.startsWith('http') 
      ? new URL(metadataUrl).pathname 
      : metadataUrl;
    
    const response = await this.client.get(urlPath, {
      params: { 'sap-client': sapConfig.client },
      headers: {
        'Accept': 'application/xml',
      },
      responseType: 'text',
    });
    return response.data;
  }

  async executeRawRequest(method: string, url: string, data?: any, config?: AxiosRequestConfig) {
    const methodLower = method.toLowerCase();
    const isModifyingOperation = ['post', 'put', 'patch', 'delete'].includes(methodLower);
    
    if (isModifyingOperation) {
      await this.fetchCsrfToken(url);
    }

    const requestConfig: AxiosRequestConfig = {
      method: methodLower as any,
      url,
      ...config,
      // Never follow redirects: otherwise a same-origin URL could redirect the
      // backend to an arbitrary host (SSRF bypass).
      maxRedirects: 0,
    };

    if (data && ['post', 'put', 'patch'].includes(methodLower)) {
      requestConfig.data = data;
    }

    if (isModifyingOperation && this.csrfToken) {
      requestConfig.headers = {
        'X-CSRF-Token': this.csrfToken,
        ...(this.sessionCookies ? { 'Cookie': this.sessionCookies } : {}),
        ...requestConfig.headers,
      };
    }

    try {
      console.log('Executing raw request:', method, url);
      const response = await this.client.request(requestConfig);
      return response;
    } catch (error: any) {
      console.error('Raw request failed:', error.message);
      throw error;
    }
  }

  async executeRequest(method: string, url: string, data?: any) {
    const methodLower = method.toLowerCase();
    const isModifyingOperation = ['post', 'put', 'patch', 'delete'].includes(methodLower);
    
    // For modifying operations, we need CSRF token
    if (isModifyingOperation) {
      // Always fetch a fresh token before modifying operations
      // This ensures the token is valid for this specific URL
      await this.fetchCsrfToken(url);
    }

    const config: AxiosRequestConfig = {
      method: methodLower as any,
      url,
      // See executeRawRequest: do not allow redirects to bypass URL validation.
      maxRedirects: 0,
    };

    if (data && ['post', 'put', 'patch'].includes(methodLower)) {
      config.data = data;
    }

    // Add CSRF token header for modifying operations
    if (isModifyingOperation && this.csrfToken) {
      config.headers = {
        'X-CSRF-Token': this.csrfToken,
        ...(this.sessionCookies ? { 'Cookie': this.sessionCookies } : {}),
      };
    }

    try {
      console.log('Executing request:', method, url);
      console.log('CSRF Token present:', this.csrfToken ? 'Yes' : 'No');
      
      const response = await this.client.request(config);
      return response.data;
    } catch (error: any) {
      console.error('Request failed:', error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
      }
      
      // Clear token on CSRF error
      if (error.response?.status === 403 && 
          (error.response?.data?.toString().includes('CSRF') || 
           error.response?.data?.error?.message?.value?.includes('CSRF'))) {
        console.log('Clearing CSRF token due to validation error');
        this.csrfToken = null;
        this.csrfTokenUrl = null;
      }
      
      throw error;
    }
  }
}

export default new SapClient();
