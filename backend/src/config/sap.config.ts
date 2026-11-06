export const sapConfig = {
  get host() { return process.env.SAP_HOST || ''; },
  get port() { return parseInt(process.env.SAP_PORT || '8000'); },
  get username() { return process.env.SAP_USER || ''; },
  get password() { return process.env.SAP_PASSWORD || ''; },
  get client() { return process.env.SAP_CLIENT || '270'; },
  get baseUrl() { return `http://${process.env.SAP_HOST}:${process.env.SAP_PORT}`; },
  
  catalogService: '/sap/opu/odata/IWFND/CATALOGSERVICE;v=2',
};

export default sapConfig;
