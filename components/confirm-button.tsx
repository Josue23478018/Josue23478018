"use client";

// Botón de envío que pide confirmación antes de una acción que no se puede deshacer.
export function ConfirmButton({
  message,
  className,
  children,
  ...rest
}: { message: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
