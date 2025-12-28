import { ActionIcon, Button, Card, Group, Stack, Switch, Text, TextInput } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react';
import type { HeaderNavigationItem, HeaderSettings } from '../types';
import { DEFAULT_HEADER, createHeaderNavigationItem } from '../types';

type HeaderEditorProps = {
  value?: HeaderSettings;
  onChange: (next: HeaderSettings) => void;
};

export const HeaderEditor = ({ value = DEFAULT_HEADER, onChange }: HeaderEditorProps) => {
  const updateNavigation = (items: HeaderNavigationItem[]) => {
    onChange({ ...value, navigation: items });
  };

  const handleNavChange = (id: string, patch: Partial<HeaderNavigationItem>) => {
    const next = value.navigation.map((item) => (item.id === id ? { ...item, ...patch } : item));
    updateNavigation(next);
  };

  const handleNavRemove = (id: string) => {
    updateNavigation(value.navigation.filter((item) => item.id !== id));
  };

  const moveNav = (id: string, direction: 'up' | 'down') => {
    const index = value.navigation.findIndex((item) => item.id === id);
    if (index === -1) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= value.navigation.length) return;
    const next = [...value.navigation];
    [next[index], next[target]] = [next[target], next[index]];
    updateNavigation(next);
  };

  return (
    <Card withBorder>
      <Stack gap="md">
        <div>
          <Text fw={600}>Hlavička microshopu</Text>
          <Text size="sm" c="dimmed">
            Uprav nadpis, podtitulek a navigační odkazy, které se zobrazí v horním menu.
          </Text>
        </div>
        <Switch
          label="Zobrazit hlavičku"
          checked={value.visible ?? true}
          onChange={(event) => onChange({ ...value, visible: event.currentTarget.checked })}
        />
        <TextInput
          label="Titulek"
          value={value.title ?? ''}
          onChange={(event) => onChange({ ...value, title: event.currentTarget.value })}
        />
        <TextInput
          label="Podtitulek"
          value={value.subtitle ?? ''}
          onChange={(event) => onChange({ ...value, subtitle: event.currentTarget.value })}
        />
        <Switch
          label="Zobrazit info o publikaci"
          checked={value.showPublishedBadge ?? true}
          onChange={(event) => onChange({ ...value, showPublishedBadge: event.currentTarget.checked })}
        />
        <Stack gap="xs">
          <Group justify="space-between" align="center">
            <Text fw={600}>Navigace</Text>
            <Button
              variant="light"
              leftSection={<IconPlus size={16} />}
              onClick={() => updateNavigation([...value.navigation, createHeaderNavigationItem()])}
            >
              Přidat odkaz
            </Button>
          </Group>
          {value.navigation.length === 0 ? (
            <Text size="sm" c="dimmed">
              Zatím žádné odkazy.
            </Text>
          ) : (
            <Stack gap="sm">
              {value.navigation.map((item, index) => (
                <Card key={item.id} withBorder padding="sm">
                  <Group justify="space-between" align="center">
                    <Text fw={500}>Odkaz #{index + 1}</Text>
                    <Group gap={4}>
                      <ActionIcon variant="subtle" onClick={() => moveNav(item.id, 'up')}>
                        <IconArrowUp size={14} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" onClick={() => moveNav(item.id, 'down')}>
                        <IconArrowDown size={14} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="red" onClick={() => handleNavRemove(item.id)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  <Stack gap="xs" mt="xs">
                    <TextInput
                      label="Label"
                      value={item.label}
                      onChange={(event) => handleNavChange(item.id, { label: event.currentTarget.value })}
                    />
                    <TextInput
                      label="URL"
                      value={item.href}
                      onChange={(event) => handleNavChange(item.id, { href: event.currentTarget.value })}
                    />
                  </Stack>
                </Card>
              ))}
            </Stack>
          )}
        </Stack>
        <Stack gap="xs">
          <Text fw={600}>CTA v hlavičce</Text>
          <Group grow>
            <TextInput
              label="Text tlačítka"
              value={value.cta?.label ?? ''}
              onChange={(event) =>
                onChange({
                  ...value,
                  cta: { label: event.currentTarget.value, href: value.cta?.href ?? '#' },
                })
              }
            />
            <TextInput
              label="Odkaz"
              value={value.cta?.href ?? ''}
              onChange={(event) =>
                onChange({
                  ...value,
                  cta: { label: value.cta?.label ?? 'CTA', href: event.currentTarget.value },
                })
              }
            />
          </Group>
        </Stack>
      </Stack>
    </Card>
  );
};
