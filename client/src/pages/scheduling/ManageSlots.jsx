// [S1] ManageSlots: Instructor creates/edits/deletes slots (#8)
import PageHeader from '@/components/PageHeader';

export default function ManageSlots() {
  return (
    <>
      <PageHeader eyebrow="Your week" title="My slots" description="Create, edit, cancel or delete your office-hour slots." />
      <div className="todo stack">
        <span className="hand">S1 builds this page next</span>
        <p className="muted">API: getSlots, createSlot, updateSlot, deleteSlot, getHolidays (api/scheduling.js)</p>
      </div>
    </>
  );
}
