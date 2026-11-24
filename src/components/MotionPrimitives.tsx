import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

export const SPRING_SOFT = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 26,
  mass: 0.85,
};

export const SPRING_SNAPPY = {
  type: 'spring' as const,
  stiffness: 460,
  damping: 28,
  mass: 0.7,
};

export const VIEW_TRANSITION = {
  type: 'spring' as const,
  stiffness: 360,
  damping: 28,
  mass: 0.85,
};

interface AnimatedModalProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  maxWidthClass?: string;
  overlayClassName?: string;
  panelClassName?: string;
  children: ReactNode;
}

export function AnimatedModal({
  open,
  onClose,
  labelledBy,
  maxWidthClass = 'max-w-lg',
  overlayClassName = '',
  panelClassName = '',
  children,
}: AnimatedModalProps) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
            }
          }}
          className={`sgn-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm p-4 overflow-y-auto ${overlayClassName}`}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={SPRING_SOFT}
            className={`sgn-modal-panel w-full ${maxWidthClass} rounded-xl border border-slate-200/90 bg-white overflow-hidden shadow-2xl my-auto ${panelClassName}`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface AnimatedTabPanelProps {
  tabKey: string;
  children: ReactNode;
}

export function AnimatedTabPanel({ tabKey, children }: AnimatedTabPanelProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tabKey}
        initial={{ opacity: 0, scale: 0.985, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.99, y: -4 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

interface AnimatedNoticeProps {
  visible: boolean;
  noticeKey?: string;
  children: ReactNode;
}

export function AnimatedNotice({ visible, noticeKey, children }: AnimatedNoticeProps) {
  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key={noticeKey ?? 'notice'}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={SPRING_SNAPPY}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
