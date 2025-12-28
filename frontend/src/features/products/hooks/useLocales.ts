import { useQuery } from '@tanstack/react-query';
import { fetchLocales } from '../../../api/pim';

export const useLocales = () =>
  useQuery({
    queryKey: ['pim-locales'],
    queryFn: fetchLocales,
  });
