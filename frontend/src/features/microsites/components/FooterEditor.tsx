import { ActionIcon, Button, Card, Group, Stack, Switch, Text, TextInput, Textarea } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react';
import type { FooterLink, FooterContactItem, FooterSettings } from '../types';
import { DEFAULT_FOOTER, createFooterContactItem, createFooterLink } from '../types';

type FooterEditorProps = {
  value?: FooterSettings;
  onChange: (next: FooterSettings) => void;
};

const reorder = <T extends { id: string }>(items: T[], id: string, direction: 'up' | 'down'): T[] => {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return items;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

export const FooterEditor = ({ value = DEFAULT_FOOTER, onChange }: FooterEditorProps) => {
  const updateLinks = (links: FooterLink[]) => onChange({ ...value, links });
  const updateContacts = (items: FooterContactItem[]) => onChange({ ...value, contactItems: items });

  return (
    <Card withBorder>
      <Stack gap="md">
        <div>
          <Text fw={600}>Patička microshopu</Text>
          <Text size="sm" c="dimmed">
            Nastav texty pro brand, kontakty i doplňkové odkazy.
          </Text>
        </div>
        <Switch
          label="Zobrazit patičku"
          checked={value.visible ?? true}
          onChange={(event) => onChange({ ...value, visible: event.currentTarget.checked })}
        />
        <TextInput
          label="Titulek sekce"
          value={value.aboutTitle ?? ''}
          onChange={(event) => onChange({ ...value, aboutTitle: event.currentTarget.value })}
        />
        <Textarea
          label="Popis"
          minRows={3}
          value={value.aboutText ?? ''}
          onChange={(event) => onChange({ ...value, aboutText: event.currentTarget.value })}
        />

        <Stack gap="xs">
          <Group justify="space-between" align="center">
            <Text fw={600}>Kontakty</Text>
            <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => updateContacts([...value.contactItems, createFooterContactItem()])}>
              Přidat kontakt
            </Button>
          </Group>
          {value.contactItems.length === 0 ? (
            <Text size="sm" c="dimmed">
              Přidej první kontakt.
            </Text>
          ) : (
            <Stack gap="sm">
              {value.contactItems.map((item) => (
                <Card key={item.id} withBorder padding="sm">
                  <Group justify="space-between" align="center">
                    <Text fw={500}>{item.label}</Text>
                    <Group gap={4}>
                      <ActionIcon variant="subtle" onClick={() => updateContacts(reorder(value.contactItems, item.id, 'up'))}>
                        <IconArrowUp size={14} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" onClick={() => updateContacts(reorder(value.contactItems, item.id, 'down'))}>
                        <IconArrowDown size={14} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="red" onClick={() => updateContacts(value.contactItems.filter((contact) => contact.id !== item.id))}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  <Stack gap="xs" mt="xs">
                    <TextInput
                      label="Label"
                      value={item.label}
                      onChange={(event) => {
                        updateContacts(
                          value.contactItems.map((contact) => (contact.id === item.id ? { ...contact, label: event.currentTarget.value } : contact))
                        );
                      }}
                    />
                    <TextInput
                      label="Hodnota"
                      value={item.value}
                      onChange={(event) => {
                        updateContacts(
                          value.contactItems.map((contact) => (contact.id === item.id ? { ...contact, value: event.currentTarget.value } : contact))
                        );
                      }}
                    />
                  </Stack>
                </Card>
              ))}
            </Stack>
          )}
        </Stack>

        <Stack gap="xs">
          <Group justify="space-between" align="center">
            <Text fw={600}>Odkazy v patičce</Text>
            <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => updateLinks([...value.links, createFooterLink()])}>
              Přidat odkaz
            </Button>
          </Group>
          {value.links.length === 0 ? (
            <Text size="sm" c="dimmed">
              Přidej první odkaz.
            </Text>
          ) : (
            <Stack gap="sm">
              {value.links.map((link) => (
                <Card key={link.id} withBorder padding="sm">
                  <Group justify="space-between" align="center">
                    <Text fw={500}>{link.label}</Text>
                    <Group gap={4}>
                      <ActionIcon variant="subtle" onClick={() => updateLinks(reorder(value.links, link.id, 'up'))}>
                        <IconArrowUp size={14} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" onClick={() => updateLinks(reorder(value.links, link.id, 'down'))}>
                        <IconArrowDown size={14} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="red" onClick={() => updateLinks(value.links.filter((item) => item.id !== link.id))}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  <Stack gap="xs" mt="xs">
                    <TextInput
                      label="Label"
                      value={link.label}
                      onChange={(event) =>
                        updateLinks(value.links.map((item) => (item.id === link.id ? { ...item, label: event.currentTarget.value } : item)))
                      }
                    />
                    <TextInput
                      label="URL"
                      value={link.href}
                      onChange={(event) =>
                        updateLinks(value.links.map((item) => (item.id === link.id ? { ...item, href: event.currentTarget.value } : item)))
                      }
                    />
                  </Stack>
                </Card>
              ))}
            </Stack>
          )}
        </Stack>
      </Stack>
    </Card>
  );
};
