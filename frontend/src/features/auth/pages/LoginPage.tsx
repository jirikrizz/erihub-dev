import { zodResolver } from '@hookform/resolvers/zod';
import { Anchor, Box, Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useLogin } from '../hooks/useLogin';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store';
import { findSectionByPath, firstAccessibleSectionPath } from '../../../app/sections';

const schema = z.object({
  email: z.string().email({ message: 'Vyplň platný e-mail' }),
  password: z.string().min(6, { message: 'Heslo musí mít alespoň 6 znaků' }),
});

type FormValues = z.infer<typeof schema>;

export const LoginPage = () => {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const { mutateAsync, isPending, isError, error } = useLogin();
  const token = useAuthStore((state) => state.token);
  const sections = useAuthStore((state) => state.user?.sections);
  const location = useLocation();

  if (token) {
    const redirectState = (location.state as { from?: { pathname?: string } } | undefined)?.from?.pathname;
    const fallback = firstAccessibleSectionPath(sections ?? []) ?? '/';

    if (redirectState) {
      const section = findSectionByPath(redirectState);
      if (!section || !sections?.includes(section.key)) {
        return <Navigate to={fallback} replace />;
      }

      return <Navigate to={redirectState} replace />;
    }

    return <Navigate to={fallback} replace />;
  }

  const onSubmit = async (values: FormValues) => {
    await mutateAsync({ ...values, device_name: 'frontend' });
  };

  return (
    <Stack justify="center" align="center" h="100vh">
      <Paper shadow="sm" radius="md" p="xl" w={360}>
        <Title order={3} ta="center" mb="lg">
          Přihlášení do HUBu
        </Title>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Stack gap="sm">
            <Controller
              name="email"
              control={control}
              render={({ field }) => (
                <TextInput
                  label="E-mail"
                  placeholder="admin@example.com"
                  error={errors.email?.message}
                  {...field}
                />
              )}
            />
            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <PasswordInput
                  label="Heslo"
                  placeholder="********"
                  error={errors.password?.message}
                  {...field}
                />
              )}
            />
            {isError && (
              <Box>
                <Text c="red" size="sm">
                  {error instanceof Error ? error.message : 'Přihlášení se nezdařilo'}
                </Text>
              </Box>
            )}
            <Button type="submit" loading={isPending}>
              Přihlásit
            </Button>
          </Stack>
        </form>
        <Box ta="center" mt="md">
          <Anchor size="xs" component="button">
            Zapomněli jste heslo?
          </Anchor>
        </Box>
      </Paper>
    </Stack>
  );
};