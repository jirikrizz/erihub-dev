import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  fetchCustomer,
  fetchCustomerByGuid,
  fetchCustomerByEmail,
  fetchCustomers,
  fetchVipCustomers,
} from '../../../api/customers';

export const useCustomers = (params: Record<string, unknown>) =>
  useQuery({
    queryKey: ['customers', params],
    queryFn: () => fetchCustomers(params),
    placeholderData: keepPreviousData,
  });

export const useCustomer = (id: string | undefined) =>
  useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: () => fetchCustomer(id!),
    enabled: !!id,
  });

export const useCustomerByGuid = (guid: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['customers', 'detail-guid', guid],
    queryFn: () => fetchCustomerByGuid(guid!),
    enabled: !!guid && enabled,
    staleTime: 30 * 1000,
    retry: false,
  });

export const useCustomerByEmail = (email: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['customers', 'detail-email', email],
    queryFn: () => fetchCustomerByEmail(email!),
    enabled: !!email && enabled,
    staleTime: 30 * 1000,
    retry: false,
  });

export const useVipCustomers = (params: Record<string, unknown>) =>
  useQuery({
    queryKey: ['customers', 'vip', params],
    queryFn: () => fetchVipCustomers({ include_filters: 1, ...params }),
    placeholderData: keepPreviousData,
  });
