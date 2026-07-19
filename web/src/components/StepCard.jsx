import { motion } from 'motion/react';

export default function StepCard({ number, title, description }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      viewport={{ once: true }}
      className="relative text-center"
    >
      <div className="mb-6 flex justify-center">
        <div className="w-20 h-20 rounded-full bg-brand/10 flex items-center justify-center border-2 border-brand/20">
          <span className="text-3xl font-black text-brand">{number}</span>
        </div>
      </div>
      <h3 className="text-2xl font-bold mb-4 text-zinc-900 dark:text-zinc-50">{title}</h3>
      <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">{description}</p>
    </motion.div>
  );
}
