export default function ProjectNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h2 className="mb-2 text-[20px] font-semibold text-white">
          Project not found
        </h2>
        <p className="text-[14px] text-[rgba(255,255,255,0.60)]">
          This project does not exist or is not available.
        </p>
      </div>
    </div>
  );
}
