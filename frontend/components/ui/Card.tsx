interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`p-5 bg-white/80 dark:bg-slate-900/80 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 backdrop-blur-xl transition-colors duration-200 text-slate-900 dark:text-slate-100 ${className}`}
    >
      {children}
    </div>
  );
}
