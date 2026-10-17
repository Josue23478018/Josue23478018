import Link from "next/link";
import { signUp } from "@/app/auth/actions";
import { AuthForm } from "../auth-form";

export default function SignupPage() {
  return (
    <>
      <AuthForm action={signUp} submitLabel="Crear cuenta" />
      <p className="text-center text-sm text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="text-accent underline">
          Entra
        </Link>
      </p>
    </>
  );
}
