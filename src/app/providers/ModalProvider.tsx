'use client';

import React, { useContext, useState } from 'react';
import { createPortal } from 'react-dom';

const ModalContext = React.createContext<{
  openModal: (modal: React.ReactElement) => void;
  closeModal: () => void;
}>({
  openModal: () => {},
  closeModal: () => {},
});

export const useModal = () => useContext(ModalContext);

export default function ModalProvider({ children }: React.PropsWithChildren) {
  const [modal, setModal] = useState<React.ReactElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openModal = (modal: React.ReactElement) => {
    setModal(modal);
    setIsOpen(true);
  };

  const closeModal = () => setIsOpen(false);

  return (
    <ModalContext.Provider
      value={{
        openModal,
        closeModal,
      }}
    >
      {children}
      {isOpen && modal ? createPortal(modal, document.body) : null}
    </ModalContext.Provider>
  );
}
