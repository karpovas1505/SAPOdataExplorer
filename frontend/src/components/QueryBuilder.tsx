import { useState, useEffect, useCallback } from 'react';

const buildODataUrl = (serviceName: string, path: string = ''): string => {
  if (serviceName.startsWith('IWFND/') || serviceName.startsWith('IWBEP/')) {
    return `/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/${path}`;
  }
  return `/sap/opu/odata/sap/${serviceName}/${path}`;
};

import {
  Card,
  Select,
  Button,
  Text,
  Alert,
  Loader,
  Table,
  Group,
  Stack,
  TextInput,
  SegmentedControl,
  Badge,
  ActionIcon,
  Tooltip,
  Box,
  ScrollArea,
  SimpleGrid,
  CopyButton,
  Menu,
  Switch,
  Collapse,
  Modal,
} from '@mantine/core';
import { 
  IconFilter, 
  IconPlus, 
  IconHistory,
  IconCopy,
  IconChevronDown,
  IconX,
  IconPlayerPlay,
  IconMaximize,
} from '@tabler/icons-react';
import Editor from '@monaco-editor/react';
import { servicesApi } from '../services/api';
import FilterDialog from './FilterDialog';

interface QueryBuilderProps {
  serviceName: string;
  serviceVersion?: string;
  entities?: string[];
}

interface KeyField {
  name: string;
  value: string;
}

interface QueryHistory {
  id: number;
  method: string;
  url: string;
  timestamp: Date;
  status?: number;
}

const formatODataValue = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' && value.match(/^\/Date\(\d+\)\/$/)) {
    const match = value.match(/\d+/);
    if (!match) return value;
    const timestamp = parseInt(match[0]);
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

const QueryBuilder = ({ serviceName, serviceVersion, entities = [] }: QueryBuilderProps) => {
  const [method, setMethod] = useState('GET');
  const [queryMode, setQueryMode] = useState<'entityset' | 'entity'>('entityset');
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [keyFields, setKeyFields] = useState<KeyField[]>([{ name: '', value: '' }]);
  const [customPath, setCustomPath] = useState('');
  const [body, setBody] = useState('{}');
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [entityFields, setEntityFields] = useState<Array<{ name: string; type: string; nullable?: string }>>([]);
  const [recordCount, setRecordCount] = useState(0);
  const [resultView, setResultView] = useState<'table' | 'json' | 'raw'>('table');
  const [history, setHistory] = useState<QueryHistory[]>([]);
  const [quickOptionsOpen, setQuickOptionsOpen] = useState(false);
  const [top, setTop] = useState<string>('');
  const [skip, setSkip] = useState<string>('');
  const [orderby, setOrderby] = useState<string>('');
  const [select, setSelect] = useState<string>('');
  const [expand, setExpand] = useState<string>('');
  const [historyId, setHistoryId] = useState(0);
  const [fullscreenModalOpen, setFullscreenModalOpen] = useState(false);
  const [jsonEditorMode, setJsonEditorMode] = useState<'json' | 'form'>('json');
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (selectedEntity) {
      setCustomPath('');
      setTop('');
      setSkip('');
      setOrderby('');
      setSelect('');
      setExpand('');
      servicesApi
        .getEntityFields(serviceName, selectedEntity, serviceVersion)
        .then((res) => {
          const keyField = res.data.fields.find((f) => f.nullable === 'key');
          if (keyField && queryMode === 'entity') {
            setKeyFields([{ name: keyField.name, value: '' }]);
          }
          setEntityFields(res.data.fields);
          setFormValues({});
        })
        .catch(() => {
          setEntityFields([]);
        });
    }
  }, [selectedEntity, serviceName]);

  const handleFormFieldChange = (fieldName: string, value: string) => {
    setFormValues(prev => ({ ...prev, [fieldName]: value }));
  };

  const generateJsonFromForm = () => {
    const result: Record<string, any> = {};
    entityFields.forEach(field => {
      if (formValues[field.name] !== undefined && formValues[field.name] !== '') {
        result[field.name] = formValues[field.name];
      }
    });
    return JSON.stringify(result, null, 2);
  };

  const applyFormToJson = () => {
    setBody(generateJsonFromForm());
  };

  const buildKeyPath = useCallback((): string => {
    if (queryMode === 'entityset') return '';
    const validKeys = keyFields.filter((k) => k.value.trim());
    if (validKeys.length === 0) return '';
    if (validKeys.length === 1 && validKeys[0].name) {
      return `(${validKeys[0].name}='${validKeys[0].value}')`;
    }
    if (validKeys.length === 1 && !keyFields[0].name) {
      return `('${validKeys[0].value}')`;
    }
    const keyParts = validKeys.map((k) => `${k.name}='${k.value}'`);
    return `(${keyParts.join(',')})`;
  }, [keyFields, queryMode]);

  const buildQueryString = useCallback((): string => {
    const params: string[] = [];
    if (top) params.push(`$top=${top}`);
    if (skip) params.push(`$skip=${skip}`);
    if (orderby) params.push(`$orderby=${orderby}`);
    if (select) params.push(`$select=${select}`);
    if (expand) params.push(`$expand=${expand}`);
    if (customPath) {
      const customParams = customPath.startsWith('?') ? customPath.slice(1) : customPath;
      params.push(...customParams.split('&').filter(p => p));
    }
    return params.length > 0 ? '?' + params.join('&') : '';
  }, [top, skip, orderby, select, expand, customPath]);

  const handleAddKeyField = () => {
    setKeyFields([...keyFields, { name: '', value: '' }]);
  };

  const handleRemoveKeyField = (index: number) => {
    if (keyFields.length > 1) {
      setKeyFields(keyFields.filter((_, i) => i !== index));
    }
  };

  const handleKeyFieldChange = (index: number, field: 'name' | 'value', value: string) => {
    const updated = [...keyFields];
    updated[index][field] = value;
    setKeyFields(updated);
  };

  const handleApplyFilter = (filterString: string) => {
    setCustomPath(filterString.startsWith('?') ? filterString : '?' + filterString);
  };

  const handleClearFilter = () => {
    setCustomPath('');
  };

  const handleSend = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      let urlPath: string;
      const keyPath = buildKeyPath();
      const queryString = buildQueryString();

      if (selectedEntity) {
        urlPath = `/${serviceName}/${selectedEntity}${keyPath}${queryString}`;
      } else {
        throw new Error('Please select an entity');
      }

      // If in form mode, generate JSON from form values before sending
      const requestBody = ['POST', 'PUT', 'PATCH'].includes(method) 
        ? JSON.parse(jsonEditorMode === 'form' ? generateJsonFromForm() : body) 
        : undefined;

      const result = await servicesApi.testRequest({
        method,
        url: urlPath,
        body: requestBody,
      });

      setResponse(result.data);
      
      let items = result.data?.response || result.data;
      if (items?.d?.results) items = items.d.results;
      else if (items?.d) items = [items.d];
      if (!Array.isArray(items)) items = [items];
      setRecordCount(items.length);

      const newHistoryItem: QueryHistory = {
        id: historyId,
        method,
        url: urlPath,
        timestamp: new Date(),
        status: 200,
      };
      setHistoryId(prev => prev + 1);
      setHistory(prev => [newHistoryItem, ...prev].slice(0, 20));
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Request failed');
      
      const newHistoryItem: QueryHistory = {
        id: historyId,
        method,
        url: buildKeyPath() ? `/${serviceName}/${selectedEntity}${buildKeyPath()}${buildQueryString()}` : `/${serviceName}/${selectedEntity}${buildQueryString()}`,
        timestamp: new Date(),
        status: err.response?.status,
      };
      setHistoryId(prev => prev + 1);
      setHistory(prev => [newHistoryItem, ...prev].slice(0, 20));
      
      if (err.response?.data?.details) {
        setResponse(err.response.data.details);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadFromHistory = (item: QueryHistory) => {
    const urlParts = item.url.split('/');
    const entityName = urlParts[urlParts.indexOf(serviceName) + 1];
    const entity = entityName?.replace(/\(.*\)/, '').replace(/\?.*/, '');
    setSelectedEntity(entity || null);
    setMethod(item.method);
    
    if (item.url.includes('(')) {
      setQueryMode('entity');
      const match = item.url.match(/\(([^)]+)\)/);
      if (match) {
        const keyParts = match[1].split(',');
        const keys = keyParts.map((k: string) => {
          const [name, val] = k.split('=');
          return { name: name?.replace(/'/g, '') || '', value: val?.replace(/'/g, '') || '' };
        });
        setKeyFields(keys.length > 0 ? keys : [{ name: '', value: '' }]);
      }
    } else {
      setQueryMode('entityset');
    }
    
    const params = item.url.split('?')[1];
    if (params) {
      const paramsObj = new URLSearchParams(params);
      setTop(paramsObj.get('$top') || '');
      setSkip(paramsObj.get('$skip') || '');
      setOrderby(paramsObj.get('$orderby') || '');
      setSelect(paramsObj.get('$select') || '');
      setExpand(paramsObj.get('$expand') || '');
    }
  };

  const renderTableFromData = (data: any) => {
    if (!data) return null;
    
    if (data.error || data.message || (data.response && data.response.error)) {
      const errorMsg = data.error || data.message || data.response?.error;
      return (
        <Card withBorder padding="md" style={{ backgroundColor: 'var(--mantine-color-red-0)' }}>
          <Text fw={600} c="red" mb="xs">Error</Text>
          <ScrollArea.Autosize mah="40vh">
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, fontFamily: 'monospace' }}>
              {typeof errorMsg === 'object' ? JSON.stringify(errorMsg, null, 2) : errorMsg}
            </pre>
          </ScrollArea.Autosize>
        </Card>
      );
    }

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
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead style={{ position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
          <Table.Tr>
            {columns.map((col) => (
              <Table.Th key={col} style={{ backgroundColor: 'var(--mantine-color-blue-6)', color: 'white', whiteSpace: 'nowrap' }}>
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

  const renderResponse = () => {
    if (error && !response) {
      return (
        <Card withBorder padding="md" style={{ backgroundColor: 'var(--mantine-color-red-0)' }}>
          <Text fw={600} c="red" mb="xs">Error</Text>
          <ScrollArea.Autosize mah="40vh">
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, fontFamily: 'monospace' }}>
              {error}
            </pre>
          </ScrollArea.Autosize>
        </Card>
      );
    }
    
    if (!response) {
      return <Text c="dimmed" ta="center" py="xl">No response yet. Send a request to see results.</Text>;
    }

    const data = response.response || response;

    switch (resultView) {
      case 'table':
        return renderTableFromData(data);
      case 'json':
        return (
          <div style={{ height: '55vh' }}>
            <Editor
              height="100%"
              language="json"
              value={JSON.stringify(data, null, 2)}
              options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12 }}
            />
          </div>
        );
      case 'raw':
        return (
          <Card withBorder style={{ height: '100%' }} padding="md">
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12 }}>
              {typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data)}
            </pre>
          </Card>
        );
    }
  };

  const keyPath = buildKeyPath();
  const queryString = buildQueryString();
  const fullUrl = buildODataUrl(serviceName, `${selectedEntity || '...'}${keyPath}${queryString}`);

  const methodColors: Record<string, string> = {
    GET: 'green',
    POST: 'blue',
    PUT: 'orange',
    PATCH: 'yellow',
    DELETE: 'red',
  };

  return (
    <>
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        <Stack gap="md">
          <Card withBorder p="md">
            <Group justify="space-between" mb="md">
              <Text fw={600}>Request</Text>
              <Menu shadow="md" width={300} position="bottom-end">
                <Menu.Target>
                  <Button variant="subtle" size="xs" leftSection={<IconHistory size={14} />} rightSection={<IconChevronDown size={14} />}>
                    History ({history.length})
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {history.length === 0 ? (
                    <Menu.Item disabled>No history</Menu.Item>
                  ) : (
                    history.map((item) => (
                      <Menu.Item 
                        key={item.id} 
                        onClick={() => loadFromHistory(item)}
                        leftSection={<Badge size="xs" color={methodColors[item.method]}>{item.method}</Badge>}
                      >
                        <Text size="xs" truncate style={{ maxWidth: 200 }}>{item.url}</Text>
                        <Text size="xs" c="dimmed">{item.timestamp.toLocaleTimeString()} {item.status && `• ${item.status}`}</Text>
                      </Menu.Item>
                    ))
                  )}
                </Menu.Dropdown>
              </Menu>
            </Group>

            <Group mb="md">
              <Select
                value={method}
                onChange={(v) => setMethod(v || 'GET')}
                data={[
                  { value: 'GET', label: 'GET' },
                  { value: 'POST', label: 'POST' },
                  { value: 'PUT', label: 'PUT' },
                  { value: 'PATCH', label: 'PATCH' },
                  { value: 'DELETE', label: 'DELETE' },
                ]}
                style={{ width: 100 }}
                styles={{ input: { fontWeight: 600 } }}
              />
              <SegmentedControl
                value={queryMode}
                onChange={(v) => setQueryMode(v as 'entityset' | 'entity')}
                data={[
                  { value: 'entityset', label: 'Entity Set' },
                  { value: 'entity', label: 'Entity' },
                ]}
              />
            </Group>

            <Select
              label="Entity"
              placeholder="Select entity..."
              data={entities.map((e) => ({ value: e, label: e }))}
              value={selectedEntity}
              onChange={setSelectedEntity}
              searchable
              clearable
              mb="md"
            />

            {queryMode === 'entity' && selectedEntity && (
              <Box mb="md">
                <Group mb="xs">
                  <Text size="sm" fw={500}>Key</Text>
                  <Badge color={keyPath ? 'blue' : 'gray'} size="sm">{keyPath || '(none)'}</Badge>
                </Group>
                <Stack gap="xs">
                  {keyFields.map((kf, index) => (
                    <Group key={index} gap="xs" align="flex-end">
                      <Select
                        placeholder="Field"
                        value={kf.name}
                        onChange={(v) => handleKeyFieldChange(index, 'name', v || '')}
                        data={entityFields
                          .filter((f) => f.nullable === 'key')
                          .map((f) => ({ value: f.name, label: f.name }))}
                        clearable
                        style={{ width: 140 }}
                        size="xs"
                      />
                      <Text size="sm">=</Text>
                      <TextInput
                        placeholder="Value"
                        value={kf.value}
                        onChange={(e) => handleKeyFieldChange(index, 'value', e.target.value)}
                        style={{ flex: 1 }}
                        size="xs"
                      />
                      {keyFields.length > 1 && (
                        <ActionIcon color="red" variant="subtle" size="sm" onClick={() => handleRemoveKeyField(index)}>
                          <IconX size={14} />
                        </ActionIcon>
                      )}
                    </Group>
                  ))}
                </Stack>
                {keyFields.length > 0 && keyFields[keyFields.length - 1].name && (
                  <Button size="xs" variant="light" leftSection={<IconPlus size={12} />} onClick={handleAddKeyField} mt="xs">
                    Add Key
                  </Button>
                )}
              </Box>
            )}

            <Box mb="md">
              <Group justify="space-between" mb="xs">
                <Group gap="xs">
                  <Text size="sm" fw={500}>Quick Options</Text>
                  <Switch
                    size="xs"
                    checked={quickOptionsOpen}
                    onChange={(e) => setQuickOptionsOpen(e.currentTarget.checked)}
                    label={quickOptionsOpen ? 'Hide' : 'Show'}
                  />
                </Group>
                {selectedEntity && queryMode === 'entityset' && (
                  <Button variant="subtle" size="xs" leftSection={<IconFilter size={12} />} onClick={() => setFilterDialogOpen(true)}>
                    Filter Builder
                  </Button>
                )}
              </Group>
              <Collapse in={quickOptionsOpen}>
                <SimpleGrid cols={2} mb="xs">
                  <TextInput
                    label="$top"
                    placeholder="10"
                    value={top}
                    onChange={(e) => setTop(e.target.value)}
                    size="xs"
                  />
                  <TextInput
                    label="$skip"
                    placeholder="0"
                    value={skip}
                    onChange={(e) => setSkip(e.target.value)}
                    size="xs"
                  />
                  <TextInput
                    label="$orderby"
                    placeholder="Field desc"
                    value={orderby}
                    onChange={(e) => setOrderby(e.target.value)}
                    size="xs"
                  />
                  <TextInput
                    label="$select"
                    placeholder="Field1,Field2"
                    value={select}
                    onChange={(e) => setSelect(e.target.value)}
                    size="xs"
                  />
                  <TextInput
                    label="$expand"
                    placeholder="NavProp1,NavProp2"
                    value={expand}
                    onChange={(e) => setExpand(e.target.value)}
                    size="xs"
                  />
                </SimpleGrid>
              </Collapse>
            </Box>

            <Box p="xs" mb="md" style={{ backgroundColor: 'var(--mantine-color-gray-1)', borderRadius: 4 }}>
              <Group justify="space-between">
                <Text size="xs" c="dimmed" ff="monospace" style={{ wordBreak: 'break-all' }}>{fullUrl}</Text>
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

            {['POST', 'PUT', 'PATCH'].includes(method) && (
              <Box mb="md">
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={500}>Request Body</Text>
                  {entityFields.length > 0 && (
                    <SegmentedControl
                      size="xs"
                      value={jsonEditorMode}
                      onChange={(v) => setJsonEditorMode(v as 'json' | 'form')}
                      data={[
                        { value: 'json', label: 'JSON' },
                        { value: 'form', label: 'Form' },
                      ]}
                    />
                  )}
                </Group>
                
                {jsonEditorMode === 'json' ? (
                  <Card withBorder style={{ height: 120 }} padding={0}>
                    <Editor
                      height="100%"
                      language="json"
                      value={body}
                      onChange={(value) => setBody(value || '{}')}
                      options={{ minimap: { enabled: false }, fontSize: 11 }}
                    />
                  </Card>
                ) : (
                  <Card withBorder p="sm" style={{ maxHeight: 250, overflow: 'auto' }}>
                    {entityFields.filter(f => f.nullable !== 'key').length === 0 ? (
                      <Text c="dimmed" size="sm">No fields available</Text>
                    ) : (
                      <SimpleGrid cols={2}>
                        {entityFields
                          .filter(f => f.nullable !== 'key')
                          .map(field => (
                            <TextInput
                              key={field.name}
                              label={field.name}
                              placeholder={field.type}
                              value={formValues[field.name] || ''}
                              onChange={(e) => handleFormFieldChange(field.name, e.target.value)}
                              size="xs"
                            />
                          ))}
                      </SimpleGrid>
                    )}
                    <Button size="xs" mt="xs" onClick={applyFormToJson}>
                      Apply to JSON
                    </Button>
                  </Card>
                )}
              </Box>
            )}

            <Button
              leftSection={loading ? <Loader size={16} color="white" /> : <IconPlayerPlay size={16} />}
              onClick={handleSend}
              disabled={loading || !selectedEntity || (queryMode === 'entity' && !keyPath)}
              fullWidth
            >
              {loading ? 'Sending...' : 'Send Request'}
            </Button>
          </Card>
        </Stack>

        <Stack gap="md">
          <Card withBorder p="md" style={{ minHeight: 500 }}>
            <Group justify="space-between" mb="md">
              <Group gap="sm">
                <Text fw={600}>Response</Text>
                {recordCount > 0 && (
                  <Badge color="blue">{recordCount} records</Badge>
                )}
              </Group>
              <Group gap="xs">
                <SegmentedControl
                  size="xs"
                  value={resultView}
                  onChange={(v) => setResultView(v as 'table' | 'json' | 'raw')}
                  data={[
                    { value: 'table', label: 'Table' },
                    { value: 'json', label: 'JSON' },
                    { value: 'raw', label: 'Raw' },
                  ]}
                />
                {resultView === 'table' && recordCount > 0 && (
                  <Tooltip label="Open in fullscreen">
                    <ActionIcon variant="subtle" onClick={() => setFullscreenModalOpen(true)}>
                      <IconMaximize size={16} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
            </Group>
            
            <ScrollArea.Autosize mah="60vh">
              {renderResponse()}
            </ScrollArea.Autosize>
          </Card>
        </Stack>
      </SimpleGrid>

      <FilterDialog
        opened={filterDialogOpen}
        onClose={() => setFilterDialogOpen(false)}
        onApply={handleApplyFilter}
        onClear={handleClearFilter}
        serviceName={serviceName}
        serviceVersion={serviceVersion}
        entityName={selectedEntity || ''}
      />

      <Modal
        opened={fullscreenModalOpen}
        onClose={() => setFullscreenModalOpen(false)}
        title={
          <Group>
            <Text fw={600}>Results</Text>
            <Badge color="blue">{recordCount} records</Badge>
          </Group>
        }
        size="95%"
        centered
      >
        <ScrollArea.Autosize mah="75vh">
          {response && renderTableFromData(response.response || response)}
        </ScrollArea.Autosize>
      </Modal>
    </>
  );
};

export default QueryBuilder;
