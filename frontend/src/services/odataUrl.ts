export const buildODataUrl = (serviceName: string, path: string = ''): string => {
  if (serviceName.startsWith('IWFND/') || serviceName.startsWith('IWBEP/')) {
    return `/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/${path}`;
  }
  if (serviceName === 'CATALOGSERVICE' || serviceName.toUpperCase() === 'CATALOGSERVICE') {
    return `/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/${path}`;
  }
  return `/sap/opu/odata/sap/${serviceName}/${path}`;
};
