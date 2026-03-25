import { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Text,
  TextInput,
  Group,
  Stack,
  Badge,
  Alert,
  Loader,
  Box,
  ActionIcon,
  Tooltip,
  CopyButton,
  SegmentedControl,
  Select,
} from '@mantine/core';
import { IconPlayerPlay, IconCopy, IconFileTypePdf, IconAlertCircle, IconDownload } from '@tabler/icons-react';
import { servicesApi } from '../services/api';

interface PdfTesterProps {
  serviceName?: string;
  entities?: string[];
}

const METHOD_OPTIONS = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
];

export default function PdfTester({ serviceName, entities = [] }: PdfTesterProps) {
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState('GET');
  const [params, setParams] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [responseInfo, setResponseInfo] = useState<{ type: string; size: string } | null>(null);

  useEffect(() => {
    if (selectedEntity) {
      setUrl(`${selectedEntity}('')/$value`);
    }
  }, [selectedEntity]);

  const buildFullUrl = (): string => {
    if (!url) return '';
    
    let fullUrl: string;
    if (url.startsWith('http')) {
      fullUrl = url;
    } else if (url.startsWith('/sap/')) {
      fullUrl = url;
    } else if (serviceName) {
      fullUrl = `/sap/opu/odata/sap/${serviceName}/${url}`;
    } else {
      fullUrl = `/sap/opu/odata/sap${url}`;
    }
    
    if (params) {
      const paramStr = params.startsWith('?') ? params.slice(1) : params;
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + paramStr;
    }
    
    return fullUrl;
  };

  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);

  const handleGeneratePdf = async () => {
    if (!url) {
      setError('Please enter a URL');
      return;
    }

    setLoading(true);
    setError(null);
    setPdfUrl(null);
    setResponseInfo(null);
    setPendingBlob(null);

    try {
      const fullUrl = buildFullUrl();
      console.log('Generating PDF from:', fullUrl);

      const response = await servicesApi.testPdfRequest(fullUrl, method);
      
      const contentType = response.headers['content-type'] || 'application/pdf';
      const contentLength = response.headers['content-length'];
      
      let blob: Blob;
      const cleanContentType = contentType.split(';')[0].trim();
      if (response.data instanceof Blob) {
        blob = response.data;
      } else {
        blob = new Blob([response.data], { type: cleanContentType });
      }

      const sizeStr = contentLength ? `${Math.round(parseInt(contentLength) / 1024)} KB` : `${Math.round(blob.size / 1024)} KB`;
      setResponseInfo({ type: contentType, size: sizeStr });
      setPendingBlob(blob);
    } catch (err: any) {
      console.error('PDF generation error:', err);
      if (err.response?.status === 404) {
        setError('PDF not found. Check the URL and ensure the service is available.');
      } else if (err.response?.status === 401 || err.response?.status === 403) {
        setError('Authentication failed. Check SAP credentials.');
      } else if (err.response?.data) {
        const errorText = typeof err.response.data === 'string' 
          ? err.response.data.slice(0, 500) 
          : JSON.stringify(err.response.data, null, 2).slice(0, 500);
        setError(errorText);
      } else {
        setError(err.message || 'Failed to generate PDF');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLoadPdf = () => {
    if (!pendingBlob) return;
    const objectUrl = URL.createObjectURL(pendingBlob);
    setPdfUrl(objectUrl);
  };

  const handleDownload = () => {
    if (!pdfUrl) return;
    
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `output_${Date.now()}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fullUrl = buildFullUrl();

  return (
    <Stack gap="md">
      <Card withBorder p="md">
        <Group justify="space-between" mb="md">
          <Group gap="xs">
            <IconFileTypePdf size={24} color="#e74c3c" />
            <Text fw={600} size="lg">PDF Print Form Tester</Text>
          </Group>
        </Group>

        <Stack gap="md">
          {entities.length > 0 && (
            <Select
              label="Entity (for media/stream)"
              placeholder="Select entity..."
              data={entities.map((e) => ({ value: e, label: e }))}
              value={selectedEntity}
              onChange={setSelectedEntity}
              searchable
              clearable
              description="Select an entity to auto-fill URL with /$value"
            />
          )}
          
          <Group align="flex-end" gap="sm">
            <SegmentedControl
              value={method}
              onChange={setMethod}
              data={METHOD_OPTIONS}
              size="sm"
            />
            <TextInput
              label="URL"
              placeholder="Entity(key)/$value"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              style={{ flex: 1 }}
              description={
                serviceName 
                  ? `Base: /sap/opu/odata/sap/${serviceName}/` 
                  : 'Use Entity(key)/$value for media streams'
              }
            />
          </Group>

          <TextInput
            label="Query Parameters (optional)"
            placeholder="param1=value1&param2=value2"
            value={params}
            onChange={(e) => setParams(e.target.value)}
            description="Additional query parameters for the request"
          />

          <Box p="xs" style={{ backgroundColor: 'var(--mantine-color-gray-1)', borderRadius: 4 }}>
            <Group justify="space-between">
              <Text size="xs" c="dimmed" ff="monospace" style={{ wordBreak: 'break-all' }}>
                {fullUrl || 'URL will be built here...'}
              </Text>
              <CopyButton value={fullUrl}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Copied!' : 'Copy URL'}>
                    <ActionIcon size="sm" variant="subtle" onClick={copy}>
                      <IconCopy size={14} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
          </Box>

          <Button
            leftSection={loading ? <Loader size={16} color="white" /> : <IconPlayerPlay size={16} />}
            onClick={handleGeneratePdf}
            disabled={loading || !url}
            color="red"
            fullWidth
          >
            {loading ? 'Generating PDF...' : 'Generate PDF'}
          </Button>
        </Stack>
      </Card>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {responseInfo && pendingBlob && !pdfUrl && (
        <Card withBorder p="md">
          <Group justify="space-between" mb="md">
            <Group gap="xs">
              <Badge color="green" size="lg">Ready</Badge>
              <Text size="sm" c="dimmed">
                Content-Type: {responseInfo.type} | Size: {responseInfo.size}
              </Text>
            </Group>
            <Button leftSection={<IconPlayerPlay size={16} />} size="sm" onClick={handleLoadPdf}>
              Load PDF
            </Button>
          </Group>
          <Text c="dimmed" size="sm">
            Click "Load PDF" to preview or download
          </Text>
        </Card>
      )}

      {pdfUrl && (
        <Card withBorder p="md">
          <Group justify="space-between" mb="md">
            <Group gap="xs">
              <Badge color="green" size="lg">Preview</Badge>
              <Text size="sm" c="dimmed">
                {responseInfo?.type} | {responseInfo?.size}
              </Text>
            </Group>
            <Button leftSection={<IconDownload size={16} />} size="sm" onClick={handleDownload}>
              Download
            </Button>
          </Group>

          <Box style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 4, overflow: 'hidden', height: '70vh' }}>
            <object
              data={pdfUrl}
              type="application/pdf"
              style={{ width: '100%', height: '100%' }}
            >
              <Text c="dimmed">Your browser does not support PDF preview. Click Download to save the file.</Text>
            </object>
          </Box>
        </Card>
      )}

      {!pdfUrl && !error && !loading && (
        <Card withBorder p="xl" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
          <Stack align="center" gap="sm">
            <IconFileTypePdf size={48} color="var(--mantine-color-gray-5)" />
            <Text c="dimmed" ta="center">
              Enter a SAP OData URL to generate and preview a PDF document.
              <br />
              The PDF will be displayed in the browser after generation.
            </Text>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
