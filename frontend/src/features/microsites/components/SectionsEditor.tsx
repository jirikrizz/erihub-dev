import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  NumberInput,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { randomId } from '@mantine/hooks';
import { IconArrowDown, IconArrowUp, IconTrash, IconPlus } from '@tabler/icons-react';
import type { MicrositeSection, SectionType } from '../types';
import { createDefaultSection } from '../types';

type SectionsEditorProps = {
  sections: MicrositeSection[];
  onChange: (next: MicrositeSection[]) => void;
};

const SECTION_LABELS: Record<SectionType, string> = {
  hero: 'Hero',
  'product-grid': 'Katalog produktů',
  highlights: 'Benefity',
  testimonials: 'Reference',
  faq: 'FAQ',
  cta: 'Výzva k akci',
};

const SectionMenu = ({ onAdd }: { onAdd: (type: SectionType) => void }) => (
  <Menu shadow="md" width={220}>
    <Menu.Target>
      <Button variant="light" leftSection={<IconPlus size={16} />}>
        Přidat sekci
      </Button>
    </Menu.Target>
    <Menu.Dropdown>
      {(Object.keys(SECTION_LABELS) as SectionType[]).map((type) => (
        <Menu.Item key={type} onClick={() => onAdd(type)}>
          {SECTION_LABELS[type]}
        </Menu.Item>
      ))}
    </Menu.Dropdown>
  </Menu>
);

const updateItem = <T extends { id: string }>(items: T[], id: string, patch: Partial<T>): T[] =>
  items.map((item) => (item.id === id ? { ...item, ...patch } : item));

const removeItem = <T extends { id: string }>(items: T[], id: string): T[] => items.filter((item) => item.id !== id);

export const SectionsEditor = ({ sections, onChange }: SectionsEditorProps) => {
  const reorder = (index: number, direction: 'up' | 'down') => {
    const next = [...sections];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) {
      return;
    }
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    onChange(next);
  };

  const updateSection = (id: string, patch: Partial<MicrositeSection>) => {
    const next = sections.map((section) => (section.id === id ? ({ ...section, ...patch } as MicrositeSection) : section));
    onChange(next as MicrositeSection[]);
  };

  const addSection = (type: SectionType) => {
    onChange([...sections, createDefaultSection(type)]);
  };

  const removeSection = (id: string) => {
    onChange(sections.filter((section) => section.id !== id));
  };

  const addNestedItem = (section: MicrositeSection, defaults: Record<string, unknown>) => {
    if (section.type === 'highlights' || section.type === 'testimonials' || section.type === 'faq') {
      const items = section.items ?? [];
      updateSection(section.id, {
        items: [...items, { id: randomId(), ...defaults }],
      } as MicrositeSection);
    }
  };

  const renderHighlights = (section: Extract<MicrositeSection, { type: 'highlights' }>) => (
    <Stack>
      {(section.items ?? []).map((item) => (
        <Card key={item.id} withBorder padding="sm">
          <Group justify="space-between" align="center">
            <Text fw={500}>Položka</Text>
            <ActionIcon variant="subtle" color="red" onClick={() => updateSection(section.id, { items: removeItem(section.items ?? [], item.id) })}>
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
          <Stack gap="xs" mt="xs">
            <TextInput
              label="Titulek"
              value={item.title}
              onChange={(event) => updateSection(section.id, { items: updateItem(section.items ?? [], item.id, { title: event.currentTarget.value }) })}
            />
            <TextInput
              label="Popis"
              value={item.description}
              onChange={(event) =>
                updateSection(section.id, { items: updateItem(section.items ?? [], item.id, { description: event.currentTarget.value }) })
              }
            />
            <TextInput
              label="Ikona (např. Sparkles)"
              value={item.icon ?? ''}
              onChange={(event) => updateSection(section.id, { items: updateItem(section.items ?? [], item.id, { icon: event.currentTarget.value }) })}
            />
          </Stack>
        </Card>
      ))}
      <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => addNestedItem(section, { title: 'Nový benefit', description: '' })}>
        Přidat benefit
      </Button>
    </Stack>
  );

  const renderTestimonials = (section: Extract<MicrositeSection, { type: 'testimonials' }>) => (
    <Stack>
      {(section.items ?? []).map((item) => (
        <Card key={item.id} withBorder padding="sm">
          <Group justify="space-between" align="center">
            <Text fw={500}>Reference</Text>
            <ActionIcon variant="subtle" color="red" onClick={() => updateSection(section.id, { items: removeItem(section.items ?? [], item.id) })}>
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
          <Stack gap="xs" mt="xs">
            <Textarea
              label="Citace"
              value={item.quote}
              minRows={2}
              onChange={(event) => updateSection(section.id, { items: updateItem(section.items ?? [], item.id, { quote: event.currentTarget.value }) })}
            />
            <Group grow>
              <TextInput
                label="Autor"
                value={item.author}
                onChange={(event) => updateSection(section.id, { items: updateItem(section.items ?? [], item.id, { author: event.currentTarget.value }) })}
              />
              <TextInput
                label="Role"
                value={item.role ?? ''}
                onChange={(event) => updateSection(section.id, { items: updateItem(section.items ?? [], item.id, { role: event.currentTarget.value }) })}
              />
            </Group>
          </Stack>
        </Card>
      ))}
      <Button
        variant="light"
        leftSection={<IconPlus size={16} />}
        onClick={() =>
          addNestedItem(section, {
            quote: 'Skvělá zkušenost!',
            author: 'Aneta',
            role: 'Customer',
          })
        }
      >
        Přidat referenci
      </Button>
    </Stack>
  );

  const renderFaq = (section: Extract<MicrositeSection, { type: 'faq' }>) => (
    <Stack>
      {(section.items ?? []).map((item) => (
        <Card key={item.id} withBorder padding="sm">
          <Group justify="space-between" align="center">
            <Text fw={500}>Otázka</Text>
            <ActionIcon variant="subtle" color="red" onClick={() => updateSection(section.id, { items: removeItem(section.items ?? [], item.id) })}>
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
          <Stack gap="xs" mt="xs">
            <TextInput
              label="Otázka"
              value={item.question}
              onChange={(event) =>
                updateSection(section.id, { items: updateItem(section.items ?? [], item.id, { question: event.currentTarget.value }) })
              }
            />
            <Textarea
              label="Odpověď"
              minRows={2}
              value={item.answer}
              onChange={(event) =>
                updateSection(section.id, { items: updateItem(section.items ?? [], item.id, { answer: event.currentTarget.value }) })
              }
            />
          </Stack>
        </Card>
      ))}
      <Button
        variant="light"
        leftSection={<IconPlus size={16} />}
        onClick={() =>
          addNestedItem(section, {
            question: 'Nová otázka',
            answer: 'Odpověď doplníš zde.',
          })
        }
      >
        Přidat otázku
      </Button>
    </Stack>
  );

  const renderSectionForm = (section: MicrositeSection) => {
    switch (section.type) {
      case 'hero':
        return (
          <Stack gap="md">
            <TextInput
              label="Eyebrow"
              value={section.eyebrow ?? ''}
              onChange={(event) => updateSection(section.id, { eyebrow: event.currentTarget.value })}
            />
            <TextInput
              label="Titulek"
              value={section.title ?? ''}
              onChange={(event) => updateSection(section.id, { title: event.currentTarget.value })}
            />
            <Textarea
              label="Popis"
              minRows={2}
              value={section.description ?? ''}
              onChange={(event) => updateSection(section.id, { description: event.currentTarget.value })}
            />
            <Group grow>
              <TextInput
                label="Primární CTA text"
                value={section.primaryCta?.label ?? ''}
                onChange={(event) =>
                  updateSection(section.id, {
                    primaryCta: { ...(section.primaryCta ?? { href: '' }), label: event.currentTarget.value },
                  })
                }
              />
              <TextInput
                label="Primární CTA odkaz"
                value={section.primaryCta?.href ?? ''}
                onChange={(event) =>
                  updateSection(section.id, {
                    primaryCta: { ...(section.primaryCta ?? { label: '' }), href: event.currentTarget.value },
                  })
                }
              />
            </Group>
            <Group grow>
              <TextInput
                label="Sekundární CTA text"
                value={section.secondaryCta?.label ?? ''}
                onChange={(event) =>
                  updateSection(section.id, {
                    secondaryCta: { ...(section.secondaryCta ?? { href: '' }), label: event.currentTarget.value },
                  })
                }
              />
              <TextInput
                label="Sekundární CTA odkaz"
                value={section.secondaryCta?.href ?? ''}
                onChange={(event) =>
                  updateSection(section.id, {
                    secondaryCta: { ...(section.secondaryCta ?? { label: '' }), href: event.currentTarget.value },
                  })
                }
              />
            </Group>
            <TextInput
              label="URL obrázku"
              value={section.mediaImage ?? ''}
              onChange={(event) => updateSection(section.id, { mediaImage: event.currentTarget.value })}
            />
          </Stack>
        );
      case 'product-grid':
        return (
          <Stack gap="md">
            <TextInput
              label="Titulek"
              value={section.title ?? ''}
              onChange={(event) => updateSection(section.id, { title: event.currentTarget.value })}
            />
            <Textarea
              label="Popis"
              minRows={2}
              value={section.description ?? ''}
              onChange={(event) => updateSection(section.id, { description: event.currentTarget.value })}
            />
            <NumberInput
              label="Počet produktů"
              min={1}
              max={24}
              value={section.limit ?? 6}
              onChange={(value) => updateSection(section.id, { limit: Number(value) || 0 })}
            />
          </Stack>
        );
      case 'highlights':
        return renderHighlights(section);
      case 'testimonials':
        return renderTestimonials(section);
      case 'faq':
        return renderFaq(section);
      case 'cta':
        return (
          <Stack gap="md">
            <TextInput
              label="Eyebrow"
              value={section.eyebrow ?? ''}
              onChange={(event) => updateSection(section.id, { eyebrow: event.currentTarget.value })}
            />
            <TextInput
              label="Titulek"
              value={section.title ?? ''}
              onChange={(event) => updateSection(section.id, { title: event.currentTarget.value })}
            />
            <Textarea
              label="Popis"
              minRows={2}
              value={section.description ?? ''}
              onChange={(event) => updateSection(section.id, { description: event.currentTarget.value })}
            />
            <Group grow>
              <TextInput
                label="CTA text"
                value={section.cta?.label ?? ''}
                onChange={(event) =>
                  updateSection(section.id, {
                    cta: { ...(section.cta ?? { href: '' }), label: event.currentTarget.value },
                  })
                }
              />
              <TextInput
                label="CTA odkaz"
                value={section.cta?.href ?? ''}
                onChange={(event) =>
                  updateSection(section.id, {
                    cta: { ...(section.cta ?? { label: '' }), href: event.currentTarget.value },
                  })
                }
              />
            </Group>
          </Stack>
        );
      default:
        return null;
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <div>
          <Text fw={600}>Sekce microshopu</Text>
          <Text size="sm" c="dimmed">
            Poskládej microshop z předpřipravených bloků. Pořadí můžeš měnit šipkami.
          </Text>
        </div>
        <SectionMenu onAdd={addSection} />
      </Group>
      {sections.length === 0 ? (
        <Card withBorder padding="xl">
          <Stack align="center">
            <Text c="dimmed">Zatím žádná sekce. Přidej hero nebo katalog produktů.</Text>
            <SectionMenu onAdd={addSection} />
          </Stack>
        </Card>
      ) : (
        sections.map((section, index) => (
          <Card key={section.id} withBorder padding="lg">
            <Group justify="space-between" align="center" mb="md">
              <Group gap="xs">
                <Badge>{SECTION_LABELS[section.type]}</Badge>
                <Text c="dimmed">#{index + 1}</Text>
              </Group>
              <Group gap="xs">
                <ActionIcon variant="subtle" onClick={() => reorder(index, 'up')} disabled={index === 0}>
                  <IconArrowUp size={16} />
                </ActionIcon>
                <ActionIcon variant="subtle" onClick={() => reorder(index, 'down')} disabled={index === sections.length - 1}>
                  <IconArrowDown size={16} />
                </ActionIcon>
                <ActionIcon variant="subtle" color="red" onClick={() => removeSection(section.id)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            </Group>
            <Stack gap="md">
              {section.type !== 'hero' ? (
                <TextInput
                  label="Titulek"
                  value={section.title ?? ''}
                  onChange={(event) => updateSection(section.id, { title: event.currentTarget.value })}
                />
              ) : null}
              {section.type !== 'product-grid' && section.type !== 'faq' && section.type !== 'highlights' && section.type !== 'cta' ? (
                <Textarea
                  label="Popis"
                  minRows={2}
                  value={section.description ?? ''}
                  onChange={(event) => updateSection(section.id, { description: event.currentTarget.value })}
                />
              ) : null}
              {renderSectionForm(section)}
            </Stack>
          </Card>
        ))
      )}
    </Stack>
  );
};
