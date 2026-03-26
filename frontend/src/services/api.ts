import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface ODataService {
  id: string;
  name: string;
  displayName?: string;
  description: string;
  version: string;
  namespace: string;
  createdAt: string;
  lastModifiedAt: string;
}

export interface ServicesResponse {
  success: boolean;
  count: number;
  data: ODataService[];
}

export interface TestRequest {
  method: string;
  url: string;
  body?: any;
}

export interface TestResponse {
  success: boolean;
  method: string;
  url: string;
  response: any;
}

const normalizeServiceName = (name: string) => name;

export const servicesApi = {
  getServices: (search?: string) =>
    api.get<ServicesResponse>('/services', { params: { search } }),
  
  getMetadata: (serviceName: string, version?: string) =>
    api.get<string>(`/services/metadata`, {
      params: { serviceName: normalizeServiceName(serviceName), version },
      responseType: 'text',
    }),
  
  getEntities: (serviceName: string, version?: string) =>
    api.get(`/services/entities`, { params: { serviceName: normalizeServiceName(serviceName), version } }),
  
  getEntityFields: (serviceName: string, entityName: string, version?: string) =>
    api.get<{
      success: boolean;
      serviceName: string;
      entityName: string;
      fields: Array<{ name: string; type: string; nullable?: string; maxLength?: number }>;
    }>(`/services/entities/${entityName}/fields`, { params: { serviceName: normalizeServiceName(serviceName), version } }),

  getServiceDetails: (serviceName: string) =>
    api.get<{
      success: boolean;
      serviceName: string;
      technicalDetails: {
        serviceId: string;
        namespace: string;
        version: string;
        createdAt: string;
        lastModifiedAt: string;
      };
      abapClasses: {
        dataProvider: {
          name: string;
          description: string;
          methods: string[];
        };
        dataProviderExt: {
          name: string;
          altName: string;
          description: string;
          methods: string[];
          se80Link: string;
        };
        modelProvider: {
          name: string;
          description: string;
        };
        modelProviderExt: {
          name: string;
          description: string;
        };
      };
      se80Transaction: string;
      sapGatewayInfo: {
        serviceUrl: string;
        serviceVersion: string;
      };
    }>(`/services/${normalizeServiceName(serviceName)}/details`),

  getAbapSource: (serviceName: string, objectName: string, objectType?: string) =>
    api.get<{
      success: boolean;
      objectName: string;
      objectType: string;
      sourceCode: string;
      sourceLength: number;
      lines: number;
      metadata: {
        packageName: string;
        description: string;
        createdBy: string;
        createdAt: string;
        changedBy: string;
        changedAt: string;
      };
    }>(`/services/${normalizeServiceName(serviceName)}/abap-source/${objectName}${objectType ? `?type=${objectType}` : ''}`),

  testRequest: (data: TestRequest) =>
    api.post<TestResponse>('/test', data),

  testPdfRequest: async (url: string, method: string = 'GET', params?: Record<string, string>) => {
    const response = await api.post('/pdf', { url, method, params }, {
      responseType: 'blob',
    });
    return response;
  },

  getPackageObjects: (packageName: string) =>
    api.get<{
      success: boolean;
      packageName: string;
      count: number;
      objects: Array<{
        name: string;
        type: string;
        description: string;
        uri: string;
      }>;
    }>(`/package/${packageName}/objects`),
};

export default api;
