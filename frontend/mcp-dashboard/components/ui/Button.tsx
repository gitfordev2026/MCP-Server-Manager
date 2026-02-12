interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

export default function Button({ children, onClick, className = '', type = 'button' }: ButtonProps) {
  return (
    <button type={type} onClick={onClick} className={`cursor-pointer ${className}`}>
      {children}
    </button>
  );
}
