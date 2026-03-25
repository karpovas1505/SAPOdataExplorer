import { useState, useMemo, useEffect } from 'react';
import {
  TextInput,
  Table,
  Card,
  Title,
  Text,
  Loader,
  Alert,
  ActionIcon,
  Tooltip,
  Group,
  Badge,
  Center,
  Stack,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch, IconStar, IconStarFilled } from '@tabler/icons-react';
import { useServices } from '../hooks/useServices';
import { ODataService } from '../services/api';

const FAVORITES_KEY = 'sap-odata-favorites';

function getFavorites(): string[] {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveFavorites(favorites: string[]): void {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

interface ServiceListProps {
  onSelectService: (service: ODataService) => void;
}

const ServiceList = ({ onSelectService }: ServiceListProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);
  const { data, isLoading, isError, error } = useServices(debouncedSearch);

  useEffect(() => {
    setFavorites(getFavorites());
  }, []);

  const toggleFavorite = (serviceName: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setFavorites((prev) => {
      const newFavorites = prev.includes(serviceName)
        ? prev.filter((n) => n !== serviceName)
        : [serviceName, ...prev.filter((n) => n !== serviceName)];
      saveFavorites(newFavorites);
      return newFavorites;
    });
  };

  const sortedServices = useMemo(() => {
    if (!data?.data) return [];
    return [...data.data].sort((a, b) => {
      const aFav = favorites.includes(a.name);
      const bFav = favorites.includes(b.name);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return 0;
    });
  }, [data?.data, favorites]);

  return (
    <Stack gap="md">
      <Title order={2}>OData Services</Title>

      <TextInput
        placeholder="Search services..."
        leftSection={<IconSearch size={16} />}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        size="md"
      />

      {isLoading && (
        <Center py="xl">
          <Loader size="lg" />
        </Center>
      )}

      {isError && (
        <Alert color="red" title="Error">
          Error loading services: {error?.message}
        </Alert>
      )}

      {data && (
        <Card padding={0} withBorder>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 50 }}></Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th>Description</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sortedServices.map((service) => {
                const isFavorite = favorites.includes(service.name);
                return (
                  <Table.Tr
                    key={`${service.name}-${service.version}`}
                    onClick={() => onSelectService(service)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: isFavorite
                        ? 'var(--mantine-color-yellow-0)'
                        : undefined,
                    }}
                  >
                    <Table.Td>
                      <Tooltip
                        label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <ActionIcon
                          variant="subtle"
                          color={isFavorite ? 'yellow' : 'gray'}
                          onClick={(e) => toggleFavorite(service.name, e)}
                        >
                          {isFavorite ? (
                            <IconStarFilled size={18} />
                          ) : (
                            <IconStar size={18} />
                          )}
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Text fw={500}>
                          {service.displayName || service.name}
                          {service.version && <Text span c="dimmed" fs="normal"> (v{service.version})</Text>}
                        </Text>
                        {isFavorite && (
                          <Badge size="xs" color="yellow" variant="light">
                            Favorite
                          </Badge>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed" ff="monospace">{service.name}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text c="dimmed" size="sm">
                        {service.description || '-'}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>

          {data.count === 0 && (
            <Center py="xl">
              <Text c="dimmed">No services found</Text>
            </Center>
          )}
        </Card>
      )}
    </Stack>
  );
};

export default ServiceList;
