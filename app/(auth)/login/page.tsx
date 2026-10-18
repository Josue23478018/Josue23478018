import Link from "next/link";
import { signIn } from "@/app/auth/actions";
import { AuthForm } from "../auth-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
      <div className="space-y-1">
        <h1 className="h2">Inicia sesión</h1>
        <p className="text-sm text-muted">Entra con tu correo y contraseña.</p>
      </div>
      <AuthForm
        action={signIn}
        submitLabel="Entrar"
        initialError={error === "confirmacion" ? "El enlace de confirmación no es válido o expiró." : undefined}
      />
      <p className="border-t border-border pt-4 text-center text-sm text-muted">
        ¿No tienes cuenta?{" "}
        <Link href="/signup" className="link">
          Regístrate
        </Link>
      </p>
    </>
  );
}
