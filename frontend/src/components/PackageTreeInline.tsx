import {
  Text,
  Group,
  Loader,
  Alert,
  Badge,
  Stack,
  Box,
  Card,
  ScrollArea,
} from '@mantine/core';
import { IconPackage, IconCode, IconTable, IconFunction, IconBox } from '@tabler/icons-react';
import { usePackageObjects } from '../hooks/useServices';

interface PackageTreeInlineProps {
  packageName: string;
  onSelectObject?: (objectName: string, objectType: string) => void;
  selectedObject?: string;
}

const typeIcons: Record<string, typeof IconPackage> = {
  CLAS: IconBox,
  INTF: IconCode,
  TABL: IconTable,
  DTEL: IconTable,
  DOMA: IconTable,
  FUNC: IconFunction,
  PROG: IconCode,
  TRAN: IconCode,
  DEVC: IconPackage,
};

const typeColors: Record<string, string> = {
  CLAS: 'blue',
  INTF: 'cyan',
  TABL: 'green',
  DTEL: 'teal',
  DOMA: 'lime',
  FUNC: 'orange',
  PROG: 'violet',
  TRAN: 'pink',
  DEVC: 'gray',
};

interface TreeNode {
  value: string;
  label: React.ReactNode;
  children?: TreeNode[];
}

const PackageTreeInline = ({ packageName, onSelectObject, selectedObject }: PackageTreeInlineProps) => {
  const { data, isLoading, isError, error } = usePackageObjects(packageName);

  const groupObjectsByType = () => {
    if (!data?.objects) return [];

    const grouped: Record<string, typeof data.objects> = {};
    data.objects.forEach((obj) => {
      const type = obj.type.split('/')[0];
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(obj);
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, objects]) => ({
        type,
        objects: objects.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  };

  const buildTreeData = (): TreeNode[] => {
    const grouped = groupObjectsByType();

    return grouped.map(({ type, objects }) => {
      const IconComponent = typeIcons[type] || IconCode;
      const color = typeColors[type] || 'gray';

      return {
        value: `type-${type}`,
        label: (
          <Group gap="xs">
            <IconComponent size={16} color={`var(--mantine-color-${color}-6)`} />
            <Text fw={600} size="sm">{type}</Text>
            <Badge size="sm" color={color} variant="light">
              {objects.length}
            </Badge>
          </Group>
        ),
        children: objects.map((obj) => ({
          value: `${type}-${obj.name}`,
          label: (
            <Group 
              gap="xs" 
              style={{ 
                marginLeft: 8,
                padding: '2px 4px',
                borderRadius: 4,
                backgroundColor: selectedObject === obj.name ? 'var(--mantine-color-blue-1)' : 'transparent',
                cursor: 'pointer',
              }}
              onClick={() => onSelectObject?.(obj.name, obj.type)}
            >
              <Text size="sm" ff="monospace" style={{ fontWeight: selectedObject === obj.name ? 600 : 400 }}>
                {obj.name}
              </Text>
              {obj.description && (
                <Text size="xs" c="dimmed" truncate style={{ maxWidth: 150 }}>
                  {obj.description}
                </Text>
              )}
            </Group>
          ),
        })),
      };
    });
  };

  if (isLoading) {
    return (
      <Card withBorder style={{ height: '100%' }}>
        <Box py="xl">
          <Group justify="center">
            <Loader size="lg" />
            <Text>Loading package objects...</Text>
          </Group>
        </Box>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card withBorder style={{ height: '100%' }}>
        <Alert color="red" title="Error loading package">
          {error?.message || 'Failed to load package objects. ADT may not be enabled.'}
        </Alert>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card withBorder style={{ height: '100%' }}>
        <Text c="dimmed" ta="center" py="xl">No package data available</Text>
      </Card>
    );
  }

  return (
    <Card withBorder style={{ height: '100%' }}>
      <Stack gap="xs" style={{ height: '100%' }}>
        <Group justify="space-between">
          <Group gap="xs">
            <IconPackage size={20} color="var(--mantine-color-blue-6)" />
            <Text fw={600}>{packageName}</Text>
          </Group>
          <Badge size="sm" color="gray">{data.count} objects</Badge>
        </Group>
        
        <ScrollArea style={{ flex: 1 }}>
          <div style={{ padding: '4px 0' }}>
            {buildTreeData().map((node) => (
              <div key={node.value}>
                <div style={{ padding: '4px 8px' }}>{node.label}</div>
                {node.children?.map((child) => (
                  <div key={child.value} style={{ paddingLeft: 20 }}>
                    {child.label}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      </Stack>
    </Card>
  );
};

export default PackageTreeInline;
