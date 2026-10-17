import Link from "next/link";
import { signIn } from "@/app/auth/actions";
import { AuthForm } from "../auth-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
      <AuthForm
        action={signIn}
        submitLabel="Entrar"
        initialError={error === "confirmacion" ? "El enlace de confirmación no es válido o expiró." : undefined}
      />
      <p className="text-center text-sm text-muted">
        ¿No tienes cuenta?{" "}
        <Link href="/signup" className="text-accent underline">
          Regístrate
        </Link>
      </p>
    </>
  );
}
