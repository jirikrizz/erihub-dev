import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Stack,
  Title,
  Text,
  TextInput,
  Group,
  Loader,
  Divider,
  Switch,
  PasswordInput,
} from '@mantine/core';
import { IconBrandSlack } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import {
  useElogistSettings,
  useGoogleAiSettings,
  useOpenAiSettings,
  useUpdateElogistSettings,
  useUpdateGoogleAiSettings,
  useUpdateOpenAiSettings,
} from '../hooks/useOpenAiSettings';
import {
  useSlackSettings,
  useUpdateSlackSettings,
} from '../hooks/useSlackSettings';

export const ApiSettingsPage = () => {
  const openAiQuery = useOpenAiSettings();
  const updateOpenAi = useUpdateOpenAiSettings();
  const googleAiQuery = useGoogleAiSettings();
  const updateGoogleAi = useUpdateGoogleAiSettings();
  const slackQuery = useSlackSettings();
  const updateSlack = useUpdateSlackSettings();
  const elogistQuery = useElogistSettings();
  const updateElogist = useUpdateElogistSettings();

  const [openAiKey, setOpenAiKey] = useState('');
  const [googleAiKey, setGoogleAiKey] = useState('');
  const [slackToken, setSlackToken] = useState('');
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [slackChannel, setSlackChannel] = useState('');
  const [elogistWsdl, setElogistWsdl] = useState('');
  const [elogistLocation, setElogistLocation] = useState('');
  const [elogistProjectId, setElogistProjectId] = useState('');
  const [elogistLogin, setElogistLogin] = useState('');
  const [elogistPassword, setElogistPassword] = useState('');

  useEffect(() => {
    setOpenAiKey('');
  }, [openAiQuery.data?.has_key]);

  useEffect(() => {
    setGoogleAiKey('');
  }, [googleAiQuery.data?.has_key]);

  useEffect(() => {
    setSlackToken('');
  }, [slackQuery.data?.has_token]);

  useEffect(() => {
    if (!slackQuery.data) {
      setSlackEnabled(false);
      setSlackChannel('');
      return;
    }

    setSlackEnabled(slackQuery.data.enabled);
    setSlackChannel(slackQuery.data.default_channel ?? '');
  }, [slackQuery.data]);

  useEffect(() => {
    if (!elogistQuery.data) {
      setElogistWsdl('');
      setElogistLocation('');
      setElogistProjectId('');
      setElogistLogin('');
      return;
    }

    setElogistWsdl(elogistQuery.data.wsdl ?? '');
    setElogistLocation(elogistQuery.data.location ?? '');
    setElogistProjectId(elogistQuery.data.project_id ?? '');
    setElogistLogin(elogistQuery.data.login ?? '');
  }, [elogistQuery.data]);

  const handleSaveOpenAi = async () => {
    try {
      await updateOpenAi.mutateAsync({ key: openAiKey.trim() || null });
      notifications.show({ message: 'OpenAI klíč uložen.', color: 'green' });
      setOpenAiKey('');
    } catch (error) {
      console.error(error);
      notifications.show({ message: 'Uložení OpenAI klíče se nezdařilo.', color: 'red' });
    }
  };

  const handleRemoveOpenAi = async () => {
    try {
      await updateOpenAi.mutateAsync({ key: null });
      notifications.show({ message: 'OpenAI klíč odstraněn.', color: 'green' });
    } catch (error) {
      console.error(error);
      notifications.show({ message: 'Odstranění klíče se nezdařilo.', color: 'red' });
    }
  };

  const handleSaveSlack = async () => {
    try {
      await updateSlack.mutateAsync({ token: slackToken.trim() || null });
      notifications.show({ message: 'Slack token uložen.', color: 'green' });
      setSlackToken('');
    } catch (error) {
      console.error(error);
      notifications.show({ message: 'Uložení Slack tokenu se nezdařilo.', color: 'red' });
    }
  };

  const handleSaveGoogleAi = async () => {
    try {
      await updateGoogleAi.mutateAsync({ key: googleAiKey.trim() || null });
      notifications.show({ message: 'Google AI klíč uložen.', color: 'green' });
      setGoogleAiKey('');
    } catch (error) {
      console.error(error);
      notifications.show({ message: 'Uložení Google AI klíče se nezdařilo.', color: 'red' });
    }
  };

  const handleRemoveGoogleAi = async () => {
    try {
      await updateGoogleAi.mutateAsync({ key: null });
      notifications.show({ message: 'Google AI klíč odstraněn.', color: 'green' });
    } catch (error) {
      console.error(error);
      notifications.show({ message: 'Odstranění klíče se nezdařilo.', color: 'red' });
    }
  };

  const handleRemoveSlack = async () => {
    try {
      await updateSlack.mutateAsync({ token: null });
      notifications.show({ message: 'Slack token odstraněn.', color: 'green' });
      setSlackEnabled(false);
      setSlackChannel('');
    } catch (error) {
      console.error(error);
      notifications.show({ message: 'Odstranění Slack tokenu se nezdařilo.', color: 'red' });
    }
  };

  const handleSaveSlackSettings = async () => {
    try {
      await updateSlack.mutateAsync({
        enabled: slackEnabled,
        default_channel: slackChannel.trim() || null,
      });
      notifications.show({ message: 'Slack nastavení uloženo.', color: 'green' });
    } catch (error) {
      console.error(error);
      notifications.show({ message: 'Uložení Slack nastavení se nezdařilo.', color: 'red' });
    }
  };

  const handleSaveElogist = async () => {
    try {
      const payload: {
        wsdl?: string | null;
        location?: string | null;
        project_id?: string | null;
        login?: string | null;
        password?: string | null;
      } = {
        wsdl: elogistWsdl.trim() || null,
        location: elogistLocation.trim() || null,
        project_id: elogistProjectId.trim() || null,
        login: elogistLogin.trim() || null,
      };

      if (elogistPassword.trim() !== '') {
        payload.password = elogistPassword.trim();
      }

      await updateElogist.mutateAsync(payload);
      notifications.show({ message: 'Elogist přístup byl uložen.', color: 'green' });
      setElogistPassword('');
    } catch (error) {
      console.error(error);
      notifications.show({ message: 'Uložení přístupu k Elogistu se nezdařilo.', color: 'red' });
    }
  };

  const handleRemoveElogistPassword = async () => {
    try {
      await updateElogist.mutateAsync({ password: null });
      notifications.show({ message: 'Heslo k Elogistu bylo odstraněno.', color: 'green' });
      setElogistPassword('');
    } catch (error) {
      console.error(error);
      notifications.show({ message: 'Odstranění hesla se nezdařilo.', color: 'red' });
    }
  };

  return (
    <Stack gap="lg">
      <Title order={3}>API integrace</Title>

      <Card withBorder>
        <Stack gap="md">
          <div>
            <Title order={4}>OpenAI API klíč</Title>
            <Text size="sm" c="gray.6">
              Klíč využíváme pro AI překlady. Ukládáme ho šifrovaně a zobrazujeme jen poslední čtyři znaky.
            </Text>
          </div>
          {openAiQuery.isLoading ? (
            <Loader size="sm" />
          ) : (
            <Stack gap="sm">
              {openAiQuery.data?.has_key ? (
                <Text size="sm">
                  Aktuálně uložený klíč končí na{' '}
                  <Text span fw={600}>
                    {openAiQuery.data.last_four ?? '****'}
                  </Text>
                  .
                </Text>
              ) : (
                <Text size="sm" c="gray.6">
                  Zatím není uložen žádný klíč.
                </Text>
              )}
              <TextInput
                label="Nový API klíč"
                placeholder="sk-..."
                value={openAiKey}
                onChange={(event) => setOpenAiKey(event.currentTarget.value)}
                type="password"
                autoComplete="off"
              />
              <Group gap="sm">
                <Button
                  onClick={handleSaveOpenAi}
                  loading={updateOpenAi.isPending}
                  disabled={openAiKey.trim() === ''}
                >
                  Uložit klíč
                </Button>
                {openAiQuery.data?.has_key ? (
                  <Button
                    variant="default"
                    color="red"
                    onClick={handleRemoveOpenAi}
                    loading={updateOpenAi.isPending}
                  >
                    Odebrat klíč
                  </Button>
                ) : null}
              </Group>
            </Stack>
          )}
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="md">
          <div>
            <Title order={4}>Google AI (Gemini) klíč</Title>
            <Text size="sm" c="gray.6">
              Slouží pro generování vizuálů modelem Imagen 3 v sekci AI obsahu. Klíč ukládáme šifrovaně a zobrazujeme
              pouze poslední čtyři znaky.
            </Text>
          </div>
          {googleAiQuery.isLoading ? (
            <Loader size="sm" />
          ) : (
            <Stack gap="sm">
              {googleAiQuery.data?.has_key ? (
                <Text size="sm">
                  Aktuálně uložený klíč končí na{' '}
                  <Text span fw={600}>
                    {googleAiQuery.data.last_four ?? '****'}
                  </Text>
                  . Výchozí model:{' '}
                  <Text span fw={600}>
                    {googleAiQuery.data.model ?? 'imagen-3.0-generate-002'}
                  </Text>
                  .
                </Text>
              ) : (
                <Text size="sm" c="gray.6">
                  Zatím není uložen žádný klíč.
                </Text>
              )}
              <TextInput
                label="Gemini API klíč"
                placeholder="AIza..."
                value={googleAiKey}
                onChange={(event) => setGoogleAiKey(event.currentTarget.value)}
                type="password"
                autoComplete="off"
              />
              <Group gap="sm">
                <Button
                  onClick={handleSaveGoogleAi}
                  loading={updateGoogleAi.isPending}
                  disabled={googleAiKey.trim() === ''}
                >
                  Uložit klíč
                </Button>
                {googleAiQuery.data?.has_key ? (
                  <Button
                    variant="default"
                    color="red"
                    onClick={handleRemoveGoogleAi}
                    loading={updateGoogleAi.isPending}
                  >
                    Odebrat klíč
                  </Button>
                ) : null}
              </Group>
            </Stack>
          )}
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="md">
          <div>
            <Group gap="xs">
              <IconBrandSlack size={18} />
              <Title order={4}>Slack bot token</Title>
            </Group>
            <Text size="sm" c="gray.6">
              Používáme ho pro odesílání notifikací do Slack kanálů. Token ukládáme šifrovaně, zobrazujeme jen
              poslední čtyři znaky.
            </Text>
          </div>
          {slackQuery.isLoading ? (
            <Loader size="sm" />
          ) : (
            <Stack gap="md">
              <Stack gap="sm">
                {slackQuery.data?.has_token ? (
                  <Text size="sm">
                    Aktuálně uložený token končí na{' '}
                    <Text span fw={600}>
                      {slackQuery.data.last_four ?? '****'}
                    </Text>
                    .
                  </Text>
                ) : (
                  <Text size="sm" c="gray.6">
                    Zatím není uložen žádný token.
                  </Text>
                )}
                <TextInput
                  label="Slack bot token"
                  placeholder="xoxb-..."
                  value={slackToken}
                  onChange={(event) => setSlackToken(event.currentTarget.value)}
                  type="password"
                  autoComplete="off"
                  disabled={updateSlack.isPending}
                />
                <Group gap="sm">
                  <Button
                    onClick={handleSaveSlack}
                    loading={updateSlack.isPending}
                    disabled={slackToken.trim() === ''}
                  >
                    Uložit token
                  </Button>
                  {slackQuery.data?.has_token ? (
                    <Button
                      variant="default"
                      color="red"
                      onClick={handleRemoveSlack}
                      loading={updateSlack.isPending}
                    >
                      Odebrat token
                    </Button>
                  ) : null}
                </Group>
              </Stack>
              <Divider />
              <Stack gap="sm">
                <Stack gap="xs">
                  <Switch
                    label="Slack notifikace zapnuté"
                    checked={slackEnabled}
                    onChange={(event) => setSlackEnabled(event.currentTarget.checked)}
                    disabled={updateSlack.isPending}
                  />
                  <Text size="sm" c="gray.6">
                    Pokud je přepínač vypnutý, do Slacku se nic neposílá. Po zapnutí se použije výchozí kanál
                    níže.
                  </Text>
                </Stack>
                <TextInput
                  label="Výchozí Slack kanál"
                  description="Zadej název (např. #notifikace) nebo ID kanálu, do kterého se mají posílat zprávy."
                  placeholder="#notifikace nebo C12345678"
                  value={slackChannel}
                  onChange={(event) => setSlackChannel(event.currentTarget.value)}
                  disabled={updateSlack.isPending}
                  autoComplete="off"
                />
                <Group gap="sm">
                  <Button onClick={handleSaveSlackSettings} loading={updateSlack.isPending}>
                    Uložit Slack nastavení
                  </Button>
                </Group>
              </Stack>
            </Stack>
          )}
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="md">
          <div>
            <Title order={4}>Elogist (Shipmall)</Title>
            <Text size="sm" c="gray.6">
              Hlídač skladu využívá přístup do Elogist API pro kontrolu zásob. Pokud některé pole necháš prázdné, použije
              se výchozí konfigurace z&nbsp;.env nebo lokálního souboru <code>ShipmallSoapAPI_v1.26.wsdl</code>.
            </Text>
          </div>
          {elogistQuery.isLoading ? (
            <Loader size="sm" />
          ) : (
            <Stack gap="sm">
              <TextInput
                label="WSDL soubor"
                placeholder="ShipmallSoapAPI_v1.26.wsdl"
                value={elogistWsdl}
                onChange={(event) => setElogistWsdl(event.currentTarget.value)}
              />
              <TextInput
                label="SOAP endpoint"
                placeholder="https://elogist-demo.shipmall.cz/api/soap"
                value={elogistLocation}
                onChange={(event) => setElogistLocation(event.currentTarget.value)}
              />
              <TextInput
                label="Project ID"
                placeholder="např. empleada"
                value={elogistProjectId}
                onChange={(event) => setElogistProjectId(event.currentTarget.value)}
              />
              <TextInput
                label="Přihlašovací jméno"
                placeholder="uživatelské jméno"
                value={elogistLogin}
                onChange={(event) => setElogistLogin(event.currentTarget.value)}
              />
              <PasswordInput
                label="Heslo"
                placeholder={
                  elogistQuery.data?.has_password
                    ? `Heslo je uložené${elogistQuery.data.password_last_four ? ` (••••${elogistQuery.data.password_last_four})` : ''}`
                    : 'Zadej heslo k Elogistu'
                }
                value={elogistPassword}
                onChange={(event) => setElogistPassword(event.currentTarget.value)}
                autoComplete="off"
              />
              <Group gap="sm">
                <Button onClick={handleSaveElogist} loading={updateElogist.isPending} disabled={updateElogist.isPending}>
                  Uložit přístup
                </Button>
                {elogistQuery.data?.has_password ? (
                  <Button
                    variant="default"
                    color="red"
                    onClick={handleRemoveElogistPassword}
                    loading={updateElogist.isPending}
                  >
                    Odebrat heslo
                  </Button>
                ) : null}
              </Group>
            </Stack>
          )}
        </Stack>
      </Card>

      <Divider label="Poznámka" labelPosition="center" />
      <Text size="sm" c="gray.6">
        Tokeny ukládáme šifrovaně v interním storage. Po uložení jsou dostupné jen z backendu – UI vždy zobrazuje
        pouze poslední čtyři znaky.
      </Text>
    </Stack>
  );
};
