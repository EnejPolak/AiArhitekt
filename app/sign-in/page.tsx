import { SignInForm } from "@/components/pages/sign-in/SignInForm";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center pt-20">
      <SignInForm
        callbackError={params.error === "callback"}
        nextPath={params.next}
      />
    </main>
  );
}
