"use client";

import { motion } from "framer-motion";

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-20 px-6 text-center"
    >
      <span className="text-6xl mb-4">{icon}</span>
      <h3 className="font-display text-xl font-semibold text-[var(--text-primary)] mb-2">
        {title}
      </h3>
      <p className="text-sm text-[var(--text-muted)] max-w-sm mb-6">{description}</p>
      {action}
    </motion.div>
  );
}
