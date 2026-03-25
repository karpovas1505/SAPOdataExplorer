import { useState } from 'react';

const buildODataUrl = (serviceName: string, path: string = ''): string => {
  if (serviceName.startsWith('IWFND/') || serviceName.startsWith('IWBEP/')) {
    return `/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/${path}`;
  }
  return `/sap/opu/odata/sap/${serviceName}/${path}`;
};

import {
  Card,
  TextInput,
  Button,
  Text,
  Alert,
  Loader,
  Grid,
  Table,
  Select,
  Badge,
  Group,
  Stack,
  Box,
  Title,
} from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import { servicesApi } from '../services/api';

interface FunctionImportParam {
  name: string;
  type: string;
  mode?: string;
}

interface FunctionImport {
  name: string;
  returnType?: string;
  parameters: FunctionImportParam[];
}

interface FunctionImportTesterProps {
  serviceName: string;
  serviceVersion?: string;
  functionImports?: FunctionImport[];
}

const formatODataValue = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' && value.match(/^\/Date\(\d+\)\/$/)) {
    const timestamp = parseInt((value.match(/\d+/) || [])[0]);
    const date = new Date(timestamp);
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const FunctionImportTester = ({ serviceName, serviceVersion, functionImports = [] }: FunctionImportTesterProps) => {
  const [selectedFunction, setSelectedFunction] = useState<string | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedFuncData = functionImports.find((f) => f.name === selectedFunction);

  const handleFunctionChange = (funcName: string | null) => {
    setSelectedFunction(funcName);
    setParamValues({});
    setResponse(null);
    setError(null);
  };

  const handleParamChange = (paramName: string, value: string) => {
    setParamValues((prev) => ({ ...prev, [paramName]: value }));
  };

  const handleExecute = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const params: string[] = [];
      selectedFuncData?.parameters.forEach((param) => {
        const value = paramValues[param.name];
        if (value && value.trim() !== '') {
          params.push(`${param.name}=${encodeURIComponent(value)}`);
        }
      });
      const url = `/${serviceName}/${selectedFunction}${params.length > 0 ? '?' + params.join('&') : ''}`;
      const result = await servicesApi.testRequest({
        method: 'GET',
        url,
      });
      setResponse(result.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Request failed');
      if (err.response?.data?.details) {
        setResponse(err.response.data.details);
      }
    } finally {
      setLoading(false);
    }
  };

  const renderTableFromData = (data: any) => {
    if (!data) return null;
    let items = data;
    if (data.d?.results) {
      items = data.d.results;
    } else if (data.d) {
      items = [data.d];
    }
    if (!Array.isArray(items)) {
      items = [items];
    }
    if (items.length === 0) {
      return <Alert color="blue">No data returned</Alert>;
    }
    const allKeys = new Set<string>();
    items.forEach((item: any) => {
      if (typeof item === 'object' && item !== null) {
        Object.keys(item).forEach((key) => {
          if (!key.startsWith('__')) {
            allKeys.add(key);
          }
        });
      }
    });
    const columns = Array.from(allKeys);

    return (
      <Table striped highlightOnHover withTableBorder style={{ maxHeight: 400 }}>
        <Table.Thead style={{ position: 'sticky', top: 0, background: 'white' }}>
          <Table.Tr>
            {columns.map((col) => (
              <Table.Th key={col} style={{ backgroundColor: 'var(--mantine-color-blue-6)', color: 'white' }}>
                {col}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item: any, idx: number) => (
            <Table.Tr key={idx}>
              {columns.map((col) => {
                const value = item[col];
                const displayValue = formatODataValue(value);
                const isDate = typeof value === 'string' && value.match(/^\/Date\(\d+\)\/$/);
                return (
                  <Table.Td
                    key={col}
                    style={{
                      maxWidth: 300,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: isDate ? 'var(--mantine-color-green-7)' : undefined,
                      fontFamily: isDate ? 'monospace' : undefined,
                    }}
                    title={displayValue}
                  >
                    {displayValue}
                  </Table.Td>
                );
              })}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    );
  };

  const buildPreviewUrl = () => {
    const params: string[] = [];
    selectedFuncData?.parameters.forEach((param) => {
      const value = paramValues[param.name];
      if (value && value.trim() !== '') {
        params.push(`${param.name}=${value}`);
      }
    });
    const path = `${selectedFunction}${params.length > 0 ? '?' + params.join('&') : ''}`;
    const baseUrl = buildODataUrl(serviceName, path);
    return baseUrl;
  };

  return (
    <Stack gap="md">
      <Card withBorder p="md">
        <Grid>
          <Grid.Col span={{ base: 12, sm: selectedFuncData?.parameters?.length ? 4 : 10 }}>
            <Select
              label="Function Import"
              placeholder="Select a function..."
              data={functionImports.map((f) => ({ value: f.name, label: f.name }))}
              value={selectedFunction}
              onChange={handleFunctionChange}
              searchable
              clearable
            />
            {selectedFuncData?.returnType && (
              <Badge color="blue" mt="xs">
                Returns: {selectedFuncData.returnType.split('.').pop() || selectedFuncData.returnType}
              </Badge>
            )}
          </Grid.Col>

          {selectedFuncData?.parameters && selectedFuncData.parameters.length > 0 && (
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Text size="sm" c="dimmed" mb="xs">
                Parameters ({selectedFuncData.parameters.length}):
              </Text>
              <Stack gap="xs">
                {selectedFuncData.parameters.map((param) => (
                  <TextInput
                    key={param.name}
                    label={`${param.name} (${param.type})`}
                    value={paramValues[param.name] || ''}
                    onChange={(e) => handleParamChange(param.name, e.target.value)}
                    placeholder={`Enter ${param.name}...`}
                    description={param.mode && param.mode !== 'in' ? `Mode: ${param.mode}` : undefined}
                  />
                ))}
              </Stack>
            </Grid.Col>
          )}

          <Grid.Col span={{ base: 12, sm: 2 }}>
            <Button
              fullWidth
              leftSection={loading ? <Loader size={16} color="white" /> : <IconPlayerPlay size={16} />}
              onClick={handleExecute}
              disabled={loading || !selectedFunction}
              mt="xl"
            >
              Execute
            </Button>
          </Grid.Col>
        </Grid>

        {selectedFunction && (
          <Box mt="md" p="sm" style={{ backgroundColor: 'var(--mantine-color-gray-1)', borderRadius: 4 }}>
            <Text size="xs" c="dimmed">URL Preview:</Text>
            <Text size="xs" ff="monospace">{buildPreviewUrl()}</Text>
          </Box>
        )}
      </Card>

      {error && <Alert color="red">{error}</Alert>}

      {response && (
        <Box>
          <Title order={5} mb="sm">Results</Title>
          {renderTableFromData(response.response || response)}
        </Box>
      )}
    </Stack>
  );
};

export default FunctionImportTester;
