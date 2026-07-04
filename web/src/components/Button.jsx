export default function Button({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '',
  ...props 
}) {
  const baseStyles = 'font-bold rounded-lg transition-all duration-200 inline-flex items-center justify-center';
  
  const sizeStyles = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-2.5 text-base',
    lg: 'px-8 py-3.5 text-lg',
  };

  const variantStyles = {
    primary: 'bg-brand hover:bg-brand-dark text-white shadow-lg shadow-brand/30 hover:shadow-lg hover:shadow-brand/40',
    secondary: 'bg-white hover:bg-zinc-50 text-zinc-900 border border-zinc-200 shadow-md hover:shadow-lg dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-white dark:border-zinc-700',
  };

  return (
    <button 
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
