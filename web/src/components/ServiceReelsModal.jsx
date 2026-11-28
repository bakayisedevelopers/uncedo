import ServiceReelsView from './ServiceReelsView';

export default function ServiceReelsModal({
  items = [],
  initialItemId = '',
  likedIds = new Set(),
  onToggleLike,
  onImageError,
  onActiveItemChange,
  onClose,
}) {
  return (
    <ServiceReelsView
      mode="modal"
      items={items}
      allItems={items}
      initialItemId={initialItemId}
      likedIds={likedIds}
      onToggleLike={onToggleLike}
      onImageError={onImageError}
      onActiveItemChange={onActiveItemChange}
      onClose={onClose}
    />
  );
}
