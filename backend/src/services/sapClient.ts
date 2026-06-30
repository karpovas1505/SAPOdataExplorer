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

const logFilePath = path.join(process.cwd(), 'server.log');

const logToConsoleAndFile = (message: string) => {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  console.log(logEntry.trim());
  try {
    fs.appendFileSync(logFilePath, logEntry);
  } catch {}
};

const logErrorToConsoleAndFile = (message: string) => {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ERROR: ${message}\n`;
  console.error(logEntry.trim());
  try {
    fs.appendFileSync(logFilePath, logEntry);
  } catch {}
};

class SapClient {
  private client: AxiosInstance;
  private backendClient: AxiosInstance; // For ABAP source code from backend system
  private csrfToken: string | null = null;
  private csrfTokenUrl: string | null = null;
  private sessionCookies: string | null = null;

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

    // Backend client for ADT/ABAP source code
    this.backendClient = axios.create({
      baseURL: sapConfig.backendBaseUrl,
      auth: {
        username: sapConfig.username,
        password: sapConfig.password,
      },
      params: {
        'sap-client': sapConfig.backendClient,
      },
      headers: {
        'Content-Type': 'text/plain',
        'Accept': 'text/plain, application/abap',
      },
      withCredentials: false,
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

  async getServices(search?: string) {
    const url = `${sapConfig.catalogService}/ServiceCollection`;
    const response = await this.client.get(url);
    let services = response.data?.d?.results || [];
    

    
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
    const service = services.find((s: any) => {
      // Match by technical name, title, or external name
      return s.TechnicalServiceName === serviceName || 
             s.Title === serviceName || 
             s.ExternalName === serviceName;
    });
    
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

  async getClassMetadata(className: string): Promise<{ packageName: string; description: string; createdBy: string; createdAt: string; changedBy: string; changedAt: string }> {
    try {
      logToConsoleAndFile('\n========== CLASS METADATA REQUEST ==========');
      logToConsoleAndFile(`Class Name: ${className}`);

      // Get CSRF token
      const adtRootResponse = await this.backendClient.get('/sap/bc/adt/oo/classes', {
        headers: {
          'X-CSRF-Token': 'Fetch',
          'Accept': 'application/xml',
        },
        validateStatus: () => true,
      });

      const adtCsrfToken = adtRootResponse.headers['x-csrf-token'];
      const adtCookies = adtRootResponse.headers['set-cookie'];

      const url = `/sap/bc/adt/oo/classes/${className}`;
      logToConsoleAndFile(`Requesting metadata from: ${url}`);

      const headers: any = {
        'Accept': 'application/xml',
      };

      if (adtCsrfToken && adtCsrfToken !== 'required') {
        headers['X-CSRF-Token'] = adtCsrfToken;
      }

      if (adtCookies) {
        headers['Cookie'] = Array.isArray(adtCookies) ? adtCookies.join('; ') : adtCookies;
      }

      const response = await this.backendClient.get(url, {
        headers,
        responseType: 'text',
      });

      // Parse XML to extract package and other metadata
      const xml = response.data;
      logToConsoleAndFile(`XML Response (first 2000 chars): ${xml.substring(0, 2000)}`);
      
      // Extract package from packageRef element: <adtcore:packageRef ... adtcore:name="PACKAGENAME"/>
      const packageRefMatch = xml.match(/<[^>]*packageRef[^>]*[\w:]+name="([^"]+)"/);
      // Handle both namespaced and non-namespaced attributes for other fields
      const descriptionMatch = xml.match(/[\w:]+description="([^"]*)"/);
      const createdByMatch = xml.match(/[\w:]+createdBy="([^"]+)"/);
      const createdAtMatch = xml.match(/[\w:]+createdAt="([^"]+)"/);
      const changedByMatch = xml.match(/[\w:]+changedBy="([^"]+)"/);
      const changedAtMatch = xml.match(/[\w:]+changedAt="([^"]+)"/);

      const metadata = {
        packageName: packageRefMatch ? packageRefMatch[1] : 'Unknown',
        description: descriptionMatch ? descriptionMatch[1] : '',
        createdBy: createdByMatch ? createdByMatch[1] : '',
        createdAt: createdAtMatch ? createdAtMatch[1] : '',
        changedBy: changedByMatch ? changedByMatch[1] : '',
        changedAt: changedAtMatch ? changedAtMatch[1] : '',
      };

      logToConsoleAndFile(`Package: ${metadata.packageName}`);
      logToConsoleAndFile(`Description: ${metadata.description}`);
      logToConsoleAndFile('========================================\n');

      return metadata;
    } catch (error: any) {
      logErrorToConsoleAndFile(`Failed to get class metadata: ${error.message}`);
      return {
        packageName: 'Unknown',
        description: '',
        createdBy: '',
        createdAt: '',
        changedBy: '',
        changedAt: '',
      };
    }
  }

  async getPackageObjects(packageName: string): Promise<Array<{ name: string; type: string; description: string; uri: string }>> {
    try {
      logToConsoleAndFile('\n========== PACKAGE OBJECTS REQUEST ==========');
      logToConsoleAndFile(`Package Name: ${packageName}`);

      // Get CSRF token from ADT discovery endpoint (usually doesn't require token)
      const adtRootResponse = await this.backendClient.get('/sap/bc/adt/discovery', {
        headers: {
          'X-CSRF-Token': 'Fetch',
          'Accept': 'application/xml',
        },
        validateStatus: () => true,
      });

      const adtCsrfToken = adtRootResponse.headers['x-csrf-token'];
      const adtCookies = adtRootResponse.headers['set-cookie'];
      
      logToConsoleAndFile(`Token fetch response status: ${adtRootResponse.status}`);
      logToConsoleAndFile(`Token fetch headers: ${JSON.stringify(adtRootResponse.headers)}`);

      // Use the repository nodestructure endpoint (correct ADT API for package contents)
      const url = `/sap/bc/adt/repository/nodestructure?parent_name=${packageName}&parent_tech_name=${packageName}&parent_type=DEVC%2FK&withShortDescriptions=true`;
      logToConsoleAndFile(`Requesting package contents from: ${url}`);

      const headers: any = {
        'Accept': 'application/xml',
        'Content-Type': 'application/xml',
      };

      if (adtCsrfToken && adtCsrfToken !== 'required') {
        headers['X-CSRF-Token'] = adtCsrfToken;
      }

      if (adtCookies) {
        headers['Cookie'] = Array.isArray(adtCookies) ? adtCookies.join('; ') : adtCookies;
      }
      
      logToConsoleAndFile(`CSRF Token: ${adtCsrfToken || 'Not received'}`);
      logToConsoleAndFile(`Cookies: ${adtCookies ? 'Received' : 'Not received'}`);

      const response = await this.backendClient.post(url, '', {
        headers,
        responseType: 'text',
      });

      // Parse XML to extract package objects
      const xml = response.data;
      logToConsoleAndFile(`XML Response length: ${xml.length}`);
      logToConsoleAndFile(`XML First 2000 chars: ${xml.substring(0, 2000)}`);

      const objects: Array<{ name: string; type: string; description: string; uri: string }> = [];
      
      // Parse SEU_ADT_REPOSITORY_OBJ_NODE elements from the XML (ADT repository nodestructure format)
      // Format: <SEU_ADT_REPOSITORY_OBJ_NODE><OBJECT_TYPE>TABL/DT</OBJECT_TYPE><OBJECT_NAME>NAME</OBJECT_NAME>...</SEU_ADT_REPOSITORY_OBJ_NODE>
      const nodeRegex = /<SEU_ADT_REPOSITORY_OBJ_NODE>(.*?)<\/SEU_ADT_REPOSITORY_OBJ_NODE>/gs;
      let nodeMatch;
      while ((nodeMatch = nodeRegex.exec(xml)) !== null) {
        const nodeContent = nodeMatch[1];
        
        const objectTypeMatch = nodeContent.match(/<OBJECT_TYPE>([^<]*)<\/OBJECT_TYPE>/);
        const objectNameMatch = nodeContent.match(/<OBJECT_NAME>([^<]*)<\/OBJECT_NAME>/);
        const objectUriMatch = nodeContent.match(/<OBJECT_URI>([^<]*)<\/OBJECT_URI>/);

        if (objectNameMatch && objectTypeMatch) {
          objects.push({
            name: objectNameMatch[1],
            type: objectTypeMatch[1],
            description: '',
            uri: objectUriMatch ? objectUriMatch[1] : '',
          });
        }
      }

      logToConsoleAndFile(`Found ${objects.length} objects in package`);
      logToConsoleAndFile('========================================\n');

      return objects;
    } catch (error: any) {
      logErrorToConsoleAndFile(`Failed to get package objects: ${error.message}`);
      if (error.response) {
        logErrorToConsoleAndFile(`Response status: ${error.response.status}`);
        logErrorToConsoleAndFile(`Response data: ${error.response.data}`);
        logErrorToConsoleAndFile(`Response headers: ${JSON.stringify(error.response.headers)}`);
      }
      throw new Error(`Failed to get package objects: ${error.message}`);
    }
  }

  async getObjectSource(objectName: string, objectType: string): Promise<{ sourceCode: string; metadata: { packageName: string; description: string; createdBy: string; createdAt: string; changedBy: string; changedAt: string } }> {
    try {
      logToConsoleAndFile('\n========== OBJECT SOURCE REQUEST ==========');
      logToConsoleAndFile(`Object Name: ${objectName}`);
      logToConsoleAndFile(`Object Type: ${objectType}`);
      logToConsoleAndFile(`Timestamp: ${new Date().toISOString()}`);

      // For tables, structures, data elements, domains - they don't have source code like classes
      // Return metadata and description instead
      if (objectType.startsWith('TABL/') || objectType.startsWith('DTEL/') || 
          objectType.startsWith('DOMA/') || objectType.startsWith('TTYP/')) {
        logToConsoleAndFile(`Object type ${objectType} does not have source code, returning metadata only`);
        
        const metadata = await this.getObjectMetadata(objectName, objectType);
        
        // Create a description text for these object types
        let description = `Object: ${objectName}\n`;
        description += `Type: ${objectType}\n`;
        description += `Package: ${metadata.packageName}\n`;
        if (metadata.description) {
          description += `Description: ${metadata.description}\n`;
        }
        if (metadata.createdBy) {
          description += `Created By: ${metadata.createdBy} at ${metadata.createdAt}\n`;
        }
        if (metadata.changedBy) {
          description += `Changed By: ${metadata.changedBy} at ${metadata.changedAt}\n`;
        }
        description += '\nNote: This object type does not have viewable source code in ADT.\n';
        description += 'Use SE11 in SAP GUI to view the full definition.';
        
        return {
          sourceCode: description,
          metadata,
        };
      }

      // For classes and function groups - get actual source code
      let url: string;
      let adtBasePath: string;
      
      switch (objectType) {
        case 'CLAS/OC':
        case 'CLAS':
          url = `/sap/bc/adt/oo/classes/${objectName}/source/main`;
          adtBasePath = '/sap/bc/adt/oo/classes';
          break;
        case 'FUGR/F':
        case 'FUGR':
          url = `/sap/bc/adt/functions/groups/${objectName}/source/main`;
          adtBasePath = '/sap/bc/adt/functions/groups';
          break;
        default:
          // Fallback to class endpoint for unknown types
          url = `/sap/bc/adt/oo/classes/${objectName}/source/main`;
          adtBasePath = '/sap/bc/adt/oo/classes';
      }

      // Step 1: Get CSRF token
      logToConsoleAndFile('\nStep 1: Getting ADT CSRF token...');
      const adtRootResponse = await this.backendClient.get(adtBasePath, {
        headers: {
          'X-CSRF-Token': 'Fetch',
          'Accept': 'application/xml',
        },
        validateStatus: () => true,
      });

      const adtCsrfToken = adtRootResponse.headers['x-csrf-token'];
      const adtCookies = adtRootResponse.headers['set-cookie'];

      logToConsoleAndFile(`ADT CSRF Token: ${adtCsrfToken ? 'Received' : 'Not received'}`);
      logToConsoleAndFile(`ADT Cookies: ${adtCookies ? 'Received' : 'Not received'}`);

      logToConsoleAndFile(`\nStep 2: Requesting source code`);
      logToConsoleAndFile(`URL path: ${url}`);

      const headers: any = {
        'Accept': 'text/plain, application/abap',
        'Content-Type': 'text/plain',
      };

      if (adtCsrfToken && adtCsrfToken !== 'required') {
        headers['X-CSRF-Token'] = adtCsrfToken;
      }

      if (adtCookies) {
        headers['Cookie'] = Array.isArray(adtCookies) ? adtCookies.join('; ') : adtCookies;
      }

      const response = await this.backendClient.get(url, {
        headers,
        responseType: 'text',
      });

      logToConsoleAndFile(`\nResponse Status: ${response.status}`);
      logToConsoleAndFile(`Source Length: ${response.data?.length || 0}`);
      logToConsoleAndFile(`First 200 chars: ${response.data?.substring(0, 200)}`);
      logToConsoleAndFile('========================================\n');

      // Get metadata from the object URI if available
      const metadata = await this.getObjectMetadata(objectName, objectType);

      return {
        sourceCode: response.data || '',
        metadata,
      };
    } catch (error: any) {
      logErrorToConsoleAndFile('\n========== OBJECT SOURCE ERROR ==========');
      logErrorToConsoleAndFile(`Object Name: ${objectName}`);
      logErrorToConsoleAndFile(`Object Type: ${objectType}`);
      logErrorToConsoleAndFile(`Error Message: ${error.message}`);

      if (error.response) {
        logErrorToConsoleAndFile(`Response Status: ${error.response.status}`);
        logErrorToConsoleAndFile(`Response Data: ${error.response.data}`);
      }

      logErrorToConsoleAndFile('========================================\n');

      if (error.response?.status === 404) {
        throw new Error(`Object ${objectName} (${objectType}) not found or ADT is not enabled`);
      }

      throw new Error(`Failed to fetch object source: ${error.message}`);
    }
  }

  async getObjectMetadata(objectName: string, objectType: string): Promise<{ packageName: string; description: string; createdBy: string; createdAt: string; changedBy: string; changedAt: string }> {
    try {
      let url: string;
      
      switch (objectType) {
        case 'CLAS/OC':
        case 'CLAS':
          return await this.getClassMetadata(objectName);
        case 'FUGR/F':
        case 'FUGR':
          url = `/sap/bc/adt/functions/groups/${objectName}`;
          break;
        case 'TABL/DT':
        case 'TABL':
          url = `/sap/bc/adt/ddic/tables/${objectName}`;
          break;
        case 'TABL/DS':
          url = `/sap/bc/adt/ddic/structures/${objectName}`;
          break;
        case 'DTEL/DE':
        case 'DTEL':
          url = `/sap/bc/adt/ddic/dataelements/${objectName}`;
          break;
        case 'DOMA/DD':
        case 'DOMA':
          url = `/sap/bc/adt/ddic/domains/${objectName}`;
          break;
        default:
          url = `/sap/bc/adt/oo/classes/${objectName}`;
      }

      const response = await this.backendClient.get(url, {
        headers: {
          'Accept': 'application/xml',
        },
      });

      const xml = response.data;
      
      // Parse package from XML
      const packageMatch = xml.match(/<adtcore:packageRef[^>]*adtcore:name="([^"]+)"/);
      const packageName = packageMatch ? packageMatch[1] : 'Unknown';
      
      // Parse description
      const descMatch = xml.match(/adtcore:description="([^"]*)"/);
      const description = descMatch ? descMatch[1] : '';
      
      // Parse created/changed info
      const createdByMatch = xml.match(/adtcore:createdBy="([^"]*)"/);
      const createdAtMatch = xml.match(/adtcore:createdAt="([^"]*)"/);
      const changedByMatch = xml.match(/adtcore:changedBy="([^"]*)"/);
      const changedAtMatch = xml.match(/adtcore:changedAt="([^"]*)"/);

      return {
        packageName,
        description,
        createdBy: createdByMatch ? createdByMatch[1] : '',
        createdAt: createdAtMatch ? createdAtMatch[1] : '',
        changedBy: changedByMatch ? changedByMatch[1] : '',
        changedAt: changedAtMatch ? changedAtMatch[1] : '',
      };
    } catch (error: any) {
      logErrorToConsoleAndFile(`Failed to get object metadata for ${objectName}: ${error.message}`);
      return {
        packageName: 'Unknown',
        description: '',
        createdBy: '',
        createdAt: '',
        changedBy: '',
        changedAt: '',
      };
    }
  }

  async getAbapSourceCode(className: string): Promise<{ sourceCode: string; metadata: { packageName: string; description: string; createdBy: string; createdAt: string; changedBy: string; changedAt: string } }> {
    // Delegate to the new generic method for backward compatibility
    return this.getObjectSource(className, 'CLAS');
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
