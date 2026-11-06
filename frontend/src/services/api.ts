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

  testRequest: (data: TestRequest) =>
    api.post<TestResponse>('/test', data),

  testPdfRequest: async (url: string, method: string = 'GET', params?: Record<string, string>) => {
    const response = await api.post('/pdf', { url, method, params });
    return response;
  },
};

export default api;
