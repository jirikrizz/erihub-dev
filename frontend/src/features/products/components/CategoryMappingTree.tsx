import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Badge, Group, Highlight, Stack, Text, Tooltip } from '@mantine/core';
import { IconAlertCircle, IconChevronDown, IconChevronRight, IconX } from '@tabler/icons-react';
import { useDrag, useDrop } from 'react-dnd';
import type { CategoryTreeNode, ShopTreeNode } from '../../../api/pim';

const DRAG_TYPE = 'SHOP_CATEGORY_NODE';

type ShopDragItem = {
  id: string;
  name: string;
  path: string | null;
};

type CanonicalTreeProps = {
  nodes: CategoryTreeNode[];
  onDrop: (canonicalId: string, shopCategoryNodeId: string) => void;
  onClear: (canonicalId: string) => void;
  highlightTerm: string;
  expandSignal: number;
  collapseSignal: number;
};

type ShopTreeProps = {
  nodes: ShopTreeNode[];
  highlightTerm: string;
  expandSignal: number;
  collapseSignal: number;
};

const statusColor = (status: string | null | undefined): string => {
  switch (status) {
    case 'confirmed':
      return 'green';
    case 'suggested':
      return 'yellow';
    case 'rejected':
      return 'red';
    case 'canonical':
      return 'blue';
    default:
      return 'gray';
  }
};

const statusLabel = (status: string | null | undefined): string => {
  switch (status) {
    case 'confirmed':
      return 'Potvrzeno';
    case 'suggested':
      return 'Navrženo';
    case 'rejected':
      return 'Odmítnuto';
    case 'canonical':
      return 'Master';
    default:
      return 'Nenamapováno';
  }
};

const TreeToggle = ({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) => (
  <ActionIcon size="xs" variant="subtle" onClick={onToggle} aria-label="toggle">
    {collapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
  </ActionIcon>
);

const CanonicalTreeNode = ({
  node,
  depth,
  onDrop,
  onClear,
  highlightTerm,
  expandSignal,
  collapseSignal,
}: {
  node: CategoryTreeNode;
  depth: number;
  onDrop: (canonicalId: string, shopCategoryNodeId: string) => void;
  onClear: (canonicalId: string) => void;
  highlightTerm: string;
  expandSignal: number;
  collapseSignal: number;
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [{ isOver, canDrop }, dropRef] = useDrop<ShopDragItem, void, { isOver: boolean; canDrop: boolean }>(
    () => ({
      accept: DRAG_TYPE,
      drop: (item) => {
        onDrop(node.id, item.id);
      },
      canDrop: () => node.mapping?.status !== 'canonical',
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [node.id, onDrop, node.mapping?.status]
  );

  dropRef(containerRef);

  useEffect(() => {
    if (node.children.length > 0) {
      setCollapsed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandSignal]);

  useEffect(() => {
    if (node.children.length > 0) {
      setCollapsed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseSignal]);

  const mappingStatus = node.mapping?.status ?? null;
  const mappingLabel = node.mapping?.shop_category?.path ?? node.mapping?.shop_category?.name ?? '—';

  const borderStyle = isOver && canDrop ? '1px dashed var(--mantine-color-blue-outline)' : '1px solid transparent';
  const backgroundColor = isOver && canDrop ? 'var(--mantine-color-blue-light-0)' : 'transparent';

  const highlightValue = highlightTerm.trim();
  const nameContent = highlightValue ? (
    <Highlight highlight={highlightValue} size="sm" fw={500}>
      {node.name}
    </Highlight>
  ) : (
    <Text size="sm" fw={500}>
      {node.name}
    </Text>
  );

  const pathContent = node.path
    ? highlightValue ? (
        <Highlight highlight={highlightValue} size="xs" c="dimmed">
          {node.path}
        </Highlight>
      ) : (
        <Text size="xs" c="dimmed">
          {node.path}
        </Text>
      )
    : null;

  const mappingContent = mappingStatus !== 'canonical' && node.mapping
    ? highlightValue ? (
        <Highlight highlight={highlightValue} size="xs" c="dimmed" pl="lg">
          {mappingLabel}
        </Highlight>
      ) : (
        <Text size="xs" c="dimmed" pl="lg">
          {mappingLabel}
        </Text>
      )
    : null;

  return (
    <Stack
      gap={4}
      style={{ borderLeft: depth > 0 ? '1px solid var(--mantine-color-gray-2)' : 'none' }}
      pl={depth > 0 ? 'sm' : 0}
      ref={containerRef}
    >
      <Group gap="xs" justify="space-between" style={{ border: borderStyle, backgroundColor, borderRadius: 6, padding: '4px 6px' }}>
        <Group gap={6}>
          {node.children.length > 0 ? (
            <TreeToggle collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
          ) : (
            <div style={{ width: 18 }} />
          )}
          <Stack gap={0}>
            {nameContent}
            {pathContent}
          </Stack>
        </Group>
        <Group gap={6}>
          <Badge color={statusColor(mappingStatus)} size="sm" variant="light">
            {statusLabel(mappingStatus)}
          </Badge>
          {mappingStatus && mappingStatus !== 'canonical' ? (
            <Tooltip label="Zrušit mapování">
              <ActionIcon size="sm" variant="light" color="red" onClick={() => onClear(node.id)} aria-label="zrušit mapování">
                <IconX size={14} />
              </ActionIcon>
            </Tooltip>
          ) : null}
        </Group>
      </Group>
      {mappingContent}
      {!collapsed && node.children.length > 0 ? (
        <Stack gap={6} pl="md">
          {node.children.map((child) => (
            <CanonicalTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onDrop={onDrop}
              onClear={onClear}
              highlightTerm={highlightTerm}
              expandSignal={expandSignal}
              collapseSignal={collapseSignal}
            />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
};

const ShopTreeNode = ({
  node,
  depth,
  highlightTerm,
  expandSignal,
  collapseSignal,
}: {
  node: ShopTreeNode;
  depth: number;
  highlightTerm: string;
  expandSignal: number;
  collapseSignal: number;
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [{ isDragging }, dragRef] = useDrag(
    () => ({
      type: DRAG_TYPE,
      item: { id: node.id, name: node.name, path: node.path },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    }),
    [node.id, node.name, node.path]
  );

  const dragTargetRef = useRef<HTMLDivElement | null>(null);
  dragRef(dragTargetRef);

  useEffect(() => {
    if (node.children.length > 0) {
      setCollapsed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandSignal]);

  useEffect(() => {
    if (node.children.length > 0) {
      setCollapsed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseSignal]);

  const highlightValue = highlightTerm.trim();
  const nameContent = highlightValue ? (
    <Highlight highlight={highlightValue} size="sm" fw={500}>
      {node.name}
    </Highlight>
  ) : (
    <Text size="sm" fw={500}>
      {node.name}
    </Text>
  );

  const pathContent = node.path
    ? highlightValue ? (
        <Highlight highlight={highlightValue} size="xs" c="dimmed">
          {node.path}
        </Highlight>
      ) : (
        <Text size="xs" c="dimmed">
          {node.path}
        </Text>
      )
    : null;

  return (
    <Stack
      gap={4}
      style={{
        opacity: isDragging ? 0.4 : 1,
        borderLeft: depth > 0 ? '1px solid var(--mantine-color-gray-2)' : 'none',
      }}
      pl={depth > 0 ? 'sm' : 0}
    >
      <Group gap="xs" ref={dragTargetRef} style={{ padding: '4px 6px', borderRadius: 6 }}>
        {node.children.length > 0 ? (
          <TreeToggle collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
        ) : (
          <div style={{ width: 18 }} />
        )}
        <Stack gap={0}>
          {nameContent}
          {pathContent}
        </Stack>
      </Group>
      {!collapsed && node.children.length > 0 ? (
        <Stack gap={6} pl="md">
          {node.children.map((child) => (
            <ShopTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              highlightTerm={highlightTerm}
              expandSignal={expandSignal}
              collapseSignal={collapseSignal}
            />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
};

export const CanonicalTree = ({
  nodes,
  onDrop,
  onClear,
  highlightTerm,
  expandSignal,
  collapseSignal,
}: CanonicalTreeProps) => {
  if (nodes.length === 0) {
    return (
      <Stack gap={6} align="center" justify="center" mih={160}>
        <IconAlertCircle size={28} color="var(--mantine-color-yellow-text)" />
        <Text size="sm" c="dimmed">
          Žádné kanonické kategorie nenalezeny.
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap={8}>
      {nodes.map((node) => (
        <CanonicalTreeNode
          key={node.id}
          node={node}
          depth={0}
          onDrop={onDrop}
          onClear={onClear}
          highlightTerm={highlightTerm}
          expandSignal={expandSignal}
          collapseSignal={collapseSignal}
        />
      ))}
    </Stack>
  );
};

export const ShopTree = ({ nodes, highlightTerm, expandSignal, collapseSignal }: ShopTreeProps) => {
  if (nodes.length === 0) {
    return (
      <Stack gap={6} align="center" justify="center" mih={160}>
        <IconAlertCircle size={28} color="var(--mantine-color-yellow-text)" />
        <Text size="sm" c="dimmed">
          V cílovém shopu nejsou žádné kategorie.
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap={8}>
      {nodes.map((node) => (
        <ShopTreeNode
          key={node.id}
          node={node}
          depth={0}
          highlightTerm={highlightTerm}
          expandSignal={expandSignal}
          collapseSignal={collapseSignal}
        />
      ))}
    </Stack>
  );
};