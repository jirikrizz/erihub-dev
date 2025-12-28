import { Badge, type BadgeProps } from '@mantine/core';
import { getShopProviderDefinition } from '../../constants/shopProviders';

type ShopProviderBadgeProps = {
  provider?: string | null;
  size?: BadgeProps['size'];
  variant?: BadgeProps['variant'];
  radius?: BadgeProps['radius'];
};

export const ShopProviderBadge = ({
  provider,
  size = 'xs',
  variant = 'light',
  radius = 'sm',
}: ShopProviderBadgeProps) => {
  const definition = getShopProviderDefinition(provider);

  return (
    <Badge
      size={size}
      variant={variant}
      color={definition.badgeColor}
      radius={radius}
    >
      {definition.label}
    </Badge>
  );
};
