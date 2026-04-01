import { useState, useEffect } from 'react';
import {
  Button,
  Title,
  Text,
  Card,
  Tabs,
  Badge,
  Alert,
  Loader,
  Accordion,
  Table,
  Group,
  Stack,
  Center,
  Box,
  SimpleGrid,
} from '@mantine/core';
import { IconArrowLeft, IconChevronDown, IconPackage, IconCode, IconFileTypePdf } from '@tabler/icons-react';
import Editor from '@monaco-editor/react';
import { ODataService } from '../services/api';
import {
  useServiceMetadata,
  useServiceEntities,
  useServiceDetails,
  useAbapSource,
} from '../hooks/useServices';
import EntityTester from './EntityTester';
import FunctionImportTester from './FunctionImportTester';
import PackageTreeInline from './PackageTreeInline';
import PdfTester from './PdfTester';

interface ServiceDetailProps {
  service: ODataService;
  onBack: () => void;
}

const formatXML = (xml: string): string => {
  if (!xml) return '';
  try {
    const PADDING = '  ';
    let formatted = '';
    let indent = 0;
    xml = xml.replace(/>\s*</g, '><');
    for (let i = 0; i < xml.length; i++) {
      const char = xml[i];
      const nextChar = xml[i + 1];
      if (char === '<' && nextChar === '/') {
        indent--;
        formatted += '\n' + PADDING.repeat(indent) + char;
      } else if (char === '<' && nextChar !== '?' && nextChar !== '!') {
        if (formatted && !formatted.endsWith('\n')) {
          formatted += '\n';
        }
        formatted += PADDING.repeat(indent) + char;
        const tagEnd = xml.indexOf('>', i);
        const tag = xml.substring(i, tagEnd + 1);
        if (!tag.endsWith('/>')) {
          indent++;
        }
      } else if (char === '>' && xml.substring(i - 1, i + 1) !== '/>') {
        formatted += char;
      } else {
        formatted += char;
      }
    }
    return formatted;
  } catch {
    return xml;
  }
};

interface SelectedObject {
  name: string;
  type: string;
}

const ServiceDetail = ({ service, onBack }: ServiceDetailProps) => {
  const [activeTab, setActiveTab] = useState<string | null>('metadata');
  const [selectedObject, setSelectedObject] = useState<SelectedObject | null>(null);
  const [packageName, setPackageName] = useState<string>('');
  const { data: metadata, isLoading: metaLoading, isError: metaError } = useServiceMetadata(service.name, service.version);
  const { data: entitiesData, isLoading: entLoading, isError: entError } = useServiceEntities(service.name, service.version);
  const { data: serviceDetails, isLoading: detailsLoading } = useServiceDetails(service.name);
  const { data: abapSource, isLoading: sourceLoading, isError: sourceError } = useAbapSource(
    service.name,
    selectedObject?.name || '',
    selectedObject?.type
  );

  const handleViewSource = (objectName: string, objectType: string = 'CLAS') => {
    setSelectedObject({ name: objectName, type: objectType });
  };

  const handleBackToClasses = () => {
    setSelectedObject(null);
  };

  // Save package name when DPC_EXT is loaded
  useEffect(() => {
    if (abapSource?.metadata?.packageName && abapSource.metadata.packageName !== 'Unknown') {
      setPackageName(abapSource.metadata.packageName);
    }
  }, [abapSource?.metadata?.packageName]);

  return (
    <Stack gap="md">
      <Group align="flex-start">
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={onBack}>
          Back
        </Button>
        <div>
          <Group gap="xs">
            <Title order={2}>{service.name}</Title>
            <Badge color="blue" size="lg">{service.version}</Badge>
          </Group>
          {service.description && (
            <Text c="dimmed" size="sm">{service.description}</Text>
          )}
        </div>
      </Group>

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="metadata">Metadata</Tabs.Tab>
          <Tabs.Tab value="datamodel">Data Model</Tabs.Tab>
          <Tabs.Tab value="test">Test Entities</Tabs.Tab>
          <Tabs.Tab value="testfn">Test Functions</Tabs.Tab>
          <Tabs.Tab value="pdf" leftSection={<IconFileTypePdf size={14} />}>PDF Tester</Tabs.Tab>
          <Tabs.Tab value="abap">ABAP Source</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="metadata" pt="md">
          {metaLoading && (
            <Center py="xl">
              <Loader size="lg" />
            </Center>
          )}
          {metaError && (
            <Alert color="red">
              Failed to load metadata. The service may require additional authentication.
            </Alert>
          )}
          {metadata && (
            <Card withBorder style={{ height: 600 }}>
              <Editor
                height="100%"
                language="xml"
                value={formatXML(metadata)}
                options={{
                  readOnly: true,
                  minimap: { enabled: true },
                  fontSize: 12,
                  wordWrap: 'on',
                  automaticLayout: true,
                }}
              />
            </Card>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="datamodel" pt="md">
          {entLoading ? (
            <Center py="xl">
              <Loader size="lg" />
            </Center>
          ) : entError ? (
            <Alert color="red">
              Failed to load data model. The service may require additional authentication.
            </Alert>
          ) : (
            <Stack gap="xl">
              {/* Entity Sets Section */}
              <Stack gap="md">
                <Title order={4}>Entity Sets ({entitiesData?.entities?.length || 0})</Title>
                <Accordion chevronPosition="right" variant="separated" multiple defaultValue={entitiesData?.entities?.[0]?.name ? [entitiesData.entities[0].name] : []}>
                  {entitiesData?.entities?.map((entity: any) => (
                    <Accordion.Item key={entity.name} value={entity.name}>
                      <Accordion.Control icon={<IconChevronDown size={16} />}>
                        <Group justify="space-between">
                          <Text fw={500}>{entity.name}</Text>
                          <Text size="sm" c="dimmed">
                            Type: {entity.entityType} | Fields: {entity.fields?.length || 0}
                          </Text>
                        </Group>
                      </Accordion.Control>
                      <Accordion.Panel>
                        {entity.fields && entity.fields.length > 0 ? (
                          <Table striped highlightOnHover withTableBorder>
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th>Field Name</Table.Th>
                                <Table.Th>Type</Table.Th>
                                <Table.Th>Attributes</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {entity.fields.map((field: any, idx: number) => (
                                <Table.Tr key={idx}>
                                  <Table.Td>{field.name}</Table.Td>
                                  <Table.Td>
                                    {field.maxLength ? `${field.type}(${field.maxLength})` : field.type}
                                  </Table.Td>
                                  <Table.Td>
                                    {field.nullable === 'key' && <Badge color="red" size="sm">Key</Badge>}
                                    {field.nullable === 'required' && <Badge color="orange" size="sm">Required</Badge>}
                                    {field.nullable === 'optional' && <Badge color="gray" size="sm">Optional</Badge>}
                                  </Table.Td>
                                </Table.Tr>
                              ))}
                            </Table.Tbody>
                          </Table>
                        ) : (
                          <Text c="dimmed">No fields defined</Text>
                        )}
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
                </Accordion>
                {(!entitiesData?.entities || entitiesData.entities.length === 0) && (
                  <Center py="xl">
                    <Text c="dimmed">No entity sets found</Text>
                  </Center>
                )}
              </Stack>

              <Box component="hr" style={{ border: 'none', borderTop: '1px solid var(--mantine-color-gray-3)' }} />

              {/* Function Imports Section */}
              <Stack gap="md">
                <Title order={4}>Function Imports ({entitiesData?.functionImports?.length || 0})</Title>
                <Accordion chevronPosition="right" variant="separated" multiple>
                  {entitiesData?.functionImports?.map((func: any) => (
                    <Accordion.Item key={func.name} value={func.name}>
                      <Accordion.Control>
                        <Group justify="space-between">
                          <Text fw={500}>{func.name}</Text>
                          <Text size="sm" c="dimmed">
                            {func.returnType && `Returns: ${func.returnType.split('.').pop()}`}
                            {func.returnType && func.parameters?.length > 0 && ' | '}
                            Parameters: {func.parameters?.length || 0}
                          </Text>
                        </Group>
                      </Accordion.Control>
                      <Accordion.Panel>
                        {func.returnType && (
                          <Group mb="sm">
                            <Text size="sm" fw={500}>Return Type:</Text>
                            <Badge color="green">{func.returnType.split('.').pop()}</Badge>
                          </Group>
                        )}
                        {func.parameters && func.parameters.length > 0 ? (
                          <Table striped highlightOnHover withTableBorder>
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th>Name</Table.Th>
                                <Table.Th>Type</Table.Th>
                                <Table.Th>Mode</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {func.parameters.map((param: any, idx: number) => (
                                <Table.Tr key={idx}>
                                  <Table.Td>{param.name}</Table.Td>
                                  <Table.Td>
                                    <Badge variant="light" color="blue">{param.type}</Badge>
                                  </Table.Td>
                                  <Table.Td>
                                    <Badge
                                      variant="light"
                                      color={
                                        param.mode === 'out' ? 'red' :
                                        param.mode === 'in/out' ? 'orange' : 'gray'
                                      }
                                    >
                                      {param.mode || 'in'}
                                    </Badge>
                                  </Table.Td>
                                </Table.Tr>
                              ))}
                            </Table.Tbody>
                          </Table>
                        ) : (
                          <Text c="dimmed">No parameters</Text>
                        )}
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
                </Accordion>
                {(!entitiesData?.functionImports || entitiesData.functionImports.length === 0) && (
                  <Center py="xl">
                    <Text c="dimmed">No function imports found</Text>
                  </Center>
                )}
              </Stack>
            </Stack>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="test" pt="md">
          <EntityTester
            serviceName={service.name}
            serviceVersion={service.version}
            entities={entitiesData?.entities?.map((e: any) => e.name) || []}
          />
        </Tabs.Panel>

        <Tabs.Panel value="testfn" pt="md">
          <FunctionImportTester
            serviceName={service.name}
            serviceVersion={service.version}
            functionImports={entitiesData?.functionImports || []}
          />
        </Tabs.Panel>

        <Tabs.Panel value="pdf" pt="md">
          <PdfTester
            serviceName={service.name}
            entities={entitiesData?.entities?.map((e: any) => e.name) || []}
          />
        </Tabs.Panel>

        <Tabs.Panel value="abap" pt="md">
          {detailsLoading ? (
            <Center py="xl">
              <Loader size="lg" />
            </Center>
          ) : serviceDetails?.abapClasses ? (
            <SimpleGrid cols={{ base: 1, lg: 4 }} spacing="md" style={{ height: 'calc(100vh - 250px)' }}>
              {/* Left panel - Package Tree */}
              <div style={{ height: '100%', minHeight: 500 }}>
                {packageName ? (
                  <PackageTreeInline
                    packageName={packageName}
                    onSelectObject={(objectName, objectType) => handleViewSource(objectName, objectType)}
                    selectedObject={selectedObject?.name}
                  />
                ) : (
                  <Card withBorder style={{ height: '100%' }}>
                    <Stack gap="md" justify="center" style={{ height: '100%' }}>
                      <Center>
                        <IconPackage size={48} color="var(--mantine-color-gray-4)" />
                      </Center>
                      <Text ta="center" c="dimmed">
                        Load the DPC_EXT class to view package contents
                      </Text>
                      <Center>
                        <Button 
                          onClick={() => handleViewSource(serviceDetails.abapClasses.dataProviderExt.name, 'CLAS')}
                          loading={sourceLoading}
                        >
                          Load Package
                        </Button>
                      </Center>
                    </Stack>
                  </Card>
                )}
              </div>

              {/* Right panel - Source Code */}
              <div style={{ height: '100%', minHeight: 500, gridColumn: 'span 3' }}>
                {selectedObject ? (
                  <Card withBorder style={{ height: '100%' }}>
                    <Stack gap="xs" style={{ height: '100%' }}>
                      <Group justify="space-between">
                        <Group gap="xs">
                          <IconCode size={20} />
                          <Text fw={600} ff="monospace">{selectedObject.name}</Text>
                          <Badge size="sm" color="blue">{selectedObject.type}</Badge>
                        </Group>
                        <Button 
                          variant="subtle" 
                          size="xs" 
                          onClick={handleBackToClasses}
                        >
                          Clear
                        </Button>
                      </Group>
                      
                      {sourceLoading ? (
                        <Center style={{ flex: 1 }}>
                          <Loader size="lg" />
                        </Center>
                      ) : sourceError ? (
                        <Alert color="red" style={{ flex: 1 }}>
                          <Stack gap="xs">
                            <Text fw={500}>Failed to load source code</Text>
                            <Text size="sm">This could mean:</Text>
                            <ul style={{ margin: 0, paddingLeft: 20 }}>
                              <li>ADT is not enabled on this SAP system</li>
                              <li>The class name is incorrect</li>
                              <li>You don't have authorization</li>
                            </ul>
                            <Text size="sm">Try opening in SAP GUI transaction SE80.</Text>
                          </Stack>
                        </Alert>
                      ) : abapSource?.sourceCode ? (
                        <>
                          <Group gap="xs">
                            <Badge color="blue">{abapSource.lines} lines</Badge>
                            <Badge color="gray">{abapSource.sourceLength} chars</Badge>
                            {abapSource.metadata?.packageName && (
                              <Badge color="green">{abapSource.metadata.packageName}</Badge>
                            )}
                          </Group>
                          <div style={{ flex: 1, minHeight: 0 }}>
                            <Editor
                              height="100%"
                              language="abap"
                              value={abapSource.sourceCode}
                              options={{
                                readOnly: true,
                                minimap: { enabled: true },
                                fontSize: 12,
                                wordWrap: 'on',
                                automaticLayout: true,
                              }}
                            />
                          </div>
                        </>
                      ) : (
                        <Center style={{ flex: 1 }}>
                          <Text c="dimmed">No source code available</Text>
                        </Center>
                      )}
                    </Stack>
                  </Card>
                ) : (
                  <Card withBorder style={{ height: '100%' }}>
                    <Center style={{ height: '100%' }}>
                      <Stack gap="md" align="center">
                        <IconCode size={64} color="var(--mantine-color-gray-4)" />
                        <Text c="dimmed" ta="center">
                          Select an object from the package tree to view its source code
                        </Text>
                        {serviceDetails?.abapClasses?.dataProviderExt && (
                          <Button 
                            onClick={() => handleViewSource(serviceDetails.abapClasses.dataProviderExt.name)}
                            leftSection={<IconCode size={16} />}
                          >
                            Open DPC_EXT
                          </Button>
                        )}
                      </Stack>
                    </Center>
                  </Card>
                )}
              </div>
            </SimpleGrid>
          ) : (
            <Alert color="yellow">Failed to load service details.</Alert>
          )}
        </Tabs.Panel>
      </Tabs>

    </Stack>
  );
};

export default ServiceDetail;
