'use client';

export default function ConfirmDelete() {
  return (
    <button type="submit" className="btn btn-secondary text-red-600" onClick={(e) => { if (!window.confirm('Delete this lead permanently?')) e.preventDefault(); }}>
      Delete lead
    </button>
  );
}
