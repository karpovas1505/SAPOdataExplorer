import { useQuery } from '@tanstack/react-query';
import { servicesApi } from '../services/api';

export const useServices = (search?: string) => {
  return useQuery({
    queryKey: ['services', search],
    queryFn: async () => {
      const response = await servicesApi.getServices(search);
      return response.data;
    },
  });
};

export const useServiceMetadata = (serviceName: string, version?: string) => {
  return useQuery({
    queryKey: ['metadata', serviceName, version],
    queryFn: async () => {
      const response = await servicesApi.getMetadata(serviceName, version);
      return response.data;
    },
    enabled: !!serviceName,
  });
};

export const useServiceEntities = (serviceName: string, version?: string) => {
  return useQuery({
    queryKey: ['entities', serviceName, version],
    queryFn: async () => {
      const response = await servicesApi.getEntities(serviceName, version);
      return response.data;
    },
    enabled: !!serviceName,
  });
};

export const useEntityFields = (serviceName: string, entityName: string, version?: string) => {
  return useQuery({
    queryKey: ['entityFields', serviceName, entityName, version],
    queryFn: async () => {
      const response = await servicesApi.getEntityFields(serviceName, entityName, version);
      return response.data;
    },
    enabled: !!serviceName && !!entityName,
  });
};
