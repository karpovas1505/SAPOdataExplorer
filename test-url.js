const url1 = "/sap/opu/odata/sap/ZAWP_MMS_SRV/KdtpSentPrintSet('')/$value";
const url2 = '/sap/opu/odata/sap/ZAWP_MMS_SRV/KdtpSentPrintSet(\'\')/$value';

console.log("URL1:", url1);
console.log("URL2:", url2);
console.log("JSON1:", JSON.stringify({url: url1}));
console.log("JSON2:", JSON.stringify({url: url2}));