export default function FeatureCard({ icon, title, description }) {
  return (
    <div className="p-8 rounded-3xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 hover:border-brand/30 dark:hover:border-brand/20 transition-all duration-300 group">
      <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mb-6 group-hover:bg-brand/20 transition-colors">
        <div className="text-brand">
          {icon}
        </div>
      </div>
      <h3 className="text-xl font-bold mb-3 text-zinc-900 dark:text-zinc-50">{title}</h3>
      <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">{description}</p>
    </div>
  );
}
