"use client";

import { ProjectTypeSelection } from "@/components/app/ProjectTypeSelection";
import { createProject } from "@/lib/projects/actions";
import * as React from "react";

export default function NewProjectPage() {
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    const result = await createProject();
    if (result && !result.ok) {
      setCreating(false);
      setError(result.message);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      {error ? (
        <p className="px-8 pt-6 text-sm text-[#E5484D]" role="alert">
          {error}
        </p>
      ) : null}
      <ProjectTypeSelection
        creating={creating}
        onCreate={() => void handleCreate()}
      />
    </div>
  );
}
