export default function BillingPage() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-[16px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-5 py-6">
        <h1 className="text-[20px] font-semibold text-white">Billing</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-[rgba(255,255,255,0.70)]">
          Paid plans are not available yet. Your workspace stays free while we finish checkout
          and subscription management.
        </p>
      </div>
    </div>
  );
}
