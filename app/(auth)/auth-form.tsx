"use client";

import { useActionState } from "react";
import { Field, FormMessage } from "@/components/ui";
import type { AuthState } from "@/app/auth/actions";

export function AuthForm({
  action,
  submitLabel,
  initialError,
}: {
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  submitLabel: string;
  initialError?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: initialError });
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Correo">
        <input className="input" type="email" name="email" required autoComplete="email" />
      </Field>
      <Field label="Contraseña" hint="Mínimo 8 caracteres">
        <input className="input" type="password" name="password" required minLength={8} autoComplete="current-password" />
      </Field>
      <FormMessage {...state} />
      <button className="btn w-full" disabled={pending}>
        {pending ? "Un momento…" : submitLabel}
      </button>
    </form>
  );
}
