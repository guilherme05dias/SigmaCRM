import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loginAction } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const currentUser = await getCurrentUser();
  if (currentUser) redirect("/dashboard");

  const { error } = await searchParams;

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand login-brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>ServiçoCRM</strong>
            <span>Operação técnica</span>
          </div>
        </div>

        <div>
          <span className="eyebrow">Acesso</span>
          <h1>Entrar no CRM</h1>
          <p>Use o acesso demo temporário: admin / admin123.</p>
        </div>

        {error ? (
          <div className="login-error">
            {error}
          </div>
        ) : null}

        <form action={loginAction} className="login-form">
          <label>
            Login
            <input autoComplete="username" name="username" placeholder="admin" required />
          </label>

          <label>
            Senha
            <input autoComplete="current-password" name="password" required type="password" />
          </label>

          <button className="button button-primary" type="submit">
            Entrar
          </button>
        </form>
      </section>
    </main>
  );
}
