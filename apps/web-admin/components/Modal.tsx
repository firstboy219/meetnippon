'use client';
import React from 'react';

export function Modal({ title, sub, onClose, children, footer }: {
  title: string; sub?: string; onClose: () => void;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="close" onClick={onClose}>×</button>
        </div>
        {sub ? <div className="modal-sub">{sub}</div> : null}
        {children}
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
