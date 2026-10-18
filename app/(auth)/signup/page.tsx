import Link from "next/link";
import { signUp } from "@/app/auth/actions";
import { AuthForm } from "../auth-form";

export default function SignupPage() {
  return (
    <>
      <div className="space-y-1">
        <h1 className="h2">Crea tu cuenta</h1>
        <p className="text-sm text-muted">Solo necesitas un correo y una contraseña.</p>
      </div>
      <AuthForm action={signUp} submitLabel="Crear cuenta" />
      <p className="border-t border-border pt-4 text-center text-sm text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="link">
          Entra
        </Link>
      </p>
    </>
  );
}
