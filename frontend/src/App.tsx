import { useState } from 'react';
import { AppShell, Title, Container, Text, Anchor, Group, Burger, Tabs } from '@mantine/core';
import { IconDatabase } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import ServiceList from './components/ServiceList';
import ServiceDetail from './components/ServiceDetail';
import { ODataService } from './services/api';

function App() {
  const [selectedService, setSelectedService] = useState<ODataService | null>(null);
  const [opened, { toggle }] = useDisclosure();
  const [activeTab, setActiveTab] = useState<string | null>('services');

  return (
    <AppShell
      header={{ height: 60 }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <IconDatabase size={28} stroke={1.5} />
            <Title order={3}>SAP OData Explorer</Title>
          </Group>
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="xl" my="md">
          {selectedService ? (
            <ServiceDetail
              service={selectedService}
              onBack={() => setSelectedService(null)}
            />
          ) : (
            <ServiceList onSelectService={setSelectedService} />
          )}
        </Container>
      </AppShell.Main>

      <Container size="xl">
        <Group justify="center" py="md" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
          <Text size="sm" c="dimmed">
            SAP OData Explorer - Connect to:{' '}
            <Anchor href="#" onClick={(e) => e.preventDefault()}>
              {import.meta.env.VITE_SAP_HOST || 'localhost:8000'}
            </Anchor>
          </Text>
        </Group>
      </Container>
    </AppShell>
  );
}

export default App;
