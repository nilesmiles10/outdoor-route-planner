"use client";

// Destructive-action button: plain confirm() by default, typed confirmation
// (retype the expected phrase) for the truly irreversible ones.
export default function ConfirmButton({
  label,
  message,
  typed,
  className,
}: {
  label: string;
  message: string;
  typed?: string; // when set, the user must type this exact string
  className?: string;
}) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (typed) {
          const v = window.prompt(`${message}\n\nType "${typed}" to confirm:`);
          if (v !== typed) e.preventDefault();
        } else if (!window.confirm(message)) {
          e.preventDefault();
        }
      }}
      className={
        className ??
        "rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
      }
    >
      {label}
    </button>
  );
}
