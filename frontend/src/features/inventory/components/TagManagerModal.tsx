import type { InventoryVariantTag } from '../../../api/inventory';
import {
  TagManagerModal as SharedTagManagerModal,
  type TagDefinition,
  type TagManagerModalProps,
} from '../../../components/tags/TagManagerModal';

type InventoryTagManagerProps = Omit<TagManagerModalProps, 'tags'> & {
  tags: InventoryVariantTag[];
};

const mapToDefinition = (tags: InventoryVariantTag[]): TagDefinition[] =>
  tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    is_hidden: tag.is_hidden,
  }));

export const TagManagerModal = ({ tags, ...rest }: InventoryTagManagerProps) => (
  <SharedTagManagerModal tags={mapToDefinition(tags)} {...rest} />
);
