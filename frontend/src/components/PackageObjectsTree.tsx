import { useState } from 'react';
import {
  Modal,
  Tree,
  Text,
  Group,
  Loader,
  Alert,
  Badge,
  Stack,
  Box,
} from '@mantine/core';
import { IconPackage, IconCode, IconTable, IconFunction, IconBox } from '@tabler/icons-react';
import { usePackageObjects } from '../hooks/useServices';

interface PackageObjectsTreeProps {
  packageName: string;
  opened: boolean;
  onClose: () => void;
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

const PackageObjectsTree = ({ packageName, opened, onClose }: PackageObjectsTreeProps) => {
  const { data, isLoading, isError, error } = usePackageObjects(packageName);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);

  const groupObjectsByType = () => {
    if (!data?.objects) return [];

    const grouped: Record<string, typeof data.objects> = {};
    data.objects.forEach((obj) => {
      const type = obj.type.split('/')[0]; // Handle types like CLAS/OC
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
            <Text fw={600}>{type}</Text>
            <Badge size="sm" color={color} variant="light">
              {objects.length}
            </Badge>
          </Group>
        ),
        children: objects.map((obj) => ({
          value: obj.name,
          label: (
            <Group gap="xs" style={{ marginLeft: 20 }}>
              <Text size="sm" ff="monospace">
                {obj.name}
              </Text>
              {obj.description && (
                <Text size="xs" c="dimmed">
                  - {obj.description}
                </Text>
              )}
            </Group>
          ),
        })),
      };
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group>
          <IconPackage size={24} color="var(--mantine-color-blue-6)" />
          <Text fw={600}>Package: {packageName}</Text>
        </Group>
      }
      size="xl"
      centered
    >
      <Stack>
        {isLoading && (
          <Box py="xl">
            <Group justify="center">
              <Loader size="lg" />
              <Text>Loading package objects...</Text>
            </Group>
          </Box>
        )}

        {isError && (
          <Alert color="red" title="Error loading package">
            {error?.message || 'Failed to load package objects. ADT may not be enabled.'}
          </Alert>
        )}

        {data && (
          <>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Total objects: {data.count}
              </Text>
              <Text size="sm" c="dimmed">
                Click on a type to expand/collapse
              </Text>
            </Group>

            <Box style={{ maxHeight: '60vh', overflow: 'auto' }}>
              <Tree
                data={buildTreeData()}
                value={selectedNodes}
                onChange={setSelectedNodes}
                expandOnClick
                styles={{
                  node: {
                    padding: '4px 8px',
                    borderRadius: 4,
                    '&:hover': {
                      backgroundColor: 'var(--mantine-color-gray-1)',
                    },
                  },
                }}
              />
            </Box>
          </>
        )}
      </Stack>
    </Modal>
  );
};

export default PackageObjectsTree;
