export type ShopProviderValue = string;

export type ShopProviderDefinition = {
  value: ShopProviderValue;
  label: string;
  badgeColor: string;
  description?: string;
};

const BASE_DEFINITIONS: ShopProviderDefinition[] = [
  {
    value: 'shoptet',
    label: 'Shoptet',
    badgeColor: 'ocean',
  },
  {
    value: 'woocommerce',
    label: 'Mobilní appka',
    badgeColor: 'teal',
    description: 'Objednávky z mobilní aplikace napojené přes WooCommerce.',
  },
  {
    value: 'app',
    label: 'Legacy mobilní appka',
    badgeColor: 'grape',
    description: 'Historické napojení mobilní aplikace.',
  },
];

const FALLBACK_DEFINITION: ShopProviderDefinition = {
  value: 'external',
  label: 'Externí zdroj',
  badgeColor: 'gray',
};

const definitionMap = new Map(BASE_DEFINITIONS.map((definition) => [definition.value, definition]));

export const getShopProviderDefinition = (value: string | null | undefined): ShopProviderDefinition => {
  if (!value) {
    return definitionMap.get('shoptet') ?? FALLBACK_DEFINITION;
  }

  const normalized = value.toLowerCase();

  if (definitionMap.has(normalized)) {
    return definitionMap.get(normalized)!;
  }

  return {
    value: normalized,
    label: normalized.replace(/^[a-z]/, (letter) => letter.toUpperCase()),
    badgeColor: FALLBACK_DEFINITION.badgeColor,
  };
};

export const shopProviderOptions = (values: Iterable<string | null | undefined>): Array<{
  value: string;
  label: string;
}> => {
  const unique = new Map<string, string>();

  for (const raw of values) {
    const definition = getShopProviderDefinition(raw);
    unique.set(definition.value, definition.label);
  }

  return Array.from(unique.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'cs'));
};

export const baseShopProviders = (): ShopProviderDefinition[] => Array.from(definitionMap.values());
