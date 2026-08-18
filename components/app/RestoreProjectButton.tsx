"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { restoreProject } from "@/lib/projects/actions";
import { Button } from "@/components/ui/Button";

export function RestoreProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  return (
    <div>
      <Button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await restoreProject({ projectId });
          if (!result.ok) {
            setError(result.message);
            setPending(false);
            return;
          }
          router.refresh();
        }}
      >
        {pending ? "Restoring…" : "Restore project"}
      </Button>
      {error ? (
        <p className="mt-3 text-sm text-[#E5484D]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
