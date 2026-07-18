import React from 'react';

interface ModalProps {
  isOpen: boolean;
  /** Called when the user clicks the backdrop (omit to disable backdrop-close). */
  onClose?: () => void;
  /** Tailwind max-width class for the panel. */
  maxWidthClass?: string;
  /** Tailwind z-index class for the overlay (higher = on top of other modals). */
  zIndexClass?: string;
  children: React.ReactNode;
}

/**
 * Universal modal: fixed backdrop, centered panel capped at 90vh with its own
 * scrollbar (so content is reachable on small displays), click-outside to
 * close when onClose is provided.
 */
const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  maxWidthClass = 'max-w-lg',
  zIndexClass = 'z-[60]',
  children,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm`}
      onClick={onClose}
    >
      <div
        className={`max-h-[90vh] w-full ${maxWidthClass} overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};

export default Modal;
