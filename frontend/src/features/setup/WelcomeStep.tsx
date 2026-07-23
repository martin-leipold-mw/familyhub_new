export function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col gap-6 text-white text-center">
      <h1 className="text-3xl font-bold">Willkommen bei FamilyHub</h1>
      <p className="text-lg">
        Dein digitales Familien-Dashboard. Deine Daten bleiben auf deinem eigenen Server.
      </p>
      <button
        type="button"
        onClick={onNext}
        className="mx-auto rounded-xl bg-blue-500 px-6 py-3 min-h-[44px] text-white"
      >
        Los geht&apos;s →
      </button>
    </div>
  )
}
