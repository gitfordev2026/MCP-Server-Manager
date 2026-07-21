interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`${className} p-4 bg-slate-800/50 rounded-lg shadow-lg backdrop-blur-xl border border-purple-500/20 dark:bg-slate-800/50 dark:shadow-purple-500/20`}>
      {children}
    </div>
  );
}
