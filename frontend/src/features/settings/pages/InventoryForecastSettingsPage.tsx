import {
  Alert,
  Button,
  Card,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { notifications } from '@mantine/notifications';
import type { InventoryForecastProfile } from '../../../api/settings';
import {
  useInventoryForecastProfile,
  useUpdateInventoryForecastProfile,
} from '../hooks/useInventoryForecastProfile';

const seasonalityOptions = [
  { label: 'Žádná / minimální', value: 'none', description: 'Prodej je celoročně stabilní.' },
  { label: 'Střídavá', value: 'moderate', description: 'Objevují se silnější a slabší měsíce.' },
  { label: 'Výrazné špičky', value: 'peaks', description: 'Sezónní kampaně nebo několikrát do roka extrémní poptávka.' },
];

const cashflowOptions = [
  { label: 'Šetřit zásobu', value: 'conserve', description: 'Upřednostnit cashflow, nízké skladové zásoby.' },
  { label: 'Vyváženě', value: 'balanced', description: 'Držet zásobu podle obvyklé poptávky.' },
  { label: 'Investovat do růstu', value: 'invest', description: 'Nechci přijít o prodeje, raději větší zásobu.' },
];

const growthOptions = [
  { label: 'Stabilizovat', value: 'stabilize', description: 'Primárně držet servis stávajících zákazníků.' },
  { label: 'Růst', value: 'grow', description: 'Postupně navyšovat výkon a sortiment.' },
  { label: 'Expandovat', value: 'expand', description: 'Agresivní růst do nových kanálů nebo zemí.' },
];

const optionDescription = (value: string, list: Array<{ value: string; description?: string }>) =>
  list.find((item) => item.value === value)?.description ?? '';

export const InventoryForecastSettingsPage = () => {
  const profileQuery = useInventoryForecastProfile();
  const updateMutation = useUpdateInventoryForecastProfile();

  const defaults = useMemo<InventoryForecastProfile>(
    () => ({ seasonality: 'moderate', cashflow_strategy: 'balanced', growth_focus: 'grow', notes: null }),
    []
  );

  const [profile, setProfile] = useState<InventoryForecastProfile>(defaults);

  useEffect(() => {
    if (profileQuery.data) {
      setProfile({ ...defaults, ...profileQuery.data });
    }
  }, [defaults, profileQuery.data]);

  const handleChange = (key: keyof InventoryForecastProfile, value: string | null) => {
    setProfile((current) => ({
      ...current,
      [key]: value ?? null,
    }));
  };

  const handleSubmit = () => {
    updateMutation.mutate(profile, {
      onSuccess: () => {
        notifications.show({
          title: 'Uloženo',
          message: 'Profil pro AI odhady zásob byl uložen.',
          color: 'green',
        });
      },
      onError: () => {
        notifications.show({
          title: 'Chyba',
          message: 'Profil se nepodařilo uložit. Zkus to prosím znovu.',
          color: 'red',
        });
      },
    });
  };

  if (profileQuery.isLoading) {
    return (
      <Group justify="center">
        <Loader />
      </Group>
    );
  }

  return (
    <Stack gap="lg">
      <Title order={3}>AI odhady zásob</Title>
      <Text c="dimmed" size="sm">
        Tato nastavení poskytují AI asistenci kontext o tvém podnikání. Využívá je například odhad
        výdrže zásob u jednotlivých variant.
      </Text>
      <Card withBorder>
        <Stack gap="lg">
          <Stack gap={4}>
            <Text fw={600}>Sezónnost poptávky</Text>
            <SegmentedControl
              value={profile.seasonality}
              onChange={(value) => handleChange('seasonality', value)}
              data={seasonalityOptions.map(({ label, value }) => ({ label, value }))}
              fullWidth
            />
            <Text size="sm" c="dimmed">
              {optionDescription(profile.seasonality, seasonalityOptions)}
            </Text>
          </Stack>

          <Stack gap={4}>
            <Text fw={600}>Strategie cashflow</Text>
            <SegmentedControl
              value={profile.cashflow_strategy}
              onChange={(value) => handleChange('cashflow_strategy', value)}
              data={cashflowOptions.map(({ label, value }) => ({ label, value }))}
              fullWidth
            />
            <Text size="sm" c="dimmed">
              {optionDescription(profile.cashflow_strategy, cashflowOptions)}
            </Text>
          </Stack>

          <Stack gap={4}>
            <Text fw={600}>Růstové priority</Text>
            <SegmentedControl
              value={profile.growth_focus}
              onChange={(value) => handleChange('growth_focus', value)}
              data={growthOptions.map(({ label, value }) => ({ label, value }))}
              fullWidth
            />
            <Text size="sm" c="dimmed">
              {optionDescription(profile.growth_focus, growthOptions)}
            </Text>
          </Stack>

          <Stack gap={4}>
            <Text fw={600}>Další poznámky</Text>
            <Textarea
              minRows={4}
              placeholder="Specifika sortimentu, limitace cashflow, marketingové plánování apod."
              value={profile.notes ?? ''}
              onChange={(event) => {
                const next = event.currentTarget.value;
                setProfile((current) => ({
                  ...current,
                  notes: next.trim() === '' ? null : next,
                }));
              }}
            />
            <Text size="xs" c="dimmed">
              Maximálně 1000 znaků. Poznámky pomohou AI lépe pochopit souvislosti.
            </Text>
          </Stack>

          <Group justify="space-between" align="center">
            <Alert icon={<IconAlertCircle size={16} />} color="blue" variant="light" radius="sm" maw={480}>
              Změny se projeví u dalších AI odhadů zásob. Existující výstupy zůstávají beze změny.
            </Alert>
            <Button onClick={handleSubmit} loading={updateMutation.isPending}>
              Uložit nastavení
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
};