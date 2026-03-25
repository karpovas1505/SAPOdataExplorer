import { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Select,
  TextInput,
  Box,
  Loader,
  Alert,
  Badge,
  Text,
  Group,
  Stack,
  Card,
  Divider,
  Center,
} from '@mantine/core';
import { IconFilter, IconPlus, IconTrash } from '@tabler/icons-react';
import { servicesApi } from '../services/api';

interface FilterDialogProps {
  opened: boolean;
  onClose: () => void;
  onApply: (filterString: string) => void;
  onClear?: () => void;
  serviceName: string;
  serviceVersion?: string;
  entityName: string;
}

interface FilterCondition {
  field: string;
  operator: string;
  value: string;
  logic: 'and' | 'or';
}

const operators = [
  { value: 'eq', label: 'equals (=)', types: ['all'] },
  { value: 'ne', label: 'not equals (≠)', types: ['all'] },
  { value: 'gt', label: 'greater than (>)', types: ['number', 'date'] },
  { value: 'ge', label: 'greater or equal (≥)', types: ['number', 'date'] },
  { value: 'lt', label: 'less than (<)', types: ['number', 'date'] },
  { value: 'le', label: 'less or equal (≤)', types: ['number', 'date'] },
  { value: 'contains', label: 'contains', types: ['string'] },
  { value: 'startswith', label: 'starts with', types: ['string'] },
  { value: 'endswith', label: 'ends with', types: ['string'] },
];

  const FilterDialog = ({
  opened,
  onClose,
  onApply,
  onClear,
  serviceName,
  serviceVersion,
  entityName,
}: FilterDialogProps) => {
  const [fields, setFields] = useState<Array<{ name: string; type: string; nullable?: string; maxLength?: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conditions, setConditions] = useState<FilterCondition[]>([
    { field: '', operator: 'eq', value: '', logic: 'and' },
  ]);

  useEffect(() => {
    if (opened && serviceName && entityName) {
      loadFields();
    }
  }, [opened, serviceName, entityName, serviceVersion]);

  const loadFields = async () => {
    setLoading(true);
    setError(null);
    setFields([]);
    try {
      const response = await servicesApi.getEntityFields(serviceName, entityName, serviceVersion);
      const rawFields = response.data.fields;
      const validFields = rawFields.filter((f: any) => f && f.name && typeof f.name === 'string');
      setFields(validFields);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load entity fields');
    } finally {
      setLoading(false);
    }
  };

  const getFieldType = (fieldName: string): string => {
    const field = fields.find((f) => f.name === fieldName);
    if (!field) return 'string';
    const type = field.type.toLowerCase();
    if (type.includes('int') || type.includes('decimal') || type.includes('double') || type.includes('float')) {
      return 'number';
    }
    if (type.includes('datetime') || type.includes('date')) {
      return 'date';
    }
    return 'string';
  };

  const getAvailableOperators = (fieldName: string) => {
    const fieldType = getFieldType(fieldName);
    return operators.filter((op) => op.types.includes('all') || op.types.includes(fieldType));
  };

  const addCondition = () => {
    setConditions([...conditions, { field: '', operator: 'eq', value: '', logic: 'and' }]);
  };

  const removeCondition = (index: number) => {
    if (conditions.length === 1) {
      setConditions([{ field: '', operator: 'eq', value: '', logic: 'and' }]);
    } else {
      setConditions(conditions.filter((_, i) => i !== index));
    }
  };

  const updateCondition = (index: number, updates: Partial<FilterCondition>) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    if (updates.field) {
      const availableOps = getAvailableOperators(updates.field);
      if (!availableOps.find((op) => op.value === newConditions[index].operator)) {
        newConditions[index].operator = 'eq';
      }
    }
    setConditions(newConditions);
  };

  const buildFilterString = (): string => {
    const validConditions = conditions.filter((c) => c.field && c.value);
    if (validConditions.length === 0) return '';
    const parts = validConditions.map((condition, index) => {
      const fieldType = getFieldType(condition.field);
      let value = condition.value;
      if (fieldType === 'string') {
        value = `'${value.replace(/'/g, "''")}'`;
      } else if (fieldType === 'date') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          value = `datetime'${date.toISOString()}'`;
        } else {
          value = `'${value}'`;
        }
      }
      let conditionStr: string;
      if (condition.operator === 'contains') {
        conditionStr = `substringof(${value}, ${condition.field})`;
      } else if (condition.operator === 'startswith') {
        conditionStr = `startswith(${condition.field}, ${value})`;
      } else if (condition.operator === 'endswith') {
        conditionStr = `endswith(${condition.field}, ${value})`;
      } else if (['contains', 'startswith', 'endswith'].includes(condition.operator)) {
        conditionStr = `${condition.operator}(${condition.field}, ${value})`;
      } else {
        conditionStr = `${condition.field} ${condition.operator} ${value}`;
      }
      if (index > 0) {
        return ` ${condition.logic} ${conditionStr}`;
      }
      return conditionStr;
    });
    return `$filter=${parts.join('')}`;
  };

  const handleApply = () => {
    const filterString = buildFilterString();
    onApply(filterString);
    onClose();
  };

  const handleClear = () => {
    setConditions([{ field: '', operator: 'eq', value: '', logic: 'and' }]);
    onClear?.();
  };

  const handleClose = () => {
    setConditions([{ field: '', operator: 'eq', value: '', logic: 'and' }]);
    onClose();
  };

  return (
    <Modal opened={opened} onClose={handleClose} title={<Group><IconFilter size={18} /><Text fw={500}>Add Filter</Text></Group>} size="lg">
      {loading && (
        <Center py="xl">
          <Loader size="lg" />
        </Center>
      )}

      {error && (
        <Alert color="red">{error}</Alert>
      )}

      {!loading && !error && fields.length === 0 && (
        <Alert color="yellow">No fields found for entity {entityName}</Alert>
      )}

      {!loading && fields.length > 0 && fields[0]?.name && (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Entity: <strong>{entityName}</strong>
          </Text>

          {conditions.map((condition, index) => (
            <Card key={index} withBorder p="sm" style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
              <Group mb="xs">
                {index > 0 && (
                  <Select
                    value={condition.logic}
                    onChange={(v) => updateCondition(index, { logic: v as 'and' | 'or' })}
                    data={[
                      { value: 'and', label: 'AND' },
                      { value: 'or', label: 'OR' },
                    ]}
                    w={100}
                    size="sm"
                  />
                )}
                <Badge color="blue">Condition {index + 1}</Badge>
                <Button size="xs" color="red" variant="subtle" leftSection={<IconTrash size={14} />} onClick={() => removeCondition(index)}>
                  Remove
                </Button>
              </Group>

              <Group gap="xs">
                <Select
                  placeholder="Field"
                  value={condition.field}
                  onChange={(v) => updateCondition(index, { field: v || '' })}
                  data={fields.map((f) => ({
                    value: f.name,
                    label: `${f.name} (${f.maxLength ? `${f.type}(${f.maxLength})` : f.type})`,
                  }))}
                  style={{ flex: 1 }}
                  searchable
                  size="sm"
                />

                <Select
                  placeholder="Operator"
                  value={condition.operator}
                  onChange={(v) => updateCondition(index, { operator: v || 'eq' })}
                  data={getAvailableOperators(condition.field).map((op) => ({
                    value: op.value,
                    label: op.label,
                  }))}
                  w={180}
                  size="sm"
                />

                <TextInput
                  placeholder={getFieldType(condition.field) === 'date' ? 'YYYY-MM-DD' : 'Value'}
                  value={condition.value}
                  onChange={(e) => updateCondition(index, { value: e.target.value })}
                  style={{ flex: 1 }}
                  size="sm"
                />
              </Group>
            </Card>
          ))}

          <Button variant="light" leftSection={<IconPlus size={14} />} onClick={addCondition} size="sm">
            Add Condition
          </Button>

          <Box p="sm" style={{ backgroundColor: 'var(--mantine-color-blue-0)', borderRadius: 4 }}>
            <Text size="xs" c="blue.7">
              Preview: {buildFilterString() || 'No filter'}
            </Text>
          </Box>
        </Stack>
      )}

      <Divider my="md" />

      <Group justify="flex-end">
        <Button variant="subtle" color="gray" onClick={handleClear}>Clear</Button>
        <Button variant="subtle" onClick={handleClose}>Cancel</Button>
        <Button onClick={handleApply} disabled={!conditions.some((c) => c.field && c.value)}>
          Apply
        </Button>
      </Group>
    </Modal>
  );
};

export default FilterDialog;
